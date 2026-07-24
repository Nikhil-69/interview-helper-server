// Central catalog of models selectable per-user from the admin panel.
// `gemini*` model ids are routed straight to Vertex AI; everything else goes
// through the OpenAI-compatible wrapper (which still falls back to Vertex on failure).
import { isVertexModelAvailable } from './vertexWrapper.js';

// Always offered — OpenAI availability isn't gated per-project the way Vertex is.
export const OPENAI_MODELS = [
  { value: 'gpt-4o', label: 'GPT-4o (OpenAI)' },
  { value: 'gpt-4o-mini', label: 'GPT-4o mini (OpenAI)' },
  { value: 'gpt-4.1', label: 'GPT-4.1 (OpenAI)' },
  { value: 'gpt-4.1-mini', label: 'GPT-4.1 mini (OpenAI)' },
];

// Candidates to probe against our Vertex project/credentials before listing —
// not every Gemini model is enabled/available for every project or region.
export const VERTEX_MODEL_CANDIDATES = [
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (Vertex)' },
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Vertex)' },
  { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro Preview (Vertex)' },
  { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview (Vertex)' },
];

export const isGeminiModel = (model) => !!model && model.startsWith('gemini');

export function isKnownModelValue(value) {
  if (!value) return true;
  return OPENAI_MODELS.some((m) => m.value === value) || VERTEX_MODEL_CANDIDATES.some((m) => m.value === value);
}

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache = { at: 0, models: null };

/**
 * The list shown in the admin picker: OpenAI models are always offered (not
 * gated per-project), Vertex/Gemini candidates are probed live against our
 * project's credentials via countTokens and only listed if reachable.
 * Results are cached briefly to avoid re-probing Vertex on every page load.
 */
export async function getAvailableModels() {
  const now = Date.now();
  if (cache.models && now - cache.at < CACHE_TTL_MS) return cache.models;

  const probed = await Promise.all(
    VERTEX_MODEL_CANDIDATES.map(async (m) => ({ ...m, available: await isVertexModelAvailable(m.value) }))
  );
  const availableVertex = probed.filter((m) => m.available).map(({ available, ...m }) => m);

  const models = [
    { value: '', label: 'Default (global setting)' },
    ...OPENAI_MODELS,
    ...availableVertex,
  ];
  cache = { at: now, models };
  return models;
}
