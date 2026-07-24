import OpenAI from 'openai';
import { config } from '../config.js';
import { getSettings } from '../db.js';
import { askVertex } from './vertexWrapper.js';

let client = null;
function getClient() {
  if (!config.openaiApiKey) {
    const err = new Error('OPENAI_API_KEY is not configured on the server');
    err.code = 'AI_NOT_CONFIGURED';
    throw err;
  }
  if (!client) client = new OpenAI({ apiKey: config.openaiApiKey, baseURL: config.openaiBaseUrl });
  return client;
}

async function askOpenAI({ context, history, question, imageSrc, model, maxTokens }) {
  const systemMessage = `You are an expert interview copilot.
Your goal is to help the user answer questions based on the provided context.
Keep your answers concise, accurate, and directly address the user's prompt.
Here is the pre-meeting context:\n\n${context || ''}`;

  const messages = [{ role: 'system', content: systemMessage }, ...history];

  const userContent = [];
  if (question) userContent.push({ type: 'text', text: question });
  if (imageSrc) userContent.push({ type: 'image_url', image_url: { url: imageSrc } });
  messages.push({ role: 'user', content: userContent });

  const response = await getClient().chat.completions.create({
    model,
    messages,
    max_tokens: maxTokens,
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
 * context + history + question (+ optional base64 image) -> answer text.
 * Falls back to Vertex AI (Gemini) if the primary OpenAI-compatible provider fails.
 */
export async function askAI({ context, history = [], question = '', imageSrc = null }) {
  const settings = await getSettings();
  const model = config.openaiModel || settings.ai_model || 'gpt-4o';
  const maxTokens = config.openaiMaxTokens ?? Number(settings.ai_max_tokens || 1000);

  try {
    return await askOpenAI({ context, history, question, imageSrc, model, maxTokens });
  } catch (primaryErr) {
    if (primaryErr.code === 'AI_NOT_CONFIGURED') {
      // No primary provider configured at all — go straight to Vertex.
    } else {
      console.error('Primary AI provider failed, falling back to Vertex AI:', primaryErr.message);
    }
    return await askVertex({ context, history, question, imageSrc });
  }
}
