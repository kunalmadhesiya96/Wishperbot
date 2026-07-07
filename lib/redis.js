import { Redis } from "@upstash/redis";

// Upstash Redis ka use isliye kar rahe hain kyunki Vercel serverless functions
// stateless hote hain — har request ke beech memory yaad nahi rehti.
// Isliye username -> user_id mapping aur whisper messages ko yahan store karte hain.
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});
