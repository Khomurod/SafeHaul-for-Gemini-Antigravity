#!/usr/bin/env node
/**
 * Deploy only Cloud Functions affected by git changes (when safe).
 *
 * Rules:
 * - Compares DEPLOY_GIT_BASE..DEPLOY_GIT_HEAD (or GITHUB_PUSH_BEFORE + GITHUB_SHA) under functions/.
 * - Parses functions/index.js to map each export name → primary module file (direct require from index).
 * - functions/index.js: diffs export→module mappings vs base commit; only exports whose wiring or backing
 *   file path changed are redeployed (whitespace-only edits deploy nothing). Parse ambiguity → full deploy.
 * - Full deploy if: package files, firebaseAdmin.js, shared/, firebase.json, or unmapped changed files.
 * - Ignores functions/test/** (tests are not deployed and must not trigger unmapped-file full deploy).
 * - Directory entrypoints (require('./bulkActions') → bulkActions/index.js) and nested files map to deploy unit.
 * - Otherwise: single `firebase deploy --only functions:a,functions:b,...`
 *
 * Env:
 *   FIREBASE_PROJECT_ID (required)
 *   DEPLOY_GIT_BASE / DEPLOY_GIT_HEAD — optional explicit SHAs
 *   GITHUB_PUSH_BEFORE / GITHUB_SHA — set by CI on push
 *   DEPLOY_FUNCTIONS_FORCE_FULL=1 — skip incremental, deploy all (sequential script)
 */

import { readFileSync, existsSync } from 'node:fs';
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

/**
 * Normalize require('./foo') to a repo-relative path under functions/.
 * Prefers foo/index.js when present (Node resolution), else foo.js.
 */
function modulePathToFile(rel) {
  let n = rel.replace(/^\.\//, '');
  const funcRoot = join(repoRoot, 'functions');

  if (n.endsWith('.js')) {
    return normalize(join('functions', n)).replace(/\\/g, '/');
  }

  const indexFile = join(funcRoot, n, 'index.js');
  const directFile = join(funcRoot, `${n}.js`);

  if (existsSync(indexFile)) {
    return normalize(join('functions', n, 'index.js')).replace(/\\/g, '/');
  }
  if (existsSync(directFile)) {
    return normalize(join('functions', `${n}.js`)).replace(/\\/g, '/');
  }

  return normalize(join('functions', `${n}.js`)).replace(/\\/g, '/');
}

/** Map e.g. functions/bulkActions/workers/x.js → functions/bulkActions/index.js */
function resolveNestedUnderDirectoryModules(changedNormalized, knownTopLevelFiles) {
  if (knownTopLevelFiles.has(changedNormalized)) return changedNormalized;
  for (const kf of knownTopLevelFiles) {
    if (!kf.endsWith('/index.js')) continue;
    const dirPrefix = kf.slice(0, -'index.js'.length);
    if (changedNormalized.startsWith(dirPrefix)) return kf;
  }
  return null;
}

/**
 * Parse index.js source: export name → functions/relative path of top-level module.
 */
function buildExportToFileFromSource(src) {
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

function buildExportToFile() {
  const src = readFileSync(indexPath, 'utf8');
  return buildExportToFileFromSource(src);
}

function gitShow(commitColonPath) {
  const r = spawnSync('git', ['show', commitColonPath], { cwd: repoRoot, encoding: 'utf8' });
  if (r.status !== 0) return null;
  return r.stdout;
}

/**
 * Export names whose mapping changed between base index.js and current working tree index.js.
 * Returns null if unsafe to diff (missing base file or parse incomplete).
 */
function diffExportsFromIndexChange(baseSha) {
  const oldSrc = gitShow(`${baseSha}:functions/index.js`);
  if (oldSrc === null) {
    console.warn('[incremental] Cannot read functions/index.js at base commit — full deploy');
    return null;
  }

  const newSrc = readFileSync(indexPath, 'utf8');
  const oldParsed = buildExportToFileFromSource(oldSrc);
  const newParsed = buildExportToFileFromSource(newSrc);

  if (!oldParsed.parseOk || !newParsed.parseOk) {
    console.warn('[incremental] index.js export parse incomplete (base or head) — full deploy');
    return null;
  }

  const changed = new Set();
  for (const name of newParsed.exportToFile.keys()) {
    const oldPath = oldParsed.exportToFile.get(name);
    const newPath = newParsed.exportToFile.get(name);
    if (oldPath !== newPath) changed.add(name);
  }
  return changed;
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

  const nonIndexProductionChanges = productionChanges.filter((c) => {
    const n = c.replace(/\\/g, '/');
    return n !== 'functions/index.js';
  });

  const fullReason = mustDeployAll(productionChanges);
  if (fullReason) {
    console.log(`[incremental] Full deploy: ${fullReason.reason}`);
    runSequentialAll();
    return;
  }

  const indexChanged = productionChanges.some((c) => c.replace(/\\/g, '/') === 'functions/index.js');

  const toDeploy = new Set();

  if (indexChanged) {
    const fromIndex = diffExportsFromIndexChange(base);
    if (fromIndex === null) {
      runSequentialAll();
      return;
    }
    fromIndex.forEach((e) => toDeploy.add(e));
    if (fromIndex.size > 0) {
      console.log(`[incremental] index.js export mapping changed → ${fromIndex.size} function(s): ${[...fromIndex].sort().join(', ')}`);
    } else {
      console.log('[incremental] index.js changed (format/comments only or identical wiring) → no exports flagged from manifest diff');
    }
  }

  for (const cf of nonIndexProductionChanges) {
    const n = cf.replace(/\\/g, '/');
    if (n === 'firebase.json') continue;

    if (!n.startsWith('functions/')) continue;

    if (knownTopLevelFiles.has(n)) {
      const exps = fileToExports.get(n) || [];
      exps.forEach((e) => toDeploy.add(e));
      continue;
    }

    const mappedTopLevel = resolveNestedUnderDirectoryModules(n, knownTopLevelFiles);
    if (mappedTopLevel && knownTopLevelFiles.has(mappedTopLevel)) {
      const exps = fileToExports.get(mappedTopLevel) || [];
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
