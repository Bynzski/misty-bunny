/**
 * og-image.mjs — renders the social-preview card for the game.
 *
 *   npm run og
 *
 * Produces two committed assets in public/:
 *
 *   public/og.jpg                1200x630, the OpenGraph / Twitter card
 *   public/apple-touch-icon.png  180x180, solid tile, no transparency
 *
 * WHY A GENERATOR RATHER THAN A COMMITTED SCREENSHOT
 *
 * The release is verified byte for byte after deployment, and the build is
 * required to be reproducible: two builds of one commit must produce one
 * tarball hash. Screenshotting the game in CI would break that outright —
 * it needs a GPU runner (see docs/DEPLOYMENT.md §8) and even on a GPU the
 * first frame is not bit-stable. So the card is rendered here, from a
 * committed still, and the PNG is committed. CI never renders it.
 *
 * The hero is docs/k-gallery.png — the meridian instrument, which is the
 * same shot the brand site leads with, so the link preview and the brand
 * page agree about what the game looks like.
 *
 * TYPOGRAPHY
 *
 * The wordmark is the italic serif the brand uses. The game's own UI stack
 * ('Iowan Old Style', 'Palatino Linotype', Palatino, Georgia) is a stack of
 * faces that are simply not installed on a Linux build machine, so it is
 * declared with an explicit fallback chain and rendered with whatever
 * genuinely has an italic cut. See the note beside WORDMARK below.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import puppeteer from 'puppeteer-core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HERO = join(ROOT, 'docs/k-gallery.png');
const OUT = join(ROOT, 'public');
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

if (!existsSync(HERO)) {
  console.error(`FAIL  ${HERO} is missing — the card is built from the committed still.`);
  process.exit(1);
}

const hero = readFileSync(HERO).toString('base64');

/*
 * The brand stack, then faces that exist on a bare Linux box. Noto Serif has
 * a real italic; if it is ever missing the card still renders, just upright.
 */
const WORDMARK = `'Iowan Old Style','Palatino Linotype',Palatino,Georgia,'Noto Serif','Liberation Serif',serif`;
const TEXT = `Georgia,'Noto Serif','Liberation Serif',serif`;

const page1200 = /* html */ `
<style>
  @page { margin: 0 }
  * { margin: 0; padding: 0; box-sizing: border-box }
  html, body { width: 1200px; height: 630px; overflow: hidden }

  body {
    display: flex;
    background:
      radial-gradient(120% 130% at 88% 46%, #3a2a12 0%, #1b1409 34%, #0b0d10 68%),
      #0b0d10;
    color: #ded3b8;
    font-family: ${TEXT};
    -webkit-font-smoothing: antialiased;
    position: relative;
  }

  /* A warm bloom off the instrument, so the card reads as lit from within. */
  .glow {
    position: absolute; right: -120px; top: -140px;
    width: 820px; height: 820px; border-radius: 50%;
    background: radial-gradient(closest-side, rgba(240,217,122,.20), rgba(201,162,39,.07) 46%, transparent 72%);
    pointer-events: none;
  }

  .left {
    position: relative;
    width: 560px; height: 630px;
    padding: 74px 0 0 68px;
    display: flex; flex-direction: column;
  }

  .mark {
    font-family: ${WORDMARK};
    font-style: italic;
    font-weight: 400;
    font-size: 104px;
    line-height: .92;
    letter-spacing: -0.5px;
    color: #e8dcc0;
    text-shadow: 0 2px 26px rgba(201,162,39,.28);
  }

  .tag {
    margin-top: 30px;
    font-size: 27px;
    line-height: 1.34;
    font-weight: 700;
    color: #ded3b8;
    max-width: 430px;
  }

  .rule {
    margin: 30px 0 0;
    width: 74px; height: 3px;
    background: linear-gradient(90deg, #c9a227, rgba(201,162,39,0));
    border-radius: 2px;
  }

  .blurb {
    margin-top: 26px;
    font-size: 20px;
    line-height: 1.52;
    color: rgba(222,211,184,.74);
    max-width: 428px;
  }

  /* The instrument, framed the way the brand page frames it. */
  .right { position: relative; width: 640px; height: 630px; }

  .frame {
    position: absolute;
    right: 54px; top: 96px;
    width: 540px; height: 438px;
    border-radius: 20px;
    overflow: hidden;
    border: 5px solid #c9a227;
    box-shadow: 0 26px 70px rgba(0,0,0,.66), 0 0 44px rgba(201,162,39,.24);
  }
  .frame img { width: 100%; height: 100%; object-fit: cover; display: block }

  /* Brass plate under the frame, carrying the one fact that sells it. */
  .plate {
    position: absolute;
    right: 54px; top: 560px;
    font-family: ui-monospace, 'Liberation Mono', monospace;
    font-size: 19px;
    letter-spacing: 2.4px;
    text-transform: uppercase;
    color: rgba(240,217,122,.88);
  }
</style>
<div class="glow"></div>
<div class="left">
  <div class="mark">Misty<br>Bunny</div>
  <div class="tag">A quiet mystery inside a flooded lighthouse.</div>
  <div class="rule"></div>
  <div class="blurb">A Myst-inspired first-person exploration puzzle game. Quiet discovery,
    mysterious machinery, and reading-based puzzles. No combat.</div>
</div>
<div class="right">
  <div class="frame"><img src="data:image/png;base64,${hero}" alt=""></div>
  <div class="plate">Three locks &middot; no combat</div>
</div>
`;

/*
 * The icon is the same meridian mark the site already inlines, on the ink
 * background. Flat, opaque, and square — iOS composites transparency over
 * black, so an alpha channel here just means a muddy edge.
 */
const pageIcon = /* html */ `
<style>
  * { margin: 0; padding: 0; box-sizing: border-box }
  html, body { width: 180px; height: 180px; overflow: hidden }
  body {
    background: #0b0d10;
    display: flex; align-items: center; justify-content: center;
  }
  svg { width: 132px; height: 132px; color: #c9a227; display: block }
</style>
<svg viewBox="0 0 120 120">
  <g fill="none" stroke="currentColor" stroke-width="1.6">
    <circle cx="60" cy="60" r="46"/>
    <circle cx="60" cy="60" r="34" stroke-dasharray="2 6"/>
    <path d="M60 6v108M6 60h108"/>
    <path d="M60 20l8 40-8 40-8-40z" fill="currentColor" fill-opacity=".18"/>
  </g>
</svg>
`;

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome-stable',
  headless: 'new',
  protocolTimeout: 60000,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--force-color-profile=srgb'],
});

async function shoot(html, file, width, height, type = 'png', quality) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const opts = { type, clip: { x: 0, y: 0, width, height } };
  if (quality != null) opts.quality = quality;
  const buf = await page.screenshot(opts);
  writeFileSync(join(OUT, file), buf);
  await page.close();
  const kb = (buf.length / 1024).toFixed(0);
  console.log(`  wrote public/${file}  (${width}x${height}, ${kb} KB)`);
}

/*
 * The card is JPEG, not PNG.
 *
 * A flat-shaded layout compresses beautifully as PNG, but the instrument
 * photograph does not: the same card is 583 KB as a PNG against ~125 KB here.
 * Nothing is lost that matters — the card is a thumbnail of a dark, warm,
 * low-contrast scene, which is where JPEG spends its bits cheaply. There is no
 * transparency to preserve and no hard edge to ring against the dark ground.
 *
 * The encoder is Chrome's own, reached through page.screenshot(), so this
 * tool still needs nothing but the browser it already drives. Pulling in an
 * image library to shave the file would be a dependency bought for a number
 * nobody sees.
 *
 * The icon stays PNG regardless: iOS does not accept JPEG for
 * apple-touch-icon and silently falls back to a screenshot of the page.
 */
await shoot(page1200, 'og.jpg', 1200, 630, 'jpeg', 85);
await shoot(pageIcon, 'apple-touch-icon.png', 180, 180);

await browser.close();
console.log('\nre-run `npm run build` to put these in the release\n');