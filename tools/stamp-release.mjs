/**
 * stamp-release.mjs — records what a release actually is, in the release.
 *
 *   node tools/stamp-release.mjs --sha <40-hex> [--ref <git-ref>] [--dist dist]
 *
 * A release directory on its own says nothing about which commit produced it,
 * so the only way to answer "is the site running the commit I think it is?" is
 * to publish the answer with it. This writes `dist/release.json`: the source
 * sha, when it was built, and a sha256 for every file that will be served.
 *
 * `tools/check-dist.mjs --require-release` then holds the release to that
 * inventory, and the deploy step re-verifies it after upload — so a release
 * that has been altered anywhere between build and serve fails loudly instead
 * of being served quietly.
 *
 * The sha of the tarball itself is deliberately *not* recorded here: the
 * tarball contains this file, so a hash of it cannot live inside it. That
 * digest is computed by the workflow and passed to the server as an argument
 * instead.
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, posix } from 'node:path';

const argv = process.argv.slice(2);
const arg = (n, d = null) => {
  const i = argv.indexOf('--' + n);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};

const SHA = arg('sha');
const REF = arg('ref', 'unknown');
const DIST = arg('dist', 'dist');

if (!SHA || !/^[0-9a-f]{40}$/.test(SHA)) {
  console.error('stamp-release: --sha must be the full 40-character commit sha');
  process.exit(1);
}

function walk(dir, base = '') {
  const out = [];
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    const rel = posix.join(base, name);
    if (statSync(abs).isDirectory()) out.push(...walk(abs, rel));
    else out.push({ path: rel, abs, bytes: statSync(abs).size });
  }
  return out;
}

const files = walk(DIST)
  // Neither manifest inventories itself. Excluding SHA256SUMS as well as
  // release.json is what makes re-stamping a directory safe: stamp it twice
  // and you get the same manifest, not one that claims to cover a stale copy
  // of itself.
  .filter((f) => f.path !== 'release.json' && f.path !== 'SHA256SUMS')
  .sort((a, b) => a.path.localeCompare(b.path))
  .map((f) => ({
    path: f.path,
    bytes: f.bytes,
    sha256: createHash('sha256').update(readFileSync(f.abs)).digest('hex'),
  }));

const manifest = {
  name: 'Misty Bunny',
  source_sha: SHA,
  source_ref: REF,
  built_at: new Date().toISOString(),
  node: process.version,
  file_count: files.length,
  total_bytes: files.reduce((n, f) => n + f.bytes, 0),
  files,
};

writeFileSync(join(DIST, 'release.json'), JSON.stringify(manifest, null, 2) + '\n');

// The same inventory in the format `sha256sum -c` understands, so the server
// can verify an extracted release with coreutils and no JSON parser on a host
// that has no reason to have one.
writeFileSync(join(DIST, 'SHA256SUMS'),
  files.map((f) => `${f.sha256}  ${f.path}`).join('\n') + '\n');

console.log(`stamped ${files.length} file(s) from ${SHA.slice(0, 12)} into ${DIST}/release.json`);