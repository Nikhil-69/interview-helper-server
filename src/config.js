import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT || 4000),
  mongodbUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/interview_helper',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiBaseUrl: process.env.OPENAI_BASE_URL || undefined,
  // Base default model, used only when neither a per-user override nor the
  // global ai_model admin setting (stored in Mongo) is set.
  openaiModel: process.env.OPENAI_MODEL || '',
  openaiMaxTokens: process.env.OPENAI_MAX_TOKENS ? Number(process.env.OPENAI_MAX_TOKENS) : undefined,
  vertexProjectId: process.env.VERTEX_PROJECT_ID || '',
  vertexLocation: process.env.VERTEX_LOCATION || 'global',
  vertexModel: process.env.VERTEX_MODEL || 'gemini-2.5-pro',
  vertexApiEndpoint: process.env.VERTEX_API_ENDPOINT || 'aiplatform.googleapis.com',
  // Either a path to a service-account JSON file (local dev) or the raw/base64
  // JSON contents (for platforms like Vercel where only env vars are available).
  vertexKeyFile: process.env.VERTEX_KEY_FILE || './credentials/vertex-service-account.json',
  vertexServiceAccountJson: process.env.VERTEX_SERVICE_ACCOUNT_JSON || '',
  // Razorpay (payments). Leave unset to fall back to the mock gateway in dev.
  razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || '',
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
};
