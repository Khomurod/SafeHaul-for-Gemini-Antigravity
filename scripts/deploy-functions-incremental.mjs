#!/usr/bin/env node
/**
 * Deploy only Cloud Functions affected by git changes (when safe).
 *
 * Rules:
 * - Compares DEPLOY_GIT_BASE..DEPLOY_GIT_HEAD (or GITHUB_PUSH_BEFORE + GITHUB_SHA) under functions/.
 * - Parses functions/index.js to map each export name → primary module file (direct require from index).
 * - functions/index.js: diffs export→module mappings vs base commit; only exports whose wiring or backing
 *   file path changed are redeployed (whitespace-only edits deploy nothing). Parse ambiguity → full deploy.
 * - Full deploy if: package files, firebaseAdmin.js, shared/, firebase.json.
 * - Ignores functions/test/** (tests are not deployed and must not trigger unmapped-file full deploy).
 * - Directory entrypoints (require('./bulkActions') → bulkActions/index.js) and nested files map to deploy unit.
 * - Transitive `require()` graph: any other changed file is attributed to the union of entrypoints whose
 *   closure references it. Example: editing `functions/schemaConfig.js` (required only by
 *   `functions/systemIntegrity.js`) deploys only the `systemIntegrity` exports, not the whole codebase.
 * - Only when a changed file does not appear in ANY entrypoint's closure do we fall back to full deploy.
 * - Otherwise: single `firebase deploy --only functions:a,functions:b,...`
 *
 * Env:
 *   FIREBASE_PROJECT_ID (required for real deploys; not needed for dry-run)
 *   DEPLOY_GIT_BASE / DEPLOY_GIT_HEAD — optional explicit SHAs
 *   GITHUB_PUSH_BEFORE / GITHUB_SHA — set by CI on push
 *   DEPLOY_FUNCTIONS_FORCE_FULL=1 — skip incremental, deploy all (sequential script)
 *   DEPLOY_FUNCTIONS_DRY_RUN=1 — print the deploy plan and exit (no firebase invocation)
 *   --dry-run CLI flag — same as DEPLOY_FUNCTIONS_DRY_RUN=1
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'url';
import { dirname, join, normalize } from 'path';
import { spawnSync } from 'child_process';

const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(root, '..');
const functionsDir = join(repoRoot, 'functions');
const indexPath = join(functionsDir, 'index.js');

const dryRun =
  process.env.DEPLOY_FUNCTIONS_DRY_RUN === '1' || process.argv.includes('--dry-run');
const projectId = process.env.FIREBASE_PROJECT_ID;

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

/**
 * Resolve a relative `require()` specifier (./foo, ../foo/bar, ./foo.js) from
 * `fromFile` (a repo-relative path like 'functions/companyAdmin.js') to a
 * repo-relative path of the actual file on disk.
 *
 * Returns null if:
 *   - the specifier escapes the `functions/` tree
 *   - neither `<resolved>.js` nor `<resolved>/index.js` exists on disk
 */
function resolveRelativeRequire(fromFile, rel) {
  const baseDir = dirname(fromFile);
  const targetNoExt = normalize(join(baseDir, rel)).replace(/\\/g, '/');

  // Hard guard: never let a relative path walk us out of functions/.
  if (!targetNoExt.startsWith('functions/')) return null;

  if (targetNoExt.endsWith('.js')) {
    return existsSync(join(repoRoot, targetNoExt)) ? targetNoExt : null;
  }

  const asFile = `${targetNoExt}.js`;
  if (existsSync(join(repoRoot, asFile))) return asFile;
  const asIndex = `${targetNoExt}/index.js`;
  if (existsSync(join(repoRoot, asIndex))) return asIndex;
  return null;
}

/** Tiny cache so the closure walker re-uses file sources across entrypoints. */
const fileSourceCache = new Map();
function readFileCached(repoRelPath) {
  if (fileSourceCache.has(repoRelPath)) return fileSourceCache.get(repoRelPath);
  const abs = join(repoRoot, repoRelPath);
  const src = existsSync(abs) ? readFileSync(abs, 'utf8') : '';
  fileSourceCache.set(repoRelPath, src);
  return src;
}

/**
 * Recursively collect every relative dependency reachable from `entryFile`.
 * Bare specifiers (e.g. `firebase-admin`, `nodemailer`) are intentionally skipped:
 * those are npm deps, not in-repo source, so they cannot be affected by a git diff
 * inside `functions/`.
 *
 * Cycles are handled via the `visited` set.
 * Dynamic requires (template literals, variables) are not analyzable and are skipped;
 * if a changed file is only referenced dynamically it will fall through to the
 * full-deploy escape hatch — that's correct, since static analysis can't prove
 * otherwise.
 */
function collectClosure(entryFile, visited = new Set()) {
  if (visited.has(entryFile)) return visited;
  visited.add(entryFile);

  const src = readFileCached(entryFile);
  if (!src) return visited;

  // Only relative requires: ./foo or ../foo/bar (with optional whitespace inside parens).
  const reReq = /require\(\s*['"](\.\.?\/[^'"]+)['"]\s*\)/g;
  let m;
  while ((m = reReq.exec(src))) {
    const resolved = resolveRelativeRequire(entryFile, m[1]);
    if (resolved && !visited.has(resolved)) {
      collectClosure(resolved, visited);
    }
  }
  return visited;
}

/**
 * Invert per-entrypoint closures into a `file → Set<entrypoint>` map.
 * Lookups in this map answer: "if this file changed, which entrypoint modules
 * (and therefore which Cloud Function exports) need to be redeployed?"
 */
function buildFileToEntrypoints(knownTopLevelFiles) {
  const fileToEntries = new Map();
  for (const entry of knownTopLevelFiles) {
    const closure = collectClosure(entry);
    for (const dep of closure) {
      if (!fileToEntries.has(dep)) fileToEntries.set(dep, new Set());
      fileToEntries.get(dep).add(entry);
    }
  }
  return fileToEntries;
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
  if (!projectId && !dryRun) {
    console.error('FIREBASE_PROJECT_ID is required (or set DEPLOY_FUNCTIONS_DRY_RUN=1).');
    process.exit(1);
  }
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

  // Transitive require() graph. Built once per run; cheap thanks to the source cache.
  const fileToEntries = buildFileToEntrypoints(knownTopLevelFiles);
  console.log(`[incremental] Built dependency graph: ${fileToEntries.size} files across ${knownTopLevelFiles.size} entrypoint module(s).`);

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

    // Third branch: transitive `require()` closure.
    // If this file is reachable from one or more entrypoint modules, deploy
    // only the exports owned by those entrypoints — not the whole codebase.
    const owners = fileToEntries.get(n);
    if (owners && owners.size > 0) {
      const ownersList = [...owners].sort();
      const expanded = new Set();
      for (const owner of owners) {
        (fileToExports.get(owner) || []).forEach((e) => expanded.add(e));
      }
      expanded.forEach((e) => toDeploy.add(e));
      console.log(
        `[incremental] Shared dep ${n} → ${owners.size} entrypoint(s) [${ownersList.join(', ')}] → ${expanded.size} export(s)`
      );
      continue;
    }

    console.log(`[incremental] Changed file not reachable from any entrypoint: ${n}`);
    console.log('[incremental] → full deploy (orphan dependency — safest)');
    runSequentialAll();
    return;
  }

  const names = [...toDeploy].sort((a, b) => a.localeCompare(b));
  if (names.length === 0) {
    console.log('[incremental] No matching exports — skipping.');
    return;
  }

  console.log(`[incremental] Deploying ${names.length} function(s): ${names.join(', ')}`);

  if (dryRun) {
    console.log('[incremental] DRY RUN — skipping firebase invocation.');
    return;
  }

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
  if (dryRun) {
    console.log('[incremental] DRY RUN — would deploy ALL functions sequentially.');
    process.exit(0);
  }
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

// CLI guard: only run main() when this file is executed directly, not when imported by tests.
const isDirectInvocation =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectInvocation) {
  main();
}

// Named exports for tests. Production behavior is unaffected.
export {
  modulePathToFile,
  resolveNestedUnderDirectoryModules,
  buildExportToFileFromSource,
  resolveRelativeRequire,
  collectClosure,
  buildFileToEntrypoints,
  mustDeployAll,
};
