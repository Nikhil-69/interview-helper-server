import fs from 'node:fs';
import { VertexAI } from '@google-cloud/vertexai';
import { config } from '../config.js';

let vertexAI = null;
const modelCache = new Map();

function loadCredentials() {
  if (config.vertexServiceAccountJson) {
    const raw = config.vertexServiceAccountJson.trim().startsWith('{')
      ? config.vertexServiceAccountJson
      : Buffer.from(config.vertexServiceAccountJson, 'base64').toString('utf8');
    return JSON.parse(raw);
  }
  if (config.vertexKeyFile && fs.existsSync(config.vertexKeyFile)) {
    return JSON.parse(fs.readFileSync(config.vertexKeyFile, 'utf8'));
  }
  return null;
}

function getClient() {
  if (vertexAI) return vertexAI;

  if (!config.vertexProjectId) {
    const err = new Error('VERTEX_PROJECT_ID is not configured on the server');
    err.code = 'VERTEX_NOT_CONFIGURED';
    throw err;
  }
  const credentials = loadCredentials();
  if (!credentials) {
    const err = new Error('No Vertex AI service-account credentials found (VERTEX_SERVICE_ACCOUNT_JSON or VERTEX_KEY_FILE)');
    err.code = 'VERTEX_NOT_CONFIGURED';
    throw err;
  }

  vertexAI = new VertexAI({
    project: config.vertexProjectId,
    location: config.vertexLocation,
    apiEndpoint: config.vertexApiEndpoint,
    googleAuthOptions: { credentials },
  });
  return vertexAI;
}

function getModel(modelName) {
  const name = modelName || config.vertexModel;
  if (modelCache.has(name)) return modelCache.get(name);
  const model = getClient().getGenerativeModel({ model: name });
  modelCache.set(name, model);
  return model;
}

function dataUrlToInlinePart(dataUrl) {
  const match = /^data:(.+?);base64,(.+)$/.exec(dataUrl || '');
  if (!match) return null;
  return { inlineData: { mimeType: match[1], data: match[2] } };
}

/**
 * Vertex AI (Gemini) fallback provider — same contract as askAI in kimiWrapper.js:
 * systemMessage + history + question (+ optional base64 image data URLs) -> answer text.
 */
// Reasoning level → Gemini thinking budget (tokens). 0 disables thinking on
// models that allow it; unset = model default (auto).
const THINKING_BUDGETS = { none: 0, low: 1024, medium: 4096, high: 8192, max: 16384 };

export async function askVertex({ systemMessage, history = [], question = '', images = [], model, reasoning = '' }) {
  // History content may be multimodal arrays; keep the text parts and mark images.
  const contentText = (c) =>
    typeof c === 'string'
      ? c
      : Array.isArray(c)
        ? c.map((p) => (p?.type === 'image_url' ? '[image]' : p?.text || '')).filter(Boolean).join(' ')
        : '';
  const historyText = history
    .map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${contentText(m.content)}`)
    .join('\n');

  const parts = [{ text: `${systemMessage}\n\n${historyText}\n\nUser: ${question}` }];
  for (const img of images) {
    const imagePart = dataUrlToInlinePart(img);
    if (imagePart) parts.push(imagePart);
  }

  const modelName = model || config.vertexModel;
  let thinkingBudget = THINKING_BUDGETS[reasoning];
  // Gemini Pro models can't disable thinking — their minimum budget is 128.
  if (thinkingBudget === 0 && /pro/i.test(modelName)) thinkingBudget = 128;
  const result = await getModel(modelName).generateContent({
    contents: [{ role: 'user', parts }],
    ...(thinkingBudget !== undefined
      ? { generationConfig: { thinkingConfig: { thinkingBudget } } }
      : {}),
  });
  const response = result.response;
  const answer = response.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';

  return {
    answer,
    model: modelName,
    promptTokens: response.usageMetadata?.promptTokenCount ?? null,
    completionTokens: response.usageMetadata?.candidatesTokenCount ?? null,
  };
}
