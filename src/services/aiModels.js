// Per-user model catalog for the admin panel: Kimi (Moonshot AI) is always the
// primary provider, Vertex (Gemini) is always the fallback used if Kimi fails.
// Admins pick one model for each independently. Both lists are static —
// availability is whatever the account/region actually supports at request time.
// Note: the API/DB field is still named openai_model (Kimi's API is
// OpenAI-compatible and renaming would break existing users + the built admin UI).

export const KIMI_MODELS = [
  { value: 'kimi-k3', label: 'Kimi K3' },
  { value: 'kimi-k2.7-code', label: 'Kimi K2.7 Code' },
  { value: 'kimi-k2.6', label: 'Kimi K2.6' },
  { value: 'kimi-k2.5', label: 'Kimi K2.5' },
];

export const VERTEX_MODELS = [
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro Preview' },
  { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview' },
];

const DEFAULT_OPTION = { value: '', label: 'Default (global setting)' };

// Reasoning levels for thinking-capable models. '' = provider default.
// Sent as reasoning_effort to Kimi; mapped to a thinking budget on Vertex.
// Verified live against api.moonshot.ai: all levels accepted; kimi-k2.5/k2.6/
// k2.7-code think by default, kimi-k3 is thinking-only (default effort max).
export const REASONING_LEVELS = ['none', 'low', 'medium', 'high', 'max'];

export function isKnownReasoningLevel(value) {
  return !value || REASONING_LEVELS.includes(value);
}

export function isKnownKimiModel(value) {
  return !value || KIMI_MODELS.some((m) => m.value === value);
}

export function isKnownVertexModel(value) {
  return !value || VERTEX_MODELS.some((m) => m.value === value);
}

export function getAvailableModels() {
  return {
    openai: [DEFAULT_OPTION, ...KIMI_MODELS],
    vertex: [DEFAULT_OPTION, ...VERTEX_MODELS],
  };
}
