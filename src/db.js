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

// Per-prompt-mode "mode vs model" table. Each prompt mode gets three settings
// rows: mode_model_<mode> (Kimi model), mode_max_tokens_<mode> (output-token
// cap) and mode_history_limit_<mode> (messages of history kept per request).
// Empty string = fall through to the global ai_model / ai_max_tokens /
// ai_history_limit setting. Non-coding modes default to tight cost-saving
// limits since their answers are short by nature.
export function modeModelKey(mode) {
  return `mode_model_${mode}`;
}
export function modeMaxTokensKey(mode) {
  return `mode_max_tokens_${mode}`;
}
export function modeHistoryLimitKey(mode) {
  return `mode_history_limit_${mode}`;
}
export function modeHistoryImagesKey(mode) {
  return `mode_history_images_${mode}`;
}
export function modeReasoningKey(mode) {
  return `mode_reasoning_${mode}`;
}

const MODE_DEFAULTS_TABLE = {
  //                      model             maxTokens  historyLimit historyImages reasoning
  'coding-interview':    ['kimi-k3',        '',        '',          '',           'high'],
  'coding-oa':           ['kimi-k2.7-code', '',        '',          '',           ''],
  'coding-learning':     ['kimi-k2.7-code', '',        '',          '',           ''],
  'mcq-test':            ['kimi-k2.5',      '400',     '6',         '0',          'none'],
  'non-coding-learning': ['kimi-k2.5',      '400',     '6',         '0',          'none'],
  'non-mcq':             ['kimi-k2.5',      '400',     '6',         '0',          'none'],
  'mix':                 ['kimi-k3',        '',        '',          '',           ''],
  'custom':              ['',               '',        '',          '',           ''],
};

export const MODE_MODEL_DEFAULTS = Object.fromEntries(
  Object.entries(MODE_DEFAULTS_TABLE).flatMap(([mode, [model, maxTokens, historyLimit, historyImages, reasoning]]) => [
    [modeModelKey(mode), model],
    [modeMaxTokensKey(mode), maxTokens],
    [modeHistoryLimitKey(mode), historyLimit],
    [modeHistoryImagesKey(mode), historyImages],
    [modeReasoningKey(mode), reasoning],
  ])
);

export const SETTING_DEFAULTS = {
  credit_cost_text: '1',
  credit_cost_vision: '2',
  signup_bonus_credits: '10',
  ai_model: 'kimi-k2.5',
  ai_max_tokens: '1000',
  // Global history caps — per-mode rows above override them when set.
  // ai_history_limit: messages sent per request (0 = unlimited).
  // ai_history_images: images kept in history, newest first (older ones are
  // replaced with a text placeholder — each resent image costs ~1k+ tokens).
  ai_history_limit: '20',
  ai_history_images: '2',
  // Reasoning level sent to the provider ('' = provider default; none/low/
  // medium/high). Per-mode rows override. Reasoning tokens bill as output and
  // count against max_tokens, so keep it 'none' on tightly capped modes.
  ai_reasoning: '',
  ...MODE_MODEL_DEFAULTS,
};

export async function getSetting(key, fallback = null) {
  const doc = await Setting.findOne({ key }).lean();
  return doc ? doc.value : (SETTING_DEFAULTS[key] ?? fallback);
}

export async function getSettings() {
  const docs = await Setting.find().lean();
  return { ...SETTING_DEFAULTS, ...Object.fromEntries(docs.map((d) => [d.key, d.value])) };
}
