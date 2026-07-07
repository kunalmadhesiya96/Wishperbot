import { Telegraf } from "telegraf";
import { randomUUID } from "crypto";
import { redis } from "../lib/redis.js";

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error("BOT_TOKEN environment variable missing!");
}

const bot = new Telegraf(BOT_TOKEN);

// Format: @username message  |  @username 5s message  |  123456789 message  |  123456789 10s message
const WHISPER_REGEX =
  /^(@[a-zA-Z0-9_]{4,32}|\d{5,15})\s+(?:(\d{1,4})s\s+)?([\s\S]+)$/i;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Telegram ke answerCbQuery (alert popup) ki limit sirf 200 characters hai.
// Isse zyada lambe message DM ke through bheje jayenge.
const ALERT_SAFE_LIMIT = 200;

// Ek function ke andar zyada der tak setTimeout se rokna Vercel ke plan ki
// max function duration se bandha hua hai, isliye ek safe upper cap rakha hai.
const MAX_TIMER_SECONDS = 55;

async function rememberUser(from) {
  if (!from || !from.username) return;
  try {
    await redis.set(`uname:${from.username.toLowerCase()}`, from.id);
  } catch (err) {
    console.error("redis set (rememberUser) error:", err);
  }
}

async function saveWhisper(id, record, ttlSeconds = 60 * 60 * 24) {
  await redis.set(`wsp:${id}`, JSON.stringify(record), { ex: ttlSeconds });
}

async function loadWhisper(id) {
  const raw = await redis.get(`wsp:${id}`);
  if (!raw) return null;
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

bot.start(async (ctx) => {
  await rememberUser(ctx.from);
  await ctx.reply(
    "👋 *Whisper Bot* mein swagat hai!\n\n" +
      "Group ya DM kahin bhi ye format likho:\n\n" +
      "`@username tumhara secret message`\n" +
      "`@username 5s tumhara secret message`  (5 second baad message gayab)\n" +
      "`123456789 message`  (username ki jagah user ID bhi chalega)\n" +
      "`123456789 10s message`\n\n" +
      "Agar time (Ns) nahi likhoge to message *permanent* rahega, jab tak koi ❌ *Band karo* button na dabaye.\n\n" +
      "⚠️ Zaroori: jis user ko whisper bhejna hai, use pehle is bot ko ek baar `/start` karna hoga ya isi group mein koi bhi message bhejna hoga — tabhi bot uska naam/ID resolve kar payega.",
    { parse_mode: "Markdown" }
  );
});

bot.on("message", async (ctx) => {
  await rememberUser(ctx.from);

  const text = ctx.message.text;
  if (!text) return;

  const match = text.match(WHISPER_REGEX);
  if (!match) return; // normal message, ignore

  const [, rawTarget, durationStr, whisperTextRaw] = match;
  const whisperText = whisperTextRaw.trim();
  const sender = ctx.from;
  const chatId = ctx.chat.id;

  // --- Target resolve karo (username ya numeric ID) ---
  let targetId;
  if (/^\d+$/.test(rawTarget)) {
    targetId = Number(rawTarget);
  } else {
    const uname = rawTarget.slice(1).toLowerCase();
    const stored = await redis.get(`uname:${uname}`);
    if (!stored) {
      await ctx.reply(
        `⚠️ @${uname} ko resolve nahi kar paya.\nUnhe pehle is bot ko /start karna hoga (DM mein), ya is group mein koi bhi ek message bhejna hoga. Uske baad dobara try karo.`
      );
      return;
    }
    targetId = Number(stored);
  }

  // --- Original message delete karo taaki plain text kabhi na dikhe ---
  try {
    await ctx.deleteMessage(ctx.message.message_id);
  } catch (err) {
    // Bot ke paas group mein delete permission nahi hai to ignore kar do
  }

  const id = randomUUID();
  const record = {
    text: whisperText,
    targetId,
    senderId: sender.id,
    chatId,
  };
  await saveWhisper(id, record);

  const sentMsg = await ctx.reply("🔒 Ek whisper message aaya hai.", {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "👁 Message dekho", callback_data: `view:${id}` },
          { text: "❌ Band karo", callback_data: `close:${id}` },
        ],
      ],
    },
  });

  record.tgMessageId = sentMsg.message_id;
  await saveWhisper(id, record);

  // --- Agar duration diya gaya hai, to utne second baad auto-delete ---
  if (durationStr) {
    const seconds = Math.min(Number(durationStr), MAX_TIMER_SECONDS);
    await sleep(seconds * 1000);
    try {
      await ctx.telegram.deleteMessage(chatId, sentMsg.message_id);
    } catch (err) {
      // Pehle se hi delete ho chuka ho sakta hai (❌ button se), ignore karo
    }
    await redis.del(`wsp:${id}`);
  }
});

bot.on("callback_query", async (ctx) => {
  await rememberUser(ctx.from);

  const data = ctx.callbackQuery.data || "";
  const [action, id] = data.split(":");
  if (!action || !id) return ctx.answerCbQuery();

  const record = await loadWhisper(id);
  if (!record) {
    return ctx.answerCbQuery(
      "⚠️ Ye whisper expire ho chuka hai ya pehle hi delete ho gaya hai.",
      { show_alert: true }
    );
  }

  if (action === "view") {
    if (ctx.from.id !== record.targetId) {
      return ctx.answerCbQuery("❌ Ye whisper aapke liye nahi hai.", {
        show_alert: true,
      });
    }

    if (record.text.length <= ALERT_SAFE_LIMIT) {
      return ctx.answerCbQuery(record.text, { show_alert: true });
    }

    // Lamba message hai — Telegram ka alert popup sirf 200 characters tak
    // support karta hai, isliye poora message DM mein bhejte hain.
    try {
      await ctx.telegram.sendMessage(
        record.targetId,
        `🔒 Whisper message:\n\n${record.text}`
      );
      return ctx.answerCbQuery(
        "📩 Message lamba hai, isliye aapke DM mein bhej diya gaya hai.",
        { show_alert: true }
      );
    } catch (err) {
      return ctx.answerCbQuery(
        "⚠️ Pehle bot ko apne DM mein /start karo, tabhi lamba whisper DM par bhej payenge.",
        { show_alert: true }
      );
    }
  }

  if (action === "close") {
    if (ctx.from.id !== record.senderId && ctx.from.id !== record.targetId) {
      return ctx.answerCbQuery(
        "❌ Sirf bhejne wala ya jisko whisper mila hai, wahi ise band kar sakta hai.",
        { show_alert: true }
      );
    }
    try {
      await ctx.telegram.deleteMessage(record.chatId, record.tgMessageId);
    } catch (err) {
      // already deleted
    }
    await redis.del(`wsp:${id}`);
    return ctx.answerCbQuery("✅ Message band kar diya gaya.");
  }

  return ctx.answerCbQuery();
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(200).send("Whisper bot webhook zinda hai ✅");
    return;
  }
  try {
    await bot.handleUpdate(req.body);
  } catch (err) {
    console.error("Webhook error:", err);
  }
  if (!res.writableEnded) {
    res.status(200).send("ok");
  }
}
