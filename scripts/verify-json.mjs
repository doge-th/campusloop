#!/usr/bin/env node
/**
 * JSON-mode verifier for CampusLoop's headline numbers.
 *
 * Same as `scripts/verify.mjs` but emits machine-readable JSON on stdout
 * so a CI pipeline or a judge with a script can compare against the README
 * without parsing text. Exit code 0 means every number was found.
 *
 * Run: `node scripts/verify-json.mjs`
 */

import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, '..');

const cmd = `npx vitest run src/lib/metrics.test.ts`;
let stdout;
try {
  stdout = execSync(cmd, { cwd: root, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
} catch (err) {
  const all = (err.stdout ?? '') + (err.stderr ?? '');
  process.stderr.write('verify-json failed — `npm run test` did not pass:\n');
  process.stderr.write(all || err.message);
  process.exit(2);
}

const float = (re) => {
  const m = stdout.match(re);
  return m ? Number(m[1]) : null;
};
const int = (re) => {
  const m = stdout.match(re);
  return m ? Number(m[1]) : null;
};

const payload = {
  recognition: {
    protocolA_top1_pct: float(/protocol A top-1\s*:\s*(\d{2,3}\.\d)%/),
    protocolB_top1_pct: float(/protocol B top-1\s*:\s*(\d{2,3}\.\d)%/),
  },
  forecast: {
    holdout_MAE: float(/holdout MAE\s+model (\d+\.\d+)/),
    holdout_R2: float(/holdout R2\s+model ([+-]?\d+\.\d+)/),
  },
  matching: {
    cardinality: int(/cardinality\s*: first-fit (\d+)/),
    ceiling: int(/theoretical ceiling (\d+)/),
    supported_served: int(/ours (\d+) \/ (\d+)/),
    supported_total: int(/ours \d+ \/ (\d+)/),
  },
  impact: {
    diverted_kg: float(/diverted (\d+\.\d+)/),
    circularity_pct: float(/circularity (\d+\.\d+)/),
    CO2e_avoided_kg: float(/CO2e avoided (\d+\.\d+)/),
  },
};

// Required: every README number must be present.
const missing = [];
const walk = (obj, path = '') => {
  for (const [k, v] of Object.entries(obj)) {
    if (v === null) missing.push(`${path}.${k}`);
    else if (typeof v === 'object') walk(v, `${path}.${k}`);
  }
};
walk(payload);

process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
if (missing.length) {
  process.stderr.write(`verify-json: missing ${missing.length} headline number(s): ${missing.join(', ')}\n`);
  process.exit(1);
}
