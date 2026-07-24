import mysql from 'mysql2/promise';
import { config } from './config.js';

export const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true,
});

export async function getSetting(key, fallback = null) {
  const [rows] = await pool.query('SELECT `value` FROM settings WHERE `key` = ?', [key]);
  return rows.length ? rows[0].value : fallback;
}

export async function getSettings() {
  const [rows] = await pool.query('SELECT `key`, `value` FROM settings');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
