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
 * Cheaply verifies a Gemini model id is actually reachable with our service
 * account/project (countTokens does no generation, so it's ~free and fast).
 * Used to filter the admin model picker down to models our credentials support.
 */
export async function isVertexModelAvailable(modelName) {
  try {
    await getModel(modelName).countTokens({ contents: [{ role: 'user', parts: [{ text: 'ping' }] }] });
    return true;
  } catch {
    return false;
  }
}

/**
 * Vertex AI (Gemini) fallback provider — same contract as askAI in openaiWrapper.js:
 * context + history + question (+ optional base64 image data URLs) -> answer text.
 */
export async function askVertex({ context, history = [], question = '', images = [], model }) {
  const systemMessage = `You are an expert interview copilot.
Your goal is to help the user answer questions based on the provided context.
Keep your answers concise, accurate, and directly address the user's prompt.
Here is the pre-meeting context:\n\n${context || ''}`;

  const historyText = history
    .map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${typeof m.content === 'string' ? m.content : ''}`)
    .join('\n');

  const parts = [{ text: `${systemMessage}\n\n${historyText}\n\nUser: ${question}` }];
  for (const img of images) {
    const imagePart = dataUrlToInlinePart(img);
    if (imagePart) parts.push(imagePart);
  }

  const modelName = model || config.vertexModel;
  const result = await getModel(modelName).generateContent({ contents: [{ role: 'user', parts }] });
  const response = result.response;
  const answer = response.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';

  return {
    answer,
    model: modelName,
    promptTokens: response.usageMetadata?.promptTokenCount ?? null,
    completionTokens: response.usageMetadata?.candidatesTokenCount ?? null,
  };
}
