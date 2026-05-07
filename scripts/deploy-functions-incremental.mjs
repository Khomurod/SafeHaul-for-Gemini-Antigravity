#!/usr/bin/env node
/**
 * Deploy only Cloud Functions affected by git changes (when safe).
 *
 * Rules:
 * - Compares DEPLOY_GIT_BASE..DEPLOY_GIT_HEAD (or GITHUB_PUSH_BEFORE + GITHUB_SHA) under functions/.
 * - Parses functions/index.js to map each export name → primary module file (direct require from index).
 * - If anything touches index.js, package files, firebaseAdmin.js, shared/, or firebase.json → full deploy.
 * - Ignores functions/test/** (tests are not deployed and must not trigger unmapped-file full deploy).
 * - If a changed file is not a known top-level module from index → full deploy (nested imports we didn't trace).
 * - Otherwise: single `firebase deploy --only functions:a,functions:b,...`
 *
 * Env:
 *   FIREBASE_PROJECT_ID (required)
 *   DEPLOY_GIT_BASE / DEPLOY_GIT_HEAD — optional explicit SHAs
 *   GITHUB_PUSH_BEFORE / GITHUB_SHA — set by CI on push
 *   DEPLOY_FUNCTIONS_FORCE_FULL=1 — skip incremental, deploy all (sequential script)
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, normalize } from 'path';
import { spawnSync } from 'child_process';

const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(root, '..');
const functionsDir = join(repoRoot, 'functions');
const indexPath = join(functionsDir, 'index.js');

const projectId = process.env.FIREBASE_PROJECT_ID;
if (!projectId) {
  console.error('FIREBASE_PROJECT_ID is required.');
  process.exit(1);
}

/** Normalize ./foo or ./integrations/bar → functions/foo.js */
function modulePathToFile(rel) {
  let n = rel.replace(/^\.\//, '');
  if (!n.endsWith('.js')) n += '.js';
  return normalize(join('functions', n)).replace(/\\/g, '/');
}

/**
 * Parse functions/index.js: export name → functions/relative path of top-level module.
 */
function buildExportToFile() {
  const src = readFileSync(indexPath, 'utf8');
  const varToFile = new Map();

  const reRequire = /(?:const|let|var)\s+(\w+)\s*=\s*require\(['"](\.\/[^'"]+)['"]\)/g;
  let m;
  while ((m = reRequire.exec(src))) {
    varToFile.set(m[1], modulePathToFile(m[2]));
  }

  const exportToFile = new Map();

  const reExportVar = /exports\.(\w+)\s*=\s*(\w+)\.(\w+)/g;
  while ((m = reExportVar.exec(src))) {
    const [, expName, modVar] = m;
    const f = varToFile.get(modVar);
    if (f) exportToFile.set(expName, f);
  }

  const reExportReq = /exports\.(\w+)\s*=\s*require\(['"](\.\/[^'"]+)['"]\)\.(\w+)/g;
  while ((m = reExportReq.exec(src))) {
    exportToFile.set(m[1], modulePathToFile(m[2]));
  }

  const rawExportNames = new Set([...src.matchAll(/exports\.(\w+)\s*=/g)].map((x) => x[1]));
  const parseOk = exportToFile.size === rawExportNames.size && [...rawExportNames].every((n) => exportToFile.has(n));

  return { exportToFile, varToFile, parseOk, rawExportNames };
}

function getChangedFunctionFiles(base, head) {
  const r = spawnSync(
    'git',
    ['diff', '--name-only', `${base}..${head}`, '--', 'functions/', 'firebase.json'],
    { cwd: repoRoot, encoding: 'utf8' }
  );
  if (r.status !== 0) {
    console.warn('[incremental] git diff failed:', r.stderr || r.stdout);
    return null;
  }
  return r.stdout
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((p) => normalize(p).replace(/\\/g, '/'));
}

/** Unit/integration tests are not deployed; ignore them for export mapping (avoids full-deploy fallback). */
function filterProductionFunctionPaths(changedFiles) {
  return changedFiles.filter((c) => {
    const n = c.replace(/\\/g, '/');
    if (n.startsWith('functions/test/')) return false;
    return true;
  });
}

function mustDeployAll(changedFiles) {
  const triggers = [
    'functions/index.js',
    'functions/package.json',
    'functions/package-lock.json',
    'functions/firebaseAdmin.js',
    'firebase.json',
  ];
  for (const c of changedFiles) {
    const n = c.replace(/\\/g, '/');
    if (triggers.some((t) => n === t || n.endsWith('/' + t.split('/').pop()))) {
      return { reason: `core manifest ${n}` };
    }
    if (n.startsWith('functions/shared/')) {
      return { reason: 'functions/shared/ (shared code)' };
    }
  }
  return null;
}

function resolveGitRange() {
  let base = process.env.DEPLOY_GIT_BASE;
  let head = process.env.DEPLOY_GIT_HEAD || process.env.GITHUB_SHA;
  const before = process.env.GITHUB_PUSH_BEFORE;

  if (!base && before && head && !/^0+$/.test(before)) {
    base = before;
  }
  if (!head) {
    const h = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' });
    if (h.status === 0) head = h.stdout.trim();
  }
  if (!base) {
    const p = spawnSync('git', ['rev-parse', 'HEAD~1'], { cwd: repoRoot, encoding: 'utf8' });
    if (p.status === 0) base = p.stdout.trim();
  }

  return { base, head };
}

function main() {
  if (process.env.DEPLOY_FUNCTIONS_FORCE_FULL === '1') {
    console.log('[incremental] DEPLOY_FUNCTIONS_FORCE_FULL=1 → deploy all (sequential)');
    runSequentialAll();
    return;
  }

  const { exportToFile, parseOk } = buildExportToFile();
  if (!parseOk) {
    console.warn('[incremental] Could not map every export in index.js to a module — deploy all (sequential)');
    runSequentialAll();
    return;
  }

  const knownTopLevelFiles = new Set(exportToFile.values());

  const fileToExports = new Map();
  for (const [exp, file] of exportToFile) {
    if (!fileToExports.has(file)) fileToExports.set(file, []);
    fileToExports.get(file).push(exp);
  }

  const { base, head } = resolveGitRange();
  if (!base || !head) {
    console.log('[incremental] Could not resolve git range → deploy all (sequential)');
    runSequentialAll();
    return;
  }

  console.log(`[incremental] Comparing ${base.slice(0, 7)}..${head.slice(0, 7)}`);

  const changedFiles = getChangedFunctionFiles(base, head);
  if (changedFiles === null) {
    console.log('[incremental] git diff failed → deploy all (sequential)');
    runSequentialAll();
    return;
  }

  const productionChanges = filterProductionFunctionPaths(changedFiles);

  if (productionChanges.length === 0) {
    console.log('[incremental] No production changes under functions/ or firebase.json (tests-only or empty diff) — skipping deploy.');
    return;
  }

  console.log('[incremental] Changed files:', changedFiles.join(', '));

  const fullReason = mustDeployAll(productionChanges);
  if (fullReason) {
    console.log(`[incremental] Full deploy: ${fullReason.reason}`);
    runSequentialAll();
    return;
  }

  const toDeploy = new Set();
  for (const cf of productionChanges) {
    const n = cf.replace(/\\/g, '/');
    if (n === 'firebase.json') continue;

    if (!n.startsWith('functions/')) continue;

    if (knownTopLevelFiles.has(n)) {
      const exps = fileToExports.get(n) || [];
      exps.forEach((e) => toDeploy.add(e));
      continue;
    }

    console.log(`[incremental] Changed file not mapped from index.js top-level requires: ${n}`);
    console.log('[incremental] → full deploy (nested/shared dependency — safest)');
    runSequentialAll();
    return;
  }

  const names = [...toDeploy].sort((a, b) => a.localeCompare(b));
  if (names.length === 0) {
    console.log('[incremental] No matching exports — skipping.');
    return;
  }

  console.log(`[incremental] Deploying ${names.length} function(s): ${names.join(', ')}`);

  const only = names.map((n) => `functions:${n}`).join(',');
  const r = spawnSync(
    'npx',
    ['firebase', 'deploy', '--only', only, '--project', projectId, '--non-interactive'],
    {
      cwd: repoRoot,
      stdio: 'inherit',
      env: process.env,
      shell: process.platform === 'win32',
    }
  );

  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
}

function runSequentialAll() {
  const seq = join(root, 'deploy-functions-sequential.mjs');
  if (!existsSync(seq)) {
    console.error('Missing scripts/deploy-functions-sequential.mjs');
    process.exit(1);
  }
  const r = spawnSync(process.execPath, [seq], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
  });
  process.exit(r.status ?? 1);
}

main();
