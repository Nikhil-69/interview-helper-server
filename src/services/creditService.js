import { pool } from '../db.js';

/**
 * Atomically apply a signed credit change to a user and write the ledger row.
 * Locks the user row so concurrent requests can't double-spend.
 * Throws { code: 'INSUFFICIENT_CREDITS' } when a debit would go negative.
 */
export async function applyCreditChange(userId, amount, type, { referenceId = null, description = '' } = {}) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      'SELECT credits_balance FROM users WHERE id = ? FOR UPDATE',
      [userId]
    );
    if (!rows.length) throw new Error('User not found');

    const newBalance = rows[0].credits_balance + amount;
    if (newBalance < 0) {
      const err = new Error('Insufficient credits');
      err.code = 'INSUFFICIENT_CREDITS';
      throw err;
    }

    await conn.query('UPDATE users SET credits_balance = ? WHERE id = ?', [newBalance, userId]);
    const [result] = await conn.query(
      `INSERT INTO credit_transactions (user_id, type, amount, balance_after, reference_id, description)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, type, amount, newBalance, referenceId, description]
    );

    await conn.commit();
    return { balance: newBalance, transactionId: result.insertId };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
