// Per-user model catalog for the admin panel: OpenAI is always the primary
// provider, Vertex (Gemini) is always the fallback used if OpenAI fails.
// Admins pick one model for each independently.
import { isVertexModelAvailable } from './vertexWrapper.js';

// Always offered — OpenAI availability isn't gated per-project the way Vertex is.
export const OPENAI_MODELS = [
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'gpt-4o-mini', label: 'GPT-4o mini' },
  { value: 'gpt-4.1', label: 'GPT-4.1' },
  { value: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
];

// Candidates to probe against our Vertex project/credentials before listing —
// not every Gemini model is enabled/available for every project or region.
export const VERTEX_MODEL_CANDIDATES = [
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro Preview' },
  { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview' },
];

const DEFAULT_OPTION = { value: '', label: 'Default (global setting)' };

export function isKnownOpenAIModel(value) {
  return !value || OPENAI_MODELS.some((m) => m.value === value);
}

export function isKnownVertexModel(value) {
  return !value || VERTEX_MODEL_CANDIDATES.some((m) => m.value === value);
}

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache = { at: 0, vertexModels: null };

/**
 * The two dropdowns shown in the admin picker: OpenAI models are always
 * offered (not gated per-project), Vertex/Gemini candidates are probed live
 * against our project's credentials via countTokens and only listed if
 * reachable. Vertex results are cached briefly to avoid re-probing on every
 * page load.
 */
export async function getAvailableModels() {
  const now = Date.now();
  if (!cache.vertexModels || now - cache.at >= CACHE_TTL_MS) {
    const probed = await Promise.all(
      VERTEX_MODEL_CANDIDATES.map(async (m) => ({ ...m, available: await isVertexModelAvailable(m.value) }))
    );
    cache = { at: now, vertexModels: probed.filter((m) => m.available).map(({ available, ...m }) => m) };
  }

  return {
    openai: [DEFAULT_OPTION, ...OPENAI_MODELS],
    vertex: [DEFAULT_OPTION, ...cache.vertexModels],
  };
}
