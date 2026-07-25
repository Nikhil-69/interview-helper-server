import OpenAI from 'openai';
import { config } from '../config.js';
import { getSettings, modeModelKey, modeMaxTokensKey, modeHistoryLimitKey, modeHistoryImagesKey, modeReasoningKey } from '../db.js';
import { askVertex } from './vertexWrapper.js';
import { buildSystemMessage } from './prompts.js';

let client = null;
function getClient() {
  if (!config.kimiApiKey) {
    const err = new Error('KIMI_API_KEY is not configured on the server');
    err.code = 'AI_NOT_CONFIGURED';
    throw err;
  }
  // Kimi (Moonshot AI) exposes an OpenAI-compatible chat-completions API.
  if (!client) client = new OpenAI({ apiKey: config.kimiApiKey, baseURL: config.kimiBaseUrl });
  return client;
}

// Kimi rejects messages with empty content ("must not be empty"), and the app
// sends image-only turns as empty text in history. Substitute a placeholder so
// a screenshot-first conversation doesn't 400 from the second message onward.
function fillEmptyHistoryContent(history) {
  return history.map((msg) => {
    const empty =
      msg?.content == null ||
      (typeof msg.content === 'string' && !msg.content.trim()) ||
      (Array.isArray(msg.content) && !msg.content.length);
    return empty ? { ...msg, content: '[screenshot]' } : msg;
  });
}

// History messages may be multimodal (arrays with image_url parts from past
// vision turns). Every resent image costs ~1k+ input tokens, so keep only the
// newest `maxImages` and replace older ones with a cheap text placeholder.
function trimHistoryImages(history, maxImages) {
  let budget = maxImages;
  const out = new Array(history.length);
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (!Array.isArray(msg?.content)) {
      out[i] = msg;
      continue;
    }
    const parts = msg.content.map((part) => {
      if (part?.type !== 'image_url') return part;
      if (budget > 0) {
        budget -= 1;
        return part;
      }
      return { type: 'text', text: '[image omitted]' };
    });
    out[i] = { ...msg, content: parts };
  }
  return out;
}

async function askKimi({ systemMessage, history, question, images, model, maxTokens, reasoning }) {
  const messages = [{ role: 'system', content: systemMessage }, ...history];

  const userContent = [];
  if (question) userContent.push({ type: 'text', text: question });
  for (const url of images) userContent.push({ type: 'image_url', image_url: { url } });
  messages.push({ role: 'user', content: userContent });

  const response = await getClient().chat.completions.create({
    model,
    messages,
    max_tokens: maxTokens,
    // Only sent when an admin set a level; thinking-capable models otherwise
    // run at the provider default. 'none' disables reasoning.
    ...(reasoning ? { reasoning_effort: reasoning } : {}),
  });

  return {
    answer: response.choices[0].message.content || '',
    model,
    promptTokens: response.usage?.prompt_tokens ?? null,
    completionTokens: response.usage?.completion_tokens ?? null,
  };
}

/**
 * Wrapper around the AI provider. Same contract the desktop app used locally:
 * context + history + question (+ optional base64 images) -> answer text.
 * Kimi (Moonshot AI) is always the primary provider; Vertex (Gemini) is the
 * fallback used automatically if Kimi fails or isn't configured.
 * Model precedence (per provider): the requesting user's per-user override
 * (set from the admin panel) > the mode's model from the admin "mode vs model"
 * table (mode_model_<mode> setting) > the global admin setting/env default.
 */
export async function askAI({
  context,
  history = [],
  question = '',
  images = [],
  promptMode = '',
  customPrompt = '',
  preferredKimiModel = '',
  preferredVertexModel = '',
}) {
  const settings = await getSettings();
  const modeModel = promptMode ? settings[modeModelKey(promptMode)] : '';
  // settings always include SETTING_DEFAULTS, so ai_model is never empty.
  const model = preferredKimiModel || modeModel || settings.ai_model;

  // Cost-saving limits from the per-mode table; a mode's empty value falls
  // through to the global ai_max_tokens / ai_history_limit setting.
  const modeMaxTokens = promptMode ? Number(settings[modeMaxTokensKey(promptMode)]) || 0 : 0;
  const maxTokens = config.kimiMaxTokens
    ?? (modeMaxTokens > 0 ? modeMaxTokens : Number(settings.ai_max_tokens) || 1000);
  const modeHistoryLimit = promptMode ? Number(settings[modeHistoryLimitKey(promptMode)]) || 0 : 0;
  const historyLimit = modeHistoryLimit > 0 ? modeHistoryLimit : Number(settings.ai_history_limit) || 0;
  if (historyLimit > 0 && history.length > historyLimit) history = history.slice(-historyLimit);
  history = fillEmptyHistoryContent(history);

  // Image budget for history ('' = use global; '0' is a valid "strip all").
  const modeImagesRaw = promptMode ? settings[modeHistoryImagesKey(promptMode)] : '';
  const historyImages = modeImagesRaw !== '' && modeImagesRaw !== undefined
    ? Number(modeImagesRaw) || 0
    : Number(settings.ai_history_images) || 0;
  history = trimHistoryImages(history, historyImages);

  // Reasoning level: per-mode row, else global ai_reasoning, else provider default.
  const modeReasoning = promptMode ? settings[modeReasoningKey(promptMode)] : '';
  const reasoning = modeReasoning || settings.ai_reasoning || '';

  const systemMessage = buildSystemMessage({ mode: promptMode, customPrompt, context });

  try {
    return await askKimi({ systemMessage, history, question, images, model, maxTokens, reasoning });
  } catch (primaryErr) {
    if (primaryErr.code === 'AI_NOT_CONFIGURED') {
      // No primary provider configured at all — go straight to Vertex.
    } else {
      console.error('Primary AI provider failed, falling back to Vertex AI:', primaryErr.message);
    }
    return await askVertex({ systemMessage, history, question, images, model: preferredVertexModel || undefined, reasoning });
  }
}
