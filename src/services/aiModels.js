// Per-user model catalog for the admin panel: OpenAI is always the primary
// provider, Vertex (Gemini) is always the fallback used if OpenAI fails.
// Admins pick one model for each independently. Both lists are static —
// availability is whatever the project/region actually supports at request time.

export const OPENAI_MODELS = [
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'gpt-4o-mini', label: 'GPT-4o mini' },
  { value: 'gpt-4.1', label: 'GPT-4.1' },
  { value: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
];

export const VERTEX_MODELS = [
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
  return !value || VERTEX_MODELS.some((m) => m.value === value);
}

export function getAvailableModels() {
  return {
    openai: [DEFAULT_OPTION, ...OPENAI_MODELS],
    vertex: [DEFAULT_OPTION, ...VERTEX_MODELS],
  };
}
