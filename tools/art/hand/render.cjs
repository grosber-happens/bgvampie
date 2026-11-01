// Renders tools/art/hand/icons.json (items, on paper) and skills.json (skills, transparent) to png/<id>.png at 160 px,
// plus contact sheets. cut.py makes the webp files.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const out = path.join(__dirname, 'png');
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 160, height: 160 } });
  const sets = [
    ['icons.json', '#f3ead7', 'sheet.png'],
    ['skills.json', 'transparent', 'sheet-skills.png'],
  ];
  for (const [file, bg, sheetName] of sets) {
    const icons = JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
    for (const [id, svg] of Object.entries(icons)) {
      await p.setContent(`<html><body style="margin:0;background:${bg}">${svg.replace('<svg ', '<svg width="160" height="160" ')}</body></html>`);
      fs.writeFileSync(path.join(out, `${id}.png`), await p.screenshot({ type: 'png', omitBackground: bg === 'transparent' }));
    }
    const n = Object.keys(icons).length;
    const sheet = await b.newPage({ viewport: { width: 1040, height: Math.ceil(n / 8) * 130 } });
    // Skills are also shown at 48 px (their in-game size) under the big row, to check they still read.
    const small = bg === 'transparent' ? `<div style="display:flex;flex-wrap:wrap;width:1040px">${Object.values(icons).map((s) => s.replace('<svg ', '<svg width="48" height="48" style="margin:4px" ')).join('')}</div>` : '';
    await sheet.setViewportSize({ width: 1040, height: Math.ceil(n / 8) * 130 + (small ? Math.ceil(n / 18) * 56 : 0) });
    await sheet.setContent(`<html><body style="margin:0;background:#f3ead7"><div style="display:flex;flex-wrap:wrap">${Object.values(icons).map((s) => s.replace('<svg ', '<svg width="130" height="130" ')).join('')}</div>${small}</body></html>`);
    await sheet.screenshot({ path: path.join(__dirname, sheetName) });
    await sheet.close();
  }
  await b.close();
})();
