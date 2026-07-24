import fs from 'node:fs';
import { VertexAI } from '@google-cloud/vertexai';
import { config } from '../config.js';

let vertexModel = null;

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

function getModel() {
  if (vertexModel) return vertexModel;

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

  const vertexAI = new VertexAI({
    project: config.vertexProjectId,
    location: config.vertexLocation,
    apiEndpoint: config.vertexApiEndpoint,
    googleAuthOptions: { credentials },
  });
  vertexModel = vertexAI.getGenerativeModel({ model: config.vertexModel });
  return vertexModel;
}

function dataUrlToInlinePart(dataUrl) {
  const match = /^data:(.+?);base64,(.+)$/.exec(dataUrl || '');
  if (!match) return null;
  return { inlineData: { mimeType: match[1], data: match[2] } };
}

/**
 * Vertex AI (Gemini) fallback provider — same contract as askAI in openaiWrapper.js:
 * context + history + question (+ optional base64 image data URLs) -> answer text.
 */
export async function askVertex({ context, history = [], question = '', images = [] }) {
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

  const result = await getModel().generateContent({ contents: [{ role: 'user', parts }] });
  const response = result.response;
  const answer = response.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';

  return {
    answer,
    model: config.vertexModel,
    promptTokens: response.usageMetadata?.promptTokenCount ?? null,
    completionTokens: response.usageMetadata?.candidatesTokenCount ?? null,
  };
}
