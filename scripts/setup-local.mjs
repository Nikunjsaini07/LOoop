import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { parseEnv } from 'node:util';
import './sites-env.mjs';

const path = '.env.local';
let text = existsSync(path) ? readFileSync(path, 'utf8') : '';
const settings = parseEnv(text);
const secret = settings.READWELL_PROXY_SECRET || randomBytes(32).toString('hex');
for (const [key, value] of Object.entries({ READWELL_API_URL: 'http://127.0.0.1:8787', READWELL_PROXY_SECRET: secret })) {
  if (!settings[key]) text += `\n${key}=${value}\n`;
}
writeFileSync(path, text);
let workerText = existsSync('.dev.vars') ? readFileSync('.dev.vars', 'utf8') : '';
const workerSettings = parseEnv(workerText);
const workerValues = { READWELL_PROXY_SECRET: secret,
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: settings.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  CLERK_SECRET_KEY: settings.CLERK_SECRET_KEY,
  CLERK_AUTHORIZED_PARTIES: 'http://127.0.0.1:5173,http://localhost:5173' };
for (const [key, value] of Object.entries(workerValues)) {
  if (!value) continue;
  if (workerSettings[key] && workerSettings[key] !== value) throw new Error(`Local ${key} differs between .env.local and .dev.vars. Align the local files before continuing.`);
  if (!workerSettings[key]) workerText += `\n${key}=${JSON.stringify(value)}\n`;
}
writeFileSync('.dev.vars', workerText);
console.log('Local frontend/API connection prepared. Existing database and account settings retained. No secrets printed.');
