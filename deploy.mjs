/**
 * Development deploy script — builds the card and forces HA to load the new version
 * by updating the resource URL's ?v= parameter via the HA REST API.
 *
 * Setup (one time):
 *   1. Create a Long-Lived Access Token in HA → Profile → Security
 *   2. Copy .env.example to .env and fill in HA_URL and HA_TOKEN
 *
 * Usage:
 *   npm run deploy   — build + bump URL (dev workflow)
 *   npm run bump     — bump URL only, no rebuild (after HACS update)
 */

import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';

// ── Load .env ─────────────────────────────────────────────────────────────────
if (existsSync('.env')) {
  const env = readFileSync('.env', 'utf8');
  for (const line of env.split('\n')) {
    const [key, ...rest] = line.trim().split('=');
    if (key && rest.length) process.env[key] = rest.join('=').trim();
  }
}

const HA_URL   = (process.env.HA_URL   || '').replace(/\/$/, '');
const HA_TOKEN = process.env.HA_TOKEN  || '';
const CARD_URL_PATTERN = 'electricity-panel-card.js';
const bumpOnly = process.argv.includes('--bump');

if (!HA_URL || !HA_TOKEN) {
  console.error('❌  Missing HA_URL or HA_TOKEN — create a .env file (see .env.example)');
  process.exit(1);
}

// ── Build (skipped with --bump) ───────────────────────────────────────────────
if (!bumpOnly) {
  console.log('🔨  Building...');
  execSync('npm run build', { stdio: 'inherit' });
} else {
  console.log('⏭️  Skipping build (--bump mode)');
}

// ── Find resource ID ──────────────────────────────────────────────────────────
const headers = {
  'Authorization': `Bearer ${HA_TOKEN}`,
  'Content-Type': 'application/json',
};

const res = await fetch(`${HA_URL}/api/lovelace/resources`, { headers });
if (!res.ok) {
  console.error(`❌  Cannot reach HA at ${HA_URL} — status ${res.status}`);
  process.exit(1);
}

const resources = await res.json();
const resource = resources.find(r => r.url.includes(CARD_URL_PATTERN));

if (!resource) {
  console.error(`❌  No resource found containing "${CARD_URL_PATTERN}"`);
  console.log('   Available resources:', resources.map(r => r.url).join('\n   '));
  process.exit(1);
}

// ── Bump URL with ?v=timestamp ────────────────────────────────────────────────
const baseUrl = resource.url.replace(/\?.*$/, '');
const newUrl  = `${baseUrl}?v=${Date.now()}`;

const update = await fetch(`${HA_URL}/api/lovelace/resources/${resource.id}`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({ res_type: 'module', url: newUrl }),
});

if (!update.ok) {
  console.error(`❌  Failed to update resource — status ${update.status}`);
  process.exit(1);
}

console.log(`✅  Resource updated: ${newUrl}`);
console.log('🔄  Reload your browser (F5 is now enough)');
