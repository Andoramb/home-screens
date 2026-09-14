// Screenshot the same display screens on two (or more) running servers and
// record computed styles, driven by a JSON job file. Run from the repo root:
//
//   node .claude/skills/compare-renders/scripts/shoot.mjs <job.json>
//
// Job file shape (see SKILL.md for a worked example):
// {
//   "out": ".claude/mockups/<gallery>",           // PNGs + measurements.json land here
//   "servers": { "main": "http://127.0.0.1:3131", "branch": "http://127.0.0.1:3132" },
//   "viewport": { "width": 1080, "height": 1920 },
//   "scale": 3,                                    // deviceScaleFactor for crops
//   "stubs": { "**/api/weather*": "e2e/fixtures/module-data/weather.json" },
//   "shots": [{
//     "screen": "s-weather",                       // /display?screen=<id>
//     "waitFor": "[data-module-id=\"w-current\"] >> text=/72°/",   // proves the module rendered its data
//     "settle": 2000,                              // ms to wait after waitFor
//     "crops": [{ "name": "current", "selector": "[data-module-id=\"w-current\"]", "pad": 8 }],
//     "measure": [{ "name": "temp", "selector": "[data-module-id=\"w-current\"] >> text=/^72°/",
//                   "props": ["fontSize", "fontWeight"] }]
//   }]
// }
// Selectors are Playwright locator strings. A crop may add "nth" when the
// selector matches many elements and "parent": true to crop the containing
// element; a measure may add "child" to read the style of a descendant.
// Output names: <server>-<screen>.png (full, CSS pixels), <server>-<screen>-<crop>.png (at scale),
// and measurements.json keyed <server>/<screen>/<measure name>.
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';

const jobPath = process.argv[2];
if (!jobPath) { console.error('usage: shoot.mjs <job.json>'); process.exit(1); }
const job = JSON.parse(readFileSync(jobPath, 'utf8'));
const out = path.resolve(job.out);
mkdirSync(out, { recursive: true });
const stubs = Object.entries(job.stubs ?? {}).map(([glob, file]) => [glob, readFileSync(file, 'utf8')]);
const measurements = {};

const browser = await chromium.launch();
for (const [server, base] of Object.entries(job.servers)) {
  const page = await browser.newPage({ viewport: job.viewport ?? { width: 1920, height: 1080 }, deviceScaleFactor: job.scale ?? 2 });
  for (const [glob, body] of stubs) {
    await page.route(glob, (r) => r.fulfill({ status: 200, contentType: 'application/json', body }));
  }
  for (const shot of job.shots) {
    const url = `${base}/display?screen=${encodeURIComponent(shot.screen)}`;
    await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 });
    if (shot.waitFor) await page.waitForSelector(shot.waitFor, { timeout: 60_000 });
    await page.waitForTimeout(shot.settle ?? 2000);
    await page.screenshot({ path: path.join(out, `${server}-${shot.screen}.png`), scale: 'css' });
    for (const crop of shot.crops ?? []) {
      let target = page.locator(crop.selector).nth(crop.nth ?? 0);
      if (crop.parent) target = target.locator('xpath=..');
      const box = await target.boundingBox();
      if (!box) { console.warn(`${server}/${shot.screen}/${crop.name}: not found`); continue; }
      const pad = crop.pad ?? 0;
      await page.screenshot({
        path: path.join(out, `${server}-${shot.screen}-${crop.name}.png`),
        clip: { x: box.x - pad, y: box.y - pad, width: box.width + 2 * pad, height: box.height + 2 * pad },
      });
    }
    for (const m of shot.measure ?? []) {
      const el = page.locator(m.selector).nth(m.nth ?? 0);
      const result = await el.evaluate((node, { child, props }) => {
        const r = node.getBoundingClientRect();
        const subject = child ? node.querySelector(child) ?? node : node;
        const cs = getComputedStyle(subject);
        const styles = Object.fromEntries((props ?? []).map((p) => [p, cs[p]]));
        return { box: `${Math.round(r.width)}x${Math.round(r.height)}`, aspect: +(r.width / r.height).toFixed(2), ...styles };
      }, { child: m.child, props: m.props });
      measurements[`${server}/${shot.screen}/${m.name}`] = result;
      console.log(`${server}/${shot.screen}/${m.name}`, JSON.stringify(result));
    }
  }
  await page.close();
}
await browser.close();
writeFileSync(path.join(out, 'measurements.json'), JSON.stringify(measurements, null, 2));
console.log(`wrote ${out}`);
