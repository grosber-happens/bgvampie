// Runs perf.html in headless Chromium and prints the result.
// Usage: pnpm dev (in another shell), then
//   node tools/perf-bench.mjs [url] [frames] [step]
// Headless Chromium draws with SwiftShader (CPU), so absolute frame times are much slower than a
// real GPU; compare runs with each other, and trust draw calls and triangles as they are.
import { createRequire } from 'node:module';

// Works with a global Playwright install too (ESM import would only look in node_modules).
const { chromium } = createRequire(import.meta.url)('playwright');

const url = process.argv[2] ?? 'http://localhost:22913/perf.html';
const frames = process.argv[3] ?? '400';
const step = process.argv[4] ?? '4';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info'] });
const [w, h] = (process.env.VIEW ?? '640x360').split('x').map(Number);
const page = await browser.newPage({ viewport: { width: w, height: h } });
page.on('console', (m) => m.text().startsWith('perf:') && console.error(m.text()));
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.goto(`${url}?frames=${frames}&step=${step}${process.env.SIZE ? `&size=${process.env.SIZE}` : ""}${process.env.QUERY ?? ""}`);
await page.waitForFunction(() => window.__perf, null, { timeout: 30 * 60 * 1000, polling: 1000 });
console.log(JSON.stringify(await page.evaluate(() => window.__perf), null, 2));
await browser.close();
