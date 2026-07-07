# Whisper Message Bot (Telegram) — Vercel Deploy Guide

Ye bot Node.js + Telegraf + Upstash Redis mein bana hai, jo Vercel Serverless
Functions par webhook ke through chalta hai.

## Kaise use hoga (Group ya DM dono mein)

```
@username tumhara secret message
@username 5s tumhara secret message      -> 5 second baad message gayab
123456789 tumhara secret message         -> username ki jagah user ID
123456789 10s tumhara secret message
```

- Time (`Ns`) nahi doge to message **permanent** rahega, jab tak koi
  ❌ **Band karo** button na dabaye.
- Bot jo message chat mein bhejta hai usmein sender ya target ka naam kahi
  nahi dikhta — sirf ek **👁 Message dekho** button dikhta hai.
- Sirf jisko whisper bheja gaya hai wahi button dabakar content dekh
  payega. Koi aur dabayega to usse "❌ Ye whisper aapke liye nahi hai" dikhega.

## Zaroori limitation (Telegram API ki wajah se)

Telegram ka popup alert (jab button dabate ho) sirf **200 characters** tak
support karta hai. Isliye:
- Agar whisper message 200 characters se chota hai → seedha popup mein dikh jayega.
- Agar bada hai → bot use target user ke **DM** mein bhej dega (isliye target
  user ko pehle bot ko `/start` karna zaroori hai, warna DM bhej nahi payega).

Isi wajah se, jis user ko whisper bhejna hai (chahe username se ya ID se),
use bot ko pehle ek baar `/start` karna hoga ya jis group mein whisper
bheja ja raha hai wahan kam se kam ek message bhejna hoga — tabhi bot uska
username → ID map bana pata hai (Telegram API seedhe kisi bhi @username ko
ID mein resolve karne nahi deta).

## Setup Steps

### 1. Bot banao
1. Telegram par [@BotFather](https://t.me/BotFather) kholo.
2. `/newbot` bhejo, naam aur username do. Token milega — ye `BOT_TOKEN` hai.
3. `/setprivacy` bhejo, apna bot chuno, phir **Disable** karo.
   (Isse bot group ke saare messages padh payega, sirf commands nahi.)
4. Agar group mein original whisper wala message delete karna hai to bot ko
   us group mein **Admin** banao (Delete Messages permission ke saath).

### 2. Upstash Redis banao (free)
1. https://upstash.com par account banao.
2. Ek naya **Redis Database** banao (region kahin bhi, REST API enabled).
3. Wahan se `UPSTASH_REDIS_REST_URL` aur `UPSTASH_REDIS_REST_TOKEN` copy karo.

### 3. Vercel par deploy karo
1. Is folder ko GitHub repo mein push karo.
2. https://vercel.com par jaake **New Project** > apna repo import karo.
3. Project Settings > **Environment Variables** mein ye 3 values daalo:
   - `BOT_TOKEN`
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
4. Deploy karo. Deploy hone ke baad tumhe ek URL milega jaise:
   `https://your-project.vercel.app`

### 4. Telegram ko batao ki webhook kahan hai
Deploy hone ke baad, apne terminal/browser se ye URL open karo (BOT_TOKEN
apna daalna):

```
https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://your-project.vercel.app/api/webhook
```

Response mein `"ok": true` aana chahiye — matlab bot live ho gaya.

### 5. Test karo
- Bot ko DM mein `/start` karo.
- Kisi group mein bot ko add karo (Admin banao agar delete permission chahiye).
- `@apna_username 3s Hi, ye ek secret message hai` bhejo aur dekho.

## Vercel plan ka ek dhyan rakhne wali baat

Jab tum time wala whisper (`5s`, `10s` waghera) bhejte ho, function usi
duration tak "wait" karta hai taaki auto-delete ho sake. Vercel ke
**Hobby (free)** plan mein function ka default max duration kam hota hai —
agar bade timers (jaise 30–55 second) reliably chalane hain to Vercel
**Pro** plan lena better rahega, ya `vercel.json` mein `maxDuration` apne
plan ke hisaab se adjust karo. Chhote timers (1s–10s jaisa tumne example
diya) Hobby plan par bhi aaram se chal jayenge.

## Files
- `api/webhook.js` — bot ka pura logic (yahi Telegram se updates receive karta hai)
- `lib/redis.js` — Upstash Redis connection
- `vercel.json` — function timeout config
- `.env.example` — env variables ka reference
