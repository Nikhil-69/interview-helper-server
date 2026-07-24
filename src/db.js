import mongoose from 'mongoose';
import { config } from './config.js';
import { Setting } from './models.js';

// Cache the connection promise on globalThis so warm serverless invocations
// (Vercel) reuse it instead of opening a new connection per request.
const cached = globalThis.__mongoose ?? (globalThis.__mongoose = { promise: null });

export function connectDB() {
  if (!cached.promise) {
    cached.promise = mongoose.connect(config.mongodbUri, {
      maxPoolSize: Number(process.env.DB_POOL_SIZE || (process.env.VERCEL ? 5 : 10)),
    });
  }
  return cached.promise;
}

export const SETTING_DEFAULTS = {
  credit_cost_text: '1',
  credit_cost_vision: '2',
  signup_bonus_credits: '10',
  ai_model: 'gpt-4o',
  ai_max_tokens: '1000',
};

export async function getSetting(key, fallback = null) {
  const doc = await Setting.findOne({ key }).lean();
  return doc ? doc.value : (SETTING_DEFAULTS[key] ?? fallback);
}

export async function getSettings() {
  const docs = await Setting.find().lean();
  return { ...SETTING_DEFAULTS, ...Object.fromEntries(docs.map((d) => [d.key, d.value])) };
}
