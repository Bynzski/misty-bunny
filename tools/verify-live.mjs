/**
 * verify-live.mjs — proves that the public site is serving the release we think
 * it is.
 *
 *   node tools/verify-live.mjs --url https://misty-bunny.gyute.fyi --expect-sha <40-hex>
 *
 * A deploy step that returns 0 and a site that serves the right bytes are
 * different claims. This checks the second one, and it checks it the only way
 * that means anything: by fetching everything over the public hostname, after
 * the deployment, and comparing it to the inventory the build recorded.
 *
 *   1. the release is reachable over HTTPS and reports the expected commit
 *   2. the document is the game's, with the right title and canonical
 *   3. every file the release inventories is served, byte for byte
 *   4. the entry bundle and stylesheet are actually referenced by the document
 *
 * It deliberately does not try to play the game. That needs a real GPU, which
 * a GitHub-hosted runner does not have — see docs/DEPLOYMENT.md for the manual
 * gameplay check.
 */
import { createHash } from 'node:crypto';

const argv = process.argv.slice(2);
const arg = (n, d = null) => {
  const i = argv.indexOf('--' + n);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};

const URL_BASE = (arg('url', 'https://misty-bunny.gyute.fyi/') || '').replace(/([^/])\/*$/, '$1');
const EXPECT_SHA = arg('expect-sha', null);
const SITE = 'https://misty-bunny.gyute.fyi/';
// Pointing this at http://localhost is a legitimate rehearsal of the whole
// check; only the production target is required to be HTTPS.
const IS_PRODUCTION = URL_BASE.startsWith('https://');

let failures = 0;
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? '  ok  ' : ' FAIL '} ${name}${extra ? '  — ' + extra : ''}`);
  if (!cond) failures++;
};

console.log(`\nverifying ${URL_BASE} against ${EXPECT_SHA || '(no expected sha)'}\n`);

/* ---- 1. the release over HTTPS ---------------------------------- */
let manifest = null;
try {
  const r = await fetch(`${URL_BASE}/release.json`, { redirect: 'error' });
  ok('release.json is served', r.ok, `HTTP ${r.status}`);
  if (IS_PRODUCTION) ok('release.json is served over HTTPS', r.url.startsWith('https://'));
  const ct = r.headers.get('content-type') || '';
  ok('release.json is JSON', /json/.test(ct), ct);
  manifest = await r.json();
} catch (e) {
  ok('release.json is served', false, String(e.message || e));
}

if (manifest) {
  ok('release reports the expected commit',
    EXPECT_SHA ? manifest.source_sha === EXPECT_SHA : true,
    `site says ${manifest.source_sha}`);
  ok('release names the game', manifest.name === 'Misty Bunny');
  ok('release is a Misty Bunny release, not another site on this host',
    Array.isArray(manifest.files) && manifest.files.length > 0,
    `${Array.isArray(manifest.files) ? manifest.files.length : 0} files listed`);
}

/* ---- 2. the document -------------------------------------------- */
let html = '';
try {
  const r = await fetch(`${URL_BASE}/`, { redirect: 'follow' });
  ok('/ is served', r.ok, `HTTP ${r.status}`);
  if (IS_PRODUCTION) ok('/ is served over HTTPS', r.url.startsWith('https://'));
  html = await r.text();
} catch (e) {
  ok('/ is served', false, String(e.message || e));
}

if (html) {
  const title = (html.match(/<title>([^<]*)<\/title>/i) || [])[1]?.trim() || '';
  ok('the document is the game, not a placeholder', /Misty Bunny/.test(title), `title "${title}"`);
  ok('the document is not the deployment-pending page', !/deployment pending/i.test(html));
  const canonical = (html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i) || [])[1] || '';
  if (IS_PRODUCTION) ok('the canonical URL is the production URL', canonical === SITE, canonical);

  // The social card, over the public hostname.
  //
  // This is the one asset that is fetched by somebody else's crawler, from a
  // different network, with no knowledge of the release. Asserting the tag is
  // present proves nothing on its own — a card that 404s is exactly the bug
  // this whole block exists to catch, so the URL in the tag is fetched here
  // and has to come back as a real image.
  const ogImage = (html.match(/<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i) || [])[1] || '';
  ok('the document declares an og:image', !!ogImage, ogImage || '(none)');
  ok('og:image is an absolute URL', /^https?:\/\//i.test(ogImage), ogImage || '(none)');
  if (ogImage) {
    try {
      const r = await fetch(ogImage, { redirect: 'follow' });
      ok('og:image is served', r.ok, `HTTP ${r.status}`);
      const ct = (r.headers.get('content-type') || '').split(';')[0].trim();
      ok('og:image is an image', /^image\//i.test(ct), ct || '(no content-type)');
      if (IS_PRODUCTION) ok('og:image is served over HTTPS', r.url.startsWith('https://'), r.url);
      const body = Buffer.from(await r.arrayBuffer());
      ok('og:image is not an empty response', body.length > 1024, `${body.length} bytes`);
    } catch (e) {
      ok('og:image is served', false, String(e.message || e));
    }
  }
  const appleIcon = (html.match(/<link[^>]+rel=["']apple-touch-icon["'][^>]*href=["']([^"']+)["']/i) || [])[1] || '';
  ok('the document declares an apple-touch-icon', !!appleIcon, appleIcon || '(none)');
  if (appleIcon) {
    const url = appleIcon.startsWith('/') ? `${URL_BASE}${appleIcon}` : appleIcon;
    try {
      const r = await fetch(url, { redirect: 'follow' });
      ok('apple-touch-icon is served', r.ok, `HTTP ${r.status}`);
    } catch (e) {
      ok('apple-touch-icon is served', false, String(e.message || e));
    }
  }
}

/* ---- 3. every inventoried file, byte for byte -------------------- */
if (manifest && Array.isArray(manifest.files)) {
  let bytes = 0;
  let bad = 0;
  for (const entry of manifest.files) {
    bytes += entry.bytes || 0;
    try {
      const r = await fetch(`${URL_BASE}/${entry.path}`, { redirect: 'error' });
      if (!r.ok) { ok(`${entry.path} is served`, false, `HTTP ${r.status}`); bad++; continue; }
      const body = Buffer.from(await r.arrayBuffer());
      const got = createHash('sha256').update(body).digest('hex');
      if (got !== entry.sha256) { ok(`${entry.path} matches the release`, false, 'checksum differs'); bad++; }
    } catch (e) {
      ok(`${entry.path} is served`, false, String(e.message || e)); bad++;
    }
  }
  ok(`all ${manifest.files.length} inventoried files are served byte for byte`,
    bad === 0, `${bad} problem(s)`);
  console.log(`        ${(bytes / 1048576).toFixed(1)} MB verified`);

  /* ---- 4. the document names the files it needs ------------------ */
  if (html) {
    for (const entry of manifest.files.filter((f) => /assets\/.*\.(js|css)$/.test(f.path))) {
      ok(`the document references ${entry.path}`, html.includes(entry.path));
    }
  }
}

console.log(`\n${failures ? `FAILED — ${failures} problem(s)` : 'PASSED — the live site is serving the expected release'}\n`);
process.exit(failures ? 1 : 0);