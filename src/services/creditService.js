import { User, CreditTransaction } from '../models.js';

/**
 * Atomically apply a signed credit change to a user and write the ledger row.
 * Debits filter on `credits_balance >= amount` inside a single findOneAndUpdate,
 * so concurrent requests can't double-spend.
 * Throws { code: 'INSUFFICIENT_CREDITS' } when a debit would go negative.
 */
export async function applyCreditChange(userId, amount, type, { referenceId = null, description = '' } = {}) {
  const filter = { _id: userId };
  if (amount < 0) filter.credits_balance = { $gte: -amount };

  const user = await User.findOneAndUpdate(filter, { $inc: { credits_balance: amount } }, { new: true });
  if (!user) {
    if (amount < 0 && (await User.exists({ _id: userId }))) {
      const err = new Error('Insufficient credits');
      err.code = 'INSUFFICIENT_CREDITS';
      throw err;
    }
    throw new Error('User not found');
  }

  const tx = await CreditTransaction.create({
    user_id: userId,
    type,
    amount,
    balance_after: user.credits_balance,
    reference_id: referenceId,
    description,
  });

  return { balance: user.credits_balance, transactionId: tx._id.toString() };
}
