#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "${repo_root}"

node - "${1:-}" <<'NODE'
const fs = require('fs');
const path = require('path');

const jsonMode = process.argv[2] === '--json';

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const text = fs.readFileSync(filePath, 'utf8');
  const out = {};

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      continue;
    }

    const key = match[1];
    let value = match[2].trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    out[key] = value;
  }

  return out;
}

function pickValue(env, keys) {
  for (const key of keys) {
    const value = env[key];
    if (typeof value === 'string' && value.trim()) {
      return { key, value: value.trim() };
    }
  }
  return null;
}

function toTarget(raw) {
  try {
    const url = new URL(raw);
    return {
      host: url.hostname || '(empty)',
      port: url.port || '5432',
      database: (url.pathname || '').replace(/^\//, '') || '(empty)',
      sslmode: url.searchParams.get('sslmode') || null,
    };
  } catch {
    return null;
  }
}

const fileEnv = {
  ...parseEnvFile(path.join(process.cwd(), '.env')),
  ...parseEnvFile(path.join(process.cwd(), '.env.local')),
};

const mergedEnv = {
  ...fileEnv,
  ...process.env,
};

const runtime = pickValue(mergedEnv, [
  'TREND_API_POSTGRES_URL',
  'POSTGRES_URL',
  'DATABASE_URL',
]);

const nonPooling = pickValue(mergedEnv, [
  'TREND_API_POSTGRES_URL_NON_POOLING',
  'POSTGRES_URL_NON_POOLING',
]);

const result = {
  runtime: runtime
    ? {
        key: runtime.key,
        target: toTarget(runtime.value),
      }
    : null,
  nonPooling: nonPooling
    ? {
        key: nonPooling.key,
        target: toTarget(nonPooling.value),
      }
    : null,
};

if (jsonMode) {
  console.log(JSON.stringify(result));
  process.exit(0);
}

function printTarget(label, payload) {
  if (!payload) {
    console.log(`${label}: missing`);
    return;
  }

  if (!payload.target) {
    console.log(`${label}: invalid URL from ${payload.key}`);
    return;
  }

  const { host, port, database, sslmode } = payload.target;
  console.log(`${label}: ${host}:${port}/${database} (source=${payload.key}, sslmode=${sslmode || 'unset'})`);
}

printTarget('runtime', result.runtime);
printTarget('non_pooling', result.nonPooling);

if (result.runtime?.target && result.nonPooling?.target) {
  const same =
    result.runtime.target.host === result.nonPooling.target.host &&
    result.runtime.target.database === result.nonPooling.target.database;

  console.log(`aligned: ${same ? 'yes' : 'no'}`);
}
NODE
