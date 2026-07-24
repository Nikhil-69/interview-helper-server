// Seeds the admin user (ADMIN_EMAIL/ADMIN_PASSWORD from .env) and default
// credit packages. Safe to re-run: skips anything that already exists.
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool } from '../src/db.js';

const adminEmail = (process.env.ADMIN_EMAIL || 'admin@example.com').toLowerCase();
const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [adminEmail]);
if (existing.length) {
  console.log(`Admin ${adminEmail} already exists (id ${existing[0].id}).`);
} else {
  const hash = await bcrypt.hash(adminPassword, 10);
  const [r] = await pool.query(
    "INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, 'Admin', 'admin')",
    [adminEmail, hash]
  );
  console.log(`Created admin ${adminEmail} (id ${r.insertId}).`);
}

const [pkgCount] = await pool.query('SELECT COUNT(*) AS c FROM credit_packages');
if (pkgCount[0].c === 0) {
  await pool.query(
    `INSERT INTO credit_packages (name, credits, price, currency) VALUES
     ('Starter', 50, 199.00, 'INR'),
     ('Pro', 150, 499.00, 'INR'),
     ('Power', 400, 999.00, 'INR')`
  );
  console.log('Seeded default credit packages.');
} else {
  console.log('Credit packages already present, skipping.');
}

await pool.end();
