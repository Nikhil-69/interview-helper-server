import mongoose from 'mongoose';

const { Schema } = mongoose;

// Field names mirror the API's JSON contract (snake_case) so route responses
// stay byte-identical to what the admin SPA and desktop app already consume.

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password_hash: { type: String, required: true },
    name: { type: String, default: '' },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    status: { type: String, enum: ['active', 'blocked'], default: 'active' },
    credits_balance: { type: Number, default: 0 },
    // Per-user AI model overrides. Empty string = use the global setting.
    // openai_model holds the primary provider's model — now Kimi (Moonshot AI,
    // OpenAI-compatible); vertex_model is the fallback used if the primary fails.
    openai_model: { type: String, default: '' },
    vertex_model: { type: String, default: '' },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

// Every credit movement, signed. balance_after is the user's balance after this row.
const creditTransactionSchema = new Schema(
  {
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['signup_bonus', 'purchase', 'usage', 'admin_adjustment'], required: true },
    amount: { type: Number, required: true },
    balance_after: { type: Number, required: true },
    reference_id: { type: String, default: null },
    description: { type: String, default: '' },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } }
);

const creditPackageSchema = new Schema(
  {
    name: { type: String, required: true },
    credits: { type: Number, required: true },
    price: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    is_active: { type: Boolean, default: true },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } }
);

const orderSchema = new Schema(
  {
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    package_id: { type: Schema.Types.ObjectId, ref: 'CreditPackage', default: null },
    credits: { type: Number, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    gateway: { type: String, default: 'mock' },
    gateway_order_id: { type: String, default: null },
    gateway_payment_id: { type: String, default: null },
    status: { type: String, enum: ['pending', 'paid', 'failed'], default: 'pending' },
    paid_at: { type: Date, default: null },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } }
);

const aiRequestSchema = new Schema(
  {
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    request_type: { type: String, enum: ['text', 'vision'], required: true },
    model: { type: String, default: '' },
    credits_charged: { type: Number, default: 0 },
    status: { type: String, enum: ['success', 'failed'], required: true },
    error_message: { type: String, default: null },
    prompt_tokens: { type: Number, default: null },
    completion_tokens: { type: Number, default: null },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } }
);

const settingSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: String, required: true },
  },
  { timestamps: { createdAt: false, updatedAt: 'updated_at' } }
);

export const User = mongoose.model('User', userSchema);
export const CreditTransaction = mongoose.model('CreditTransaction', creditTransactionSchema);
export const CreditPackage = mongoose.model('CreditPackage', creditPackageSchema);
export const Order = mongoose.model('Order', orderSchema);
export const AiRequest = mongoose.model('AiRequest', aiRequestSchema);
export const Setting = mongoose.model('Setting', settingSchema);

// Response mappers — keep JSON shapes identical to the old MySQL API.
export const toUserJson = (u) => ({
  id: u._id.toString(),
  email: u.email,
  name: u.name,
  role: u.role,
  status: u.status,
  credits_balance: u.credits_balance,
  openai_model: u.openai_model || '',
  vertex_model: u.vertex_model || '',
  created_at: u.created_at,
});
