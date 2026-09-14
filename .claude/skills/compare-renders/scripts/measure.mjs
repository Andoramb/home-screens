// Find horizontal bands of light (or dark) pixels in a PNG so gallery
// callouts can be placed as percentages. Run from the repo root:
//
//   node .claude/skills/compare-renders/scripts/measure.mjs <image.png> [--column 0.4] [--threshold 200] [--dark]
//
// Scans one column (fraction of the width, default 0.4, away from day
// numbers) top to bottom and prints each run of pixels whose mean channel
// value is above the threshold (or below it with --dark) as
// [firstRow, lastRow, topPercent, heightPercent]. Percentages are what an
// absolutely positioned overlay needs (top / height of the image).
import { chromium } from '@playwright/test';
import { readFileSync } from 'fs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
if (!file) { console.error('usage: measure.mjs <image.png> [--column 0.4] [--threshold 200] [--dark]'); process.exit(1); }
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? Number(args[i + 1]) : dflt; };
const column = opt('--column', 0.4);
const threshold = opt('--threshold', 200);
const dark = args.includes('--dark');

const browser = await chromium.launch();
const page = await browser.newPage();
const src = 'data:image/png;base64,' + readFileSync(file).toString('base64');
const result = await page.evaluate(async ({ src, column, threshold, dark }) => {
  const img = new Image(); img.src = src; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const x = Math.floor(c.width * column);
  const hit = (y) => { const i = (y * c.width + x) * 4; const l = (d[i] + d[i + 1] + d[i + 2]) / 3; return dark ? l < threshold : l > threshold; };
  const runs = []; let start = null;
  for (let y = 0; y <= c.height; y++) {
    const v = y < c.height && hit(y);
    if (v && start == null) start = y;
    if (!v && start != null) { runs.push([start, y - 1, +((start / c.height) * 100).toFixed(1), +(((y - start) / c.height) * 100).toFixed(1)]); start = null; }
  }
  return { width: c.width, height: c.height, column: x, runs };
}, { src, column, threshold, dark });
await browser.close();
console.log(JSON.stringify(result));
