// Seeds the admin user (ADMIN_EMAIL/ADMIN_PASSWORD from .env) and default
// credit packages. Safe to re-run: skips anything that already exists.
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDB } from '../src/db.js';
import { User, CreditPackage } from '../src/models.js';

await connectDB();

const adminEmail = (process.env.ADMIN_EMAIL || 'admin@example.com').toLowerCase();
const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

const existing = await User.findOne({ email: adminEmail });
if (existing) {
  console.log(`Admin ${adminEmail} already exists (id ${existing._id}).`);
} else {
  const hash = await bcrypt.hash(adminPassword, 10);
  const admin = await User.create({ email: adminEmail, password_hash: hash, name: 'Admin', role: 'admin' });
  console.log(`Created admin ${adminEmail} (id ${admin._id}).`);
}

if ((await CreditPackage.countDocuments()) === 0) {
  await CreditPackage.create([
    { name: 'Starter', credits: 50, price: 199, currency: 'INR' },
    { name: 'Pro', credits: 150, price: 499, currency: 'INR' },
    { name: 'Power', credits: 400, price: 999, currency: 'INR' },
  ]);
  console.log('Seeded default credit packages.');
} else {
  console.log('Credit packages already present, skipping.');
}

await mongoose.disconnect();
