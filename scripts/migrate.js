// Applies sql/schema.sql. Needs a MySQL user allowed to CREATE DATABASE/USER
// (root for the local docker container): DB_ADMIN_USER / DB_ADMIN_PASSWORD.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = fs.readFileSync(path.join(__dirname, '..', 'sql', 'schema.sql'), 'utf8');

const conn = await mysql.createConnection({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_ADMIN_USER || 'root',
  password: process.env.DB_ADMIN_PASSWORD || 'password',
  multipleStatements: true,
});

await conn.query(sql);
await conn.end();
console.log('Schema applied.');
