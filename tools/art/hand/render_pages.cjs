// Renders tools/art/hand/pages/*.svg to PNG with the game's fonts. The poster also goes to public/art/ui/poster.webp (via cut.py).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../../..');
const font = (name, file) => {
  const f = path.join(root, 'node_modules/@fontsource', name, 'files', file);
  return fs.existsSync(f) ? `@font-face{font-family:'${name === 'special-elite' ? 'Special Elite' : name[0].toUpperCase() + name.slice(1)}';src:url(data:font/woff2;base64,${fs.readFileSync(f).toString('base64')}) format('woff2')}` : '';
};
const css = font('special-elite', 'special-elite-latin-400-normal.woff2') + font('special-elite', 'special-elite-latin-ext-400-normal.woff2') +
  font('bungee', 'bungee-latin-400-normal.woff2') + font('bungee', 'bungee-latin-ext-400-normal.woff2') + font('fredoka', 'fredoka-latin-400-normal.woff2');
(async () => {
  const dir = path.join(__dirname, 'pages');
  const b = await chromium.launch();
  const p = await b.newPage();
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.svg'))) {
    const svg = fs.readFileSync(path.join(dir, f), 'utf8');
    const [, w, h] = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
    await p.setViewportSize({ width: +w, height: +h });
    await p.setContent(`<html><head><style>${css}body{margin:0}</style></head><body>${svg}</body></html>`);
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: path.join(dir, f.replace('.svg', '.png')) });
  }
  await b.close();
})();
