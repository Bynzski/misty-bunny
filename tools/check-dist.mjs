/**
 * check-dist.mjs — audits a production build before anybody deploys it.
 *
 *   node tools/check-dist.mjs [--dist dist] [--expect-sha <sha>] [--require-release]
 *
 * The point of this is that a green `vite build` is not evidence that the thing
 * you are about to publish is the thing you meant to publish. `vite build`
 * copies whatever `public/` holds, inlines whatever it can reach, and prints a
 * cheerful summary either way. It will not tell you that a private note got
 * swept in, that the browser tab still calls the game its old name, or that a
 * baked texture was resolved to a filename that no longer exists on disk.
 *
 * It is deliberately a closed-world check: everything in the output has to be
 * on the allowlist, so a file can only ship if somebody has thought about it.
 *
 * It cannot and does not try to hide the puzzle answers. `src/clues.js` has to
 * reach the browser for the game to be able to tell whether you were right, so
 * SOLUTIONS is in the bundle by construction and always has been — see the note
 * in README.md. What this guards is the *incidental* surface: tools, private
 * notes, source checkouts, maps and logs.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, posix } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, dflt = null) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const flag = (name) => argv.includes('--' + name);

const DIST = arg('dist', 'dist');
const EXPECT_SHA = arg('expect-sha', null);
const REQUIRE_RELEASE = flag('require-release');

const SITE = 'https://misty-bunny.gyute.fyi/';
const TITLE = 'Misty Bunny';

let failures = 0;
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? '  ok  ' : ' FAIL '} ${name}${extra ? '  — ' + extra : ''}`);
  if (!cond) failures++;
};

/** Everything that may exist at the top of the release directory. */
const TOP_LEVEL = new Set(['index.html', 'assets', 'release.json', 'SHA256SUMS', 'favicon.ico']);
const ASSET_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.svg', '.css', '.js', '.woff', '.woff2', '.ico']);

/** Filenames and directories that must never reach a public release. */
const FORBIDDEN = [
  [/^SOLUTIONS\.md$/i, 'the solutions file is a spoiler document'],
  [/^\.env/i, 'environment file'],
  [/^\.git$/, 'source checkout metadata'],
  [/^node_modules$/, 'installed dependencies'],
  [/^src$/, 'source tree'],
  [/^tools$/, 'development tools'],
  [/^docs$/, 'private documentation'],
  [/^shots$/, 'test artifacts'],
];

function walk(dir, base = '') {
  const out = [];
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    const rel = posix.join(base, name);
    if (statSync(abs).isDirectory()) out.push(...walk(abs, rel));
    else out.push({ rel, abs, size: statSync(abs).size });
  }
  return out;
}

if (!existsSync(DIST) || !statSync(DIST).isDirectory()) {
  console.error(`FAIL  ${DIST} does not exist — run "npm run build" first.`);
  process.exit(1);
}

const files = walk(DIST).sort((a, b) => a.rel.localeCompare(b.rel));
const byRel = new Map(files.map((f) => [f.rel, f]));

console.log(`\nauditing ${DIST} — ${files.length} files, ${(files.reduce((n, f) => n + f.size, 0) / 1048576).toFixed(1)} MB\n`);

/* ---------------------------------------------------------------- *
 *  1. closed world: nothing ships that was not asked for
 * ---------------------------------------------------------------- */
console.log('contents');
const topLevel = new Set(readdirSync(DIST));
for (const name of [...topLevel].sort()) {
  ok(`top-level "${name}" is allowed`, TOP_LEVEL.has(name));
}

for (const f of files) {
  for (const [re, why] of FORBIDDEN) {
    if (re.test(f.rel)) ok(`${f.rel} is not shipped`, false, why);
  }
}

for (const f of files) {
  const ext = f.rel.slice(f.rel.lastIndexOf('.'));
  const inAssets = f.rel.startsWith('assets/');
  if (!inAssets) continue;
  ok(`${f.rel} has a serveable extension`, ASSET_EXT.has(ext));
}
ok('index.html is present', byRel.has('index.html'));
ok('assets/ is present and non-empty', files.some((f) => f.rel.startsWith('assets/')));

const straySource = files.filter((f) => f.rel.endsWith('.js') && !f.rel.startsWith('assets/'));
ok('no loose javascript at the release root', straySource.length === 0,
  straySource.map((f) => f.rel).join(', '));

const maps = files.filter((f) => f.rel.endsWith('.map'));
ok('no sourcemaps in the release', maps.length === 0, maps.map((f) => f.rel).join(', '));

/* ---------------------------------------------------------------- *
 *  2. the document: public name, canonical, resolvable references
 * ---------------------------------------------------------------- */
console.log('\ndocument');
const html = byRel.has('index.html') ? readFileSync(join(DIST, 'index.html'), 'utf8') : '';

const title = (html.match(/<title>([^<]*)<\/title>/i) || [])[1] || '';
ok(`title is "${TITLE}"`, title.trim() === TITLE, `found "${title.trim()}"`);

const canonical = (html.match(/<link[^>]+rel=["']canonical["'][^>]*>/i) || [])[0] || '';
const canonicalHref = (canonical.match(/href=["']([^"']+)["']/i) || [])[1] || '';
ok('canonical is the production URL', canonicalHref === SITE, `found "${canonicalHref}"`);

const ogTitle = (html.match(/<meta[^>]+property=["']og:title["'][^>]*>/i) || [])[0] || '';
ok('og:title carries the public name', ogTitle.includes(`content="${TITLE}"`));
ok('og:url is the production URL', /property=["']og:url["'][^>]*content=["']https:\/\/misty-bunny\.gyute\.fyi\/["']/i.test(html));

// Every same-document href/src has to be a file that is actually there.
// `base: '/'` makes Vite emit root-absolute references and the source uses
// document-relative ones, so both spellings have to normalise to the same path.
const REFS = /(?:href|src)=["']([^"']+)["']/gi;
const refs = [...html.matchAll(REFS)].map((m) => m[1]);
const localRefs = refs.filter((r) => !/^(data:|https?:|mailto:|#)/i.test(r));
for (const r of localRefs) {
  const target = posix.normalize(r.replace(/^\.?\//, '').split('?')[0].split('#')[0]);
  ok(`${r} resolves inside the release`, byRel.has(target));
}
ok('no absolute cross-origin asset references',
  !/(?:href|src)=["']https?:\/\/(?!misty-bunny\.gyute\.fyi)/i.test(html));
ok('no source map comment in the bundle',
  !files.some((f) => f.rel.endsWith('.js') && /\/\/# sourceMappingURL=/.test(readFileSync(f.abs, 'utf8'))));

/* ---------------------------------------------------------------- *
 *  3. the bundle: does it reference assets that exist?
 * ---------------------------------------------------------------- *
 *  Vite rewrites `import.meta.glob` results and CSS url()s to the hashed
 *  filenames it emitted, so the bundle's own string literals are an inventory
 *  of everything the browser is going to ask for. A stale or dropped texture
 *  shows up here as a reference to a file that is not in the release.
 */
console.log('\nbundle');
let refCount = 0;
for (const f of files.filter((x) => x.rel.endsWith('.js') || x.rel.endsWith('.css'))) {
  const src = readFileSync(f.abs, 'utf8');
  const found = src.match(/(?:^|["'(=\s])(?:\/)?assets\/[A-Za-z0-9._-]+\.(?:png|jpe?g|webp|avif|svg|css|js|woff2?)/gi) || [];
  const names = new Set(found.map((s) => s.replace(/^[^a-z]*\/?assets\//, 'assets/').replace(/^\//, '')));
  for (const n of names) {
    refCount++;
    if (!byRel.has(n)) ok(`${n} (referenced by ${f.rel}) exists`, false);
  }
  if (names.size) ok(`${f.rel} — ${names.size} asset reference(s) all resolve`, true);
}
console.log(`        ${refCount} asset reference(s) checked`);

// Every emitted asset should be reachable from somewhere, or it is dead weight
// somebody paid for and will ship forever. index.html counts as a referrer,
// because the entry chunk and the stylesheet are named from there.
const bundleText = [
  html,
  ...files
    .filter((f) => f.rel.endsWith('.js') || f.rel.endsWith('.css'))
    .map((f) => readFileSync(f.abs, 'utf8')),
].join('\n');
const unreferenced = files.filter(
  (f) => f.rel.startsWith('assets/') && !bundleText.includes(f.rel.replace(/^assets\//, '')),
);
ok('no unreferenced assets in the release', unreferenced.length === 0,
  unreferenced.map((f) => f.rel).join(', '));

/* ---------------------------------------------------------------- *
 *  4. release provenance, when the workflow has written it
 * ---------------------------------------------------------------- */
console.log('\nprovenance');
if (!byRel.has('release.json')) {
  ok('release.json ' + (REQUIRE_RELEASE ? 'is required for this release' : 'present (optional)'),
    !REQUIRE_RELEASE, 'the deploy workflow writes it after the build');
} else {
  let rel = null;
  try { rel = JSON.parse(readFileSync(join(DIST, 'release.json'), 'utf8')); }
  catch (e) { ok('release.json parses', false, e.message); }
  if (rel) {
    ok('release.json names the game', rel.name === 'Misty Bunny');
    ok('release.json records a source sha',
      typeof rel.source_sha === 'string' && /^[0-9a-f]{40}$/.test(rel.source_sha), rel.source_sha);
    ok('release.json records a build time',
      typeof rel.built_at === 'string' && !Number.isNaN(Date.parse(rel.built_at)), rel.built_at);
    ok('release.json inventories some files', Array.isArray(rel.files) && rel.files.length > 0);

    if (EXPECT_SHA) {
      ok(`release.json is built from the expected sha ${EXPECT_SHA.slice(0, 12)}`,
        rel.source_sha === EXPECT_SHA, `found ${rel.source_sha}`);
    }

    const listed = new Map((rel.files || []).map((f) => [f.path, f.sha256]));
    // The two manifests describe the payload; neither inventories itself.
    const manifests = ['release.json', 'SHA256SUMS'].filter((p) => byRel.has(p)).length;
    ok('release.json inventories every served file',
      listed.size === files.length - manifests,
      `${listed.size} listed vs ${files.length - manifests} served`);
    let mismatch = 0;
    const wrongSize = [];
    for (const [p, want] of listed) {
      const f = byRel.get(p);
      if (!f) { mismatch++; continue; }
      const got = createHash('sha256').update(readFileSync(f.abs)).digest('hex');
      if (got !== want) mismatch++;
    }
    for (const entry of rel.files || []) {
      const f = byRel.get(entry.path);
      if (f && entry.bytes !== f.size) wrongSize.push(entry.path);
    }
    ok('every listed file matches its recorded checksum', mismatch === 0, `${mismatch} mismatch(es)`);
    ok('every listed file matches its recorded size', wrongSize.length === 0, wrongSize.join(', '));
    ok('release.json does not list itself', !listed.has('release.json'));
  }

  // The flat manifest is what the server verifies with `sha256sum -c`, so a
  // drift between the two would mean a release that passes here and fails on
  // the box, or worse, the other way round.
  if (byRel.has('SHA256SUMS')) {
    const lines = readFileSync(join(DIST, 'SHA256SUMS'), 'utf8').split('\n').filter(Boolean);
    const sums = new Map(lines.map((l) => {
      const m = l.match(/^([0-9a-f]{64})  (.+)$/);
      return m ? [m[2], m[1]] : [l, null];
    }));
    ok('SHA256SUMS is well formed', sums.size === lines.length, `${lines.length} line(s)`);
    const covered = [...sums.keys()].sort();
    const expected = files.map((f) => f.rel).filter((p) => p !== 'SHA256SUMS' && p !== 'release.json').sort();
    ok('SHA256SUMS covers exactly the served files',
      JSON.stringify(covered) === JSON.stringify(expected),
      `${covered.length} covered vs ${expected.length} served`);
    let bad = 0;
    for (const [p, want] of sums) {
      const f = byRel.get(p);
      if (!f) { bad++; continue; }
      if (createHash('sha256').update(readFileSync(f.abs)).digest('hex') !== want) bad++;
    }
    ok('every SHA256SUMS entry matches the file', bad === 0, `${bad} mismatch(es)`);
  }
}

/* ---------------------------------------------------------------- *
 *  5. routing: the game is one document, so there must be exactly one
 * ---------------------------------------------------------------- */
console.log('\nrouting');
ok('release root is a single document (no client-side router)',
  files.filter((f) => f.rel.endsWith('.html')).length === 1,
  files.filter((f) => f.rel.endsWith('.html')).map((f) => f.rel).join(', '));

console.log(`\n${failures ? `FAILED — ${failures} problem(s)` : 'PASSED — release is clean'}\n`);
process.exit(failures ? 1 : 0);