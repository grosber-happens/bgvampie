// Exports the game's procedurally built scenes to .glb files for the Babylon.js Sandbox.
// Usage: node tools/export/export-glb.mjs [outDir]   (starts the Vite dev server itself)
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
// Playwright is not a project dependency; use whatever copy is installed globally.
const { chromium } = createRequire(import.meta.url)('playwright');

const out = resolve(process.argv[2] ?? 'dist/glb');
mkdirSync(out, { recursive: true });
const port = 22990;
const vite = spawn('pnpm', ['exec', 'vite', '--config', 'vite.config.ts', '--port', String(port), '--strictPort'], {
  env: { ...process.env, PORT: String(port) },
  stdio: 'ignore',
});
const base = `http://localhost:${port}`;
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(base)).ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 500));
}

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.error('page error:', e.message));

async function save(url, getScene, file, prep) {
  await page.goto(base + url);
  await page.evaluate(() => import('/src/exportGlb.ts')); // Vite may reload once for new deps
  await page.waitForTimeout(4000);
  await page.goto(base + url);
  await page.waitForFunction(getScene, null, { timeout: 120000 });
  if (prep) await page.evaluate(prep);
  await page.waitForTimeout(6000); // houses and props load in the background
  const b64 = await page.evaluate(async ([fn, name]) => {
    const { exportGlb } = await import('/src/exportGlb.ts');
    return exportGlb(new Function(`return (${fn})()`)(), name);
  }, [getScene.toString(), file]);
  const buf = Buffer.from(b64, 'base64');
  writeFileSync(resolve(out, file + '.glb'), buf);
  console.log(file + '.glb', (buf.length / 1e6).toFixed(1), 'MB');
}

const species = ['balcik', 'yamali', 'katip'];
try {
  await save('/?seed=7', () => window.__game?.scene(), 'harita', () => window.__game.start());
  for (const sp of species) {
    await save(`/armory.html?species=${sp}&still=1`, () => window.armory?.ready && window.armory.scene, `silahlar-${sp}`);
  }
} finally {
  await browser.close();
  vite.kill();
}
