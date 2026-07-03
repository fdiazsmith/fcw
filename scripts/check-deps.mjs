// Fails fast if any workspace declares a dependency that isn't installed.
// Run via `npm run check-deps` (and as a pretest hook) so a forgotten
// `npm install` surfaces as a clear error instead of cryptic load failures.
//
// Exports a pure core for ad-hoc testing; the CLI wrapper exits non-zero
// when any declared dep is missing.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

/**
 * @param {object} opts
 * @param {string} opts.root - absolute path to repo root
 * @param {(p: string) => boolean} [opts.exists] - injectable existence check (tests)
 * @param {string[]} [opts.workspaces] - injectable workspace globs (tests)
 * @returns {{missing: Array<{workspace: string, dep: string}>, checked: number}}
 */
export function findMissingDeps({
  root,
  exists = (p) => existsSync(p),
  workspaces,
}) {
  const rootPkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
  const globs = workspaces ?? rootPkg.workspaces ?? [];
  const workspaceDirs = expandGlobs(root, globs);

  const missing = [];
  let checked = 0;
  for (const dir of workspaceDirs) {
    const pkgPath = join(dir, 'package.json');
    if (!exists(pkgPath)) continue;
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    for (const dep of Object.keys(deps)) {
      checked++;
      // Workspace packages resolve to symlinks under root node_modules.
      // External deps are hoisted to root node_modules by npm workspaces.
      const candidate = join(root, 'node_modules', dep);
      if (!exists(candidate)) {
        missing.push({ workspace: basename(dir), dep });
      }
    }
  }
  return { missing, checked };
}

/** Expand `packages/*` globs and literal dir paths (no nested stars — keeps it tiny). */
function expandGlobs(root, globs) {
  const out = [];
  for (const g of globs) {
    const m = g.match(/^(.+)\/\*$/);
    if (m) {
      const parent = join(root, m[1]);
      try {
        for (const entry of readdirSync(parent)) {
          const full = join(parent, entry);
          if (statSync(full).isDirectory()) out.push(full);
        }
      } catch {
        // parent doesn't exist yet — skip
      }
    } else {
      // Literal workspace path.
      out.push(join(root, g));
    }
  }
  return out;
}

function main() {
  const { missing, checked } = findMissingDeps({ root: ROOT });
  if (missing.length === 0) {
    console.log(`[check-deps] OK — ${checked} dependencies present`);
    return;
  }
  console.error(`[check-deps] FAIL — ${missing.length} missing dependency(ies):`);
  for (const { workspace, dep } of missing) {
    console.error(`  ${workspace}: ${dep}`);
  }
  console.error('');
  console.error('Run `npm install` at the repo root, then retry.');
  process.exit(1);
}

// Run only when invoked as a script (not when imported).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
