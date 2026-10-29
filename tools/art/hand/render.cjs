// Renders tools/art/hand/icons.json to tools/art/hand/png/<id>.png (160 px) and a contact sheet; cut.py makes the webp files.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const icons = JSON.parse(fs.readFileSync(path.join(__dirname, 'icons.json'), 'utf8'));
  const out = path.join(__dirname, 'png');
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 160, height: 160 } });
  for (const [id, svg] of Object.entries(icons)) {
    await p.setContent(`<html><body style="margin:0;background:#f3ead7">${svg.replace('<svg ', '<svg width="160" height="160" ')}</body></html>`);
    const png = await p.screenshot({ type: 'png' });
    fs.writeFileSync(path.join(out, `${id}.png`), png);
  }
  const sheet = await b.newPage({ viewport: { width: 1040, height: 840 } });
  await sheet.setContent(`<html><body style="margin:0;background:#f3ead7;display:flex;flex-wrap:wrap">${Object.values(icons).map((s) => s.replace('<svg ', '<svg width="130" height="130" ')).join('')}</body></html>`);
  await sheet.screenshot({ path: process.argv[2] || path.join(__dirname, 'sheet.png') });
  await b.close();
})();
