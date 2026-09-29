#!/usr/bin/env node
/**
 * Draws every raster copy of the logo from the one set of shapes the app
 * itself draws (client/src/components/brand/logo-paths.ts): the favicons, the
 * share image, the Apple touch icon, and the Android launcher icons and
 * splash screens. Run it again whenever the logo changes:
 *
 *   node scripts/render-brand-assets.mjs
 *
 * The Android files only reach phones with the next APK (a v*-mobile tag).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'client', 'public');
const RES = path.join(ROOT, 'mobile', 'android', 'app', 'src', 'main', 'res');

const shapes = fs.readFileSync(path.join(ROOT, 'client', 'src', 'components', 'brand', 'logo-paths.ts'), 'utf8');
const shape = (name) => shapes.match(new RegExp(`export const ${name} = '([^']+)'`))[1];
const MARK = shape('MARK');
const LETTERS_A = shape('LETTERS_A');
const LETTERS_B = shape('LETTERS_B');
const TAGLINE = shape('TAGLINE');

// The Navy theme's colours, the site's default (index.css): the accent for
// the mark and most letters, the ink for the rest, and a lighter blue for a
// browser in dark mode.
const ACCENT = '#0B4C8C';
const INK = '#14212E';
const ACCENT_LIGHT = '#7EA6D9';
const PAPER = '#FAFAF7';

const MARK_W = 204.8;
const MARK_H = 229.76;
const LOGO_W = 1000;
const LOGO_H = 229.76;

/**
 * An SVG canvas of w×h with the mark centred at the given height.
 * `ground` fills the canvas, `shape` ('square' | 'round' | 'rounded') clips it.
 */
function markSvg({ w, h, markH, ground = null, shape: clip = 'square' }) {
  const s = markH / MARK_H;
  const x = (w - MARK_W * s) / 2;
  const y = (h - markH) / 2;
  let back = '';
  if (ground) {
    if (clip === 'round') back = `<circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) / 2}" fill="${ground}"/>`;
    else if (clip === 'rounded') back = `<rect width="${w}" height="${h}" rx="${w * 0.18}" fill="${ground}"/>`;
    else back = `<rect width="${w}" height="${h}" fill="${ground}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${back}` +
    `<path transform="translate(${x} ${y}) scale(${s})" d="${MARK}" fill="${ACCENT}"/></svg>`;
}

/** The whole logo, tagline included, centred on a w×h ground. */
function logoSvg({ w, h, logoW, ground }) {
  const s = logoW / LOGO_W;
  const x = (w - logoW) / 2;
  const y = (h - LOGO_H * s) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<rect width="${w}" height="${h}" fill="${ground}"/><g transform="translate(${x} ${y}) scale(${s})">` +
    `<path d="${MARK}${LETTERS_A}" fill="${ACCENT}"/><path d="${LETTERS_B}${TAGLINE}" fill="${INK}"/></g></svg>`;
}

async function png(svg, file) {
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(file);
  console.log('  ', path.relative(ROOT, file));
}

async function jpeg(svg, file) {
  await sharp(Buffer.from(svg)).jpeg({ quality: 90, mozjpeg: true }).toFile(file);
  console.log('  ', path.relative(ROOT, file));
}

// ── Web ─────────────────────────────────────────────────────────────────────
console.log('web');
// The tab icon: the mark alone, lightened when the browser is dark.
const pad = 12;
fs.writeFileSync(
  path.join(PUBLIC, 'favicon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-(MARK_H - MARK_W) / 2 - pad} ${-pad} ${MARK_H + 2 * pad} ${MARK_H + 2 * pad}">` +
    `<style>path{fill:${ACCENT}}@media (prefers-color-scheme:dark){path{fill:${ACCENT_LIGHT}}}</style>` +
    `<path d="${MARK}"/></svg>\n`,
);
console.log('   client/public/favicon.svg');
await png(markSvg({ w: 512, h: 512, markH: 460 }), path.join(PUBLIC, 'favicon.png'));
await jpeg(markSvg({ w: 512, h: 512, markH: 400, ground: '#FFFFFF' }), path.join(PUBLIC, 'favicon.jpg'));
await png(markSvg({ w: 1024, h: 1024, markH: 920 }), path.join(PUBLIC, 'logo.png'));
await png(markSvg({ w: 180, h: 180, markH: 118, ground: PAPER }), path.join(PUBLIC, 'apple-touch-icon.png'));
// Link previews (1200×630): the whole logo on paper.
const share = logoSvg({ w: 1200, h: 630, logoW: 860, ground: PAPER });
await png(share, path.join(PUBLIC, 'logo-share.png'));
await jpeg(share, path.join(PUBLIC, 'logo-share.jpg'));

// ── Android ─────────────────────────────────────────────────────────────────
console.log('android');
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [name, k] of Object.entries(DENSITIES)) {
  const dir = path.join(RES, `mipmap-${name}`);
  // Adaptive icon: 108dp, of which only the middle 66dp circle is sure to show.
  await png(markSvg({ w: 108 * k, h: 108 * k, markH: 46 * k }), path.join(dir, 'ic_launcher_foreground.png'));
  // Launchers from before Android 8 take the icon as drawn.
  await png(markSvg({ w: 48 * k, h: 48 * k, markH: 30 * k, ground: '#FFFFFF', shape: 'rounded' }), path.join(dir, 'ic_launcher.png'));
  await png(markSvg({ w: 48 * k, h: 48 * k, markH: 27 * k, ground: '#FFFFFF', shape: 'round' }), path.join(dir, 'ic_launcher_round.png'));
}
// Splash screens: the mark on white, a quarter of the short side.
const splashes = fs.readdirSync(RES).filter((d) => d === 'drawable' || /^drawable-(land|port)-/.test(d));
for (const d of splashes) {
  const file = path.join(RES, d, 'splash.png');
  if (!fs.existsSync(file)) continue;
  const { width: w, height: h } = await sharp(file).metadata();
  await png(markSvg({ w, h, markH: Math.round(Math.min(w, h) * 0.26), ground: '#FFFFFF' }), file);
}
