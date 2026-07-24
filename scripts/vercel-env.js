// View or update Vercel production env vars, including their actual values.
// (`vercel env ls` only shows names; Vercel's decrypt-on-list API silently no-ops,
// so reading values goes through `vercel env pull` instead, which does decrypt.)
//
// Usage:
//   node scripts/vercel-env.js list                  # show all name=value pairs
//   node scripts/vercel-env.js get KEY                # show one value
//   node scripts/vercel-env.js set KEY VALUE          # create or replace a value
//   node scripts/vercel-env.js rm KEY                 # delete a var
//
// Reads the Vercel CLI's own auth token (~/.local/share/com.vercel.cli/auth.json)
// and this project's linked projectId/orgId (.vercel/project.json) — no extra
// setup needed beyond having run `vercel login` / `vercel link` once.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const TARGET = 'production';
// Vars Vercel injects automatically on every pull — not ones we manage.
const VERCEL_BUILTINS = /^(VERCEL|NX_|TURBO_|CI$)/;

function getToken() {
  const authPath = path.join(os.homedir(), '.local/share/com.vercel.cli/auth.json');
  const { token } = JSON.parse(fs.readFileSync(authPath, 'utf8'));
  return token;
}

function getProject() {
  const projectPath = path.join(process.cwd(), '.vercel/project.json');
  return JSON.parse(fs.readFileSync(projectPath, 'utf8'));
}

async function api(pathSuffix, options = {}) {
  const token = getToken();
  const res = await fetch(`https://api.vercel.com${pathSuffix}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...options.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Vercel API ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

async function listEnvIds() {
  const { projectId, orgId } = getProject();
  const { envs } = await api(`/v10/projects/${projectId}/env?teamId=${orgId}`);
  return envs.filter((e) => e.target?.includes(TARGET));
}

function pullValues() {
  const tmpFile = path.join(os.tmpdir(), `vercel-env-pull-${process.pid}.env`);
  try {
    execFileSync('npx', ['vercel', 'env', 'pull', tmpFile, '--environment=production', '--yes'], {
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    const contents = fs.readFileSync(tmpFile, 'utf8');
    const values = {};
    for (const line of contents.split('\n')) {
      const match = /^([A-Za-z_][A-Za-z0-9_]*)="(.*)"$/.exec(line);
      if (!match) continue;
      const [, key, value] = match;
      if (VERCEL_BUILTINS.test(key)) continue;
      values[key] = value.replace(/\\n/g, '\n').replace(/\\"/g, '"');
    }
    return values;
  } finally {
    fs.rmSync(tmpFile, { force: true });
  }
}

function cmdList() {
  const values = pullValues();
  for (const [key, value] of Object.entries(values)) console.log(`${key}=${value}`);
}

function cmdGet(key) {
  const values = pullValues();
  if (!(key in values)) {
    console.error(`Not set: ${key}`);
    process.exit(1);
  }
  console.log(values[key]);
}

async function cmdSet(key, value) {
  const { projectId, orgId } = getProject();
  const envs = await listEnvIds();
  const existing = envs.find((e) => e.key === key);
  if (existing) {
    await api(`/v9/projects/${projectId}/env/${existing.id}?teamId=${orgId}`, { method: 'DELETE' });
  }
  // type: 'encrypted' (not 'sensitive') so values stay readable back via this script later.
  await api(`/v10/projects/${projectId}/env?teamId=${orgId}`, {
    method: 'POST',
    body: JSON.stringify({ key, value, target: [TARGET], type: 'encrypted' }),
  });
  console.log(`${existing ? 'Updated' : 'Created'} ${key} (production). Redeploy for it to take effect.`);
}

async function cmdRm(key) {
  const { projectId, orgId } = getProject();
  const envs = await listEnvIds();
  const existing = envs.find((e) => e.key === key);
  if (!existing) {
    console.error(`Not set: ${key}`);
    process.exit(1);
  }
  await api(`/v9/projects/${projectId}/env/${existing.id}?teamId=${orgId}`, { method: 'DELETE' });
  console.log(`Removed ${key} (production). Redeploy for it to take effect.`);
}

const [, , cmd, a, b] = process.argv;
try {
  if (cmd === 'list') cmdList();
  else if (cmd === 'get' && a) cmdGet(a);
  else if (cmd === 'set' && a && b !== undefined) await cmdSet(a, b);
  else if (cmd === 'rm' && a) await cmdRm(a);
  else {
    console.log('Usage: node scripts/vercel-env.js <list|get KEY|set KEY VALUE|rm KEY>');
    process.exit(1);
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
