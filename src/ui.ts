/**
 * Menus around the match: title screen language switch, settings, how to play, and the bag (I).
 */
import { FEEL_SETTINGS, setVolume } from './feel';
import { ITEM, NOIR_SET, RARITY_COLOR, RARITY_NAME, SLOTS, SLOT_NAME, WEIGHT_NAME, jewelLevel, statLines, type Item, type Slot } from './gear';
import { artUrl, itemIcon } from './icons';
import { getLang, onLang, setLang, t } from './i18n';
import { INV, dropFromBag, equipFromBag, invHooks, unequip, wearable } from './inventory';
import { PS } from './core';
import { SHOP, sellPrice } from './shop.ts';
import { buy, repair, repairQuote, restockIn, sell, shelf, spin, type Machine } from './vendor';
import { LOOK } from './look';

const $ = (id: string) => document.getElementById(id)!;

// ---- Settings ------------------------------------------------------------------------------
const KEY = 'vb.settings';
export const SETTINGS = { sens: 1, volume: 0.5, fov: 0.95, numbers: true, shake: 1 };
try {
  Object.assign(SETTINGS, JSON.parse(localStorage.getItem(KEY) ?? '{}'));
} catch {
  /* ignore */
}
const settingsHooks: (() => void)[] = [];
export function onSettings(f: () => void) {
  settingsHooks.push(f);
  f();
}
function saveSettings() {
  try {
    localStorage.setItem(KEY, JSON.stringify(SETTINGS));
  } catch {
    /* ignore */
  }
  setVolume(SETTINGS.volume);
  FEEL_SETTINGS.shake = SETTINGS.shake;
  for (const f of settingsHooks) f();
}

function buildSettings() {
  const body = $('settings-body');
  body.innerHTML = '';
  const range = (label: string, key: 'sens' | 'volume' | 'fov' | 'shake', min: number, max: number, step: number) => {
    const row = document.createElement('label');
    row.className = 'row';
    row.innerHTML = `<span>${t(label)}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${SETTINGS[key]}">`;
    row.querySelector('input')!.addEventListener('input', (e) => {
      SETTINGS[key] = Number((e.target as HTMLInputElement).value);
      saveSettings();
    });
    body.appendChild(row);
  };
  const seg = (label: string, opts: [string, string][], cur: string, set: (v: string) => void) => {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<span>${t(label)}</span><div class="seg">${opts.map(([v, l]) => `<button data-v="${v}" class="${v === cur ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    row.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => set((b as HTMLElement).dataset.v!)));
    body.appendChild(row);
  };
  seg('language', [['tr', 'Türkçe'], ['en', 'English']], getLang(), (v) => setLang(v as 'tr' | 'en'));
  range('sensitivity', 'sens', 0.3, 2.5, 0.05);
  range('volume', 'volume', 0, 1, 0.05);
  range('fov', 'fov', 0.75, 1.25, 0.01);
  range('shake', 'shake', 0, 1.5, 0.05);
  seg('numbers', [['1', t('on')], ['0', t('off')]], SETTINGS.numbers ? '1' : '0', (v) => {
    SETTINGS.numbers = v === '1';
    saveSettings();
    buildSettings();
  });
  seg('look', [['clay', t('lookClay')], ['classic', t('lookClassic')]], LOOK, (v) => {
    if (v === LOOK) return;
    const p = new URLSearchParams(location.search);
    if (v === 'classic') p.set('look', 'classic');
    else p.delete('look');
    location.search = p.toString();
  });
  const note = document.createElement('p');
  note.className = 'note';
  note.textContent = t('reloadNote');
  body.appendChild(note);
}

// ---- Static text and language ----------------------------------------------------------------
function translateStatic() {
  document.querySelectorAll<HTMLElement>('[data-t]').forEach((el) => (el.textContent = t(el.dataset.t!)));
  document.querySelectorAll<HTMLElement>('.lang button').forEach((b) => b.classList.toggle('on', b.dataset.lang === getLang()));
  if (!$('settings').classList.contains('hidden')) buildSettings();
  if (!$('inventory').classList.contains('hidden')) renderInventory();
}

export function initUi() {
  document.documentElement.lang = getLang();
  translateStatic();
  onLang(translateStatic);
  saveSettings();
  document.querySelectorAll<HTMLElement>('.lang button').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.lang as 'tr' | 'en')));
  const open = (id: string) => {
    if (id === 'settings') buildSettings();
    $(id).classList.remove('hidden');
  };
  $('open-settings').addEventListener('click', () => open('settings'));
  $('open-howto').addEventListener('click', () => open('howto'));
  document.querySelectorAll<HTMLElement>('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('.modal')!.classList.add('hidden')));
  document.querySelectorAll<HTMLElement>('.modal').forEach((m) => m.addEventListener('click', (e) => e.target === m && m.classList.add('hidden')));
  $('inv-close').addEventListener('click', () => invUi.close());
  invHooks.changed = () => {
    if (shopUi.isOpen()) renderShop();
    if (!$('inventory').classList.contains('hidden')) renderInventory();
  };
}

/** Put the painted Artlist art in place once art/index.json has loaded. */
export function paintArt() {
  const poster = artUrl('ui', 'poster');
  if (poster && !document.querySelector('.postcard')) {
    const card = document.createElement('figure');
    card.className = 'postcard';
    card.innerHTML = `<img src="${poster}" alt=""><figcaption data-t="postcard">${t('postcard')}</figcaption>`;
    $('title-art').appendChild(card);
  }
  for (const [chip, id] of [['band', 'bandage'], ['reel', 'reel']] as const) {
    const url = artUrl('items', id);
    const el = $(chip);
    if (url && !el.querySelector('img')) el.insertAdjacentHTML('afterbegin', `<img class="chip-art" src="${url}" alt="">`);
  }
}

// ---- Bag --------------------------------------------------------------------------------------
export const invUi = { open: () => {}, close: () => {}, isOpen: () => !$('inventory').classList.contains('hidden') };
let selected: { where: 'slot' | 'bag'; key: Slot | number } | null = null;

function itemCard(it: Item | undefined, label: string, bad = false) {
  if (!it) return `<div class="item empty"><span class="lbl">${label}</span></div>`;
  const d = ITEM[it.id];
  const lv = d.slot === 'ring' || d.slot === 'necklace' ? `<span class="lv">${t('jewelLv', { l: jewelLevel(it) })}</span>` : '';
  return `<div class="item${bad ? ' bad' : ''}"><span class="rar" style="background:${RARITY_COLOR[it.rarity]}"></span>${lv}<div class="icon">${itemIcon(it.id, d.icon, RARITY_COLOR[it.rarity] === '#c9c2b2' ? '#6b6258' : RARITY_COLOR[it.rarity])}</div><span class="lbl">${d.name[getLang()]}</span></div>`;
}

function info(it: Item | undefined, boxId = 'inv-info') {
  const box = $(boxId);
  if (!it) {
    box.innerHTML = '';
    return;
  }
  const d = ITEM[it.id];
  const l = getLang();
  const meta = [RARITY_NAME[it.rarity][l], d.weight && !d.set ? WEIGHT_NAME[d.weight][l] : '', SLOT_NAME[d.slot][l], d.set ? NOIR_SET.name[l] : ''].filter(Boolean).join(' · ');
  box.innerHTML = `<div class="meta">${meta}</div><h4 style="color:${it.rarity === 'common' ? 'inherit' : RARITY_COLOR[it.rarity]}">${d.name[l]}</h4>${statLines(it, l).map((s) => `<div>${s}</div>`).join('')}<div class="lore">“${d.lore[l]}”</div>${wearable(it) ? '' : `<div style="color:#e2475c">${t('cantWear')}</div>`}`;
}

export function renderInventory() {
  const l = getLang();
  const slots = $('inv-slots');
  slots.innerHTML = SLOTS.map((s) => itemCard(INV.load[s], SLOT_NAME[s][l])).join('');
  [...slots.children].forEach((el, i) => {
    const slot = SLOTS[i];
    el.addEventListener('mouseenter', () => info(INV.load[slot]));
    el.addEventListener('click', () => {
      selected = { where: 'slot', key: slot };
      info(INV.load[slot]);
    });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      unequip(slot);
    });
  });
  const bag = $('inv-bag');
  const cells: string[] = [];
  for (let i = 0; i < 8; i++) cells.push(itemCard(INV.bag[i], '', INV.bag[i] ? !wearable(INV.bag[i]) : false));
  bag.innerHTML = cells.join('');
  [...bag.children].forEach((el, i) => {
    el.addEventListener('mouseenter', () => info(INV.bag[i]));
    el.addEventListener('click', () => equipFromBag(i));
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      dropFromBag(i);
    });
  });
  const n = INV.set;
  $('inv-set').textContent = n ? `${NOIR_SET.name[l]} ${n}/5 · ${[2, 3, 5].filter((k) => n >= k).map((k) => NOIR_SET.text[k][l].split(':')[0]).join(', ')}` : '';
  if (selected?.where === 'slot') info(INV.load[selected.key as Slot]);
}

// ---- Vendor machine (V) --------------------------------------------------------------------
export const shopUi = {
  open: (_m: Machine) => {},
  close: () => {},
  isOpen: () => !$('shop').classList.contains('hidden'),
  /** Set by main.ts: class id and match seconds. */
  ctx: () => ({ cls: 'rogue' as Parameters<typeof shelf>[1], seconds: 0 }),
  message: (_t: string) => {},
};
let shopAt: Machine | null = null;

export function renderShop(m: Machine | null = shopAt) {
  shopAt = m;
  if (!m) return;
  const { cls, seconds } = shopUi.ctx();
  const items = shelf(m, cls, seconds);
  $('shop-money').textContent = `${t('money')} ${PS.currency}`;
  $('shop').classList.toggle('lucky', m.lucky);
  $('shop-kind').textContent = m.lucky ? t('shopLuckyTitle') : t('shopShelf');
  const lever = $('shop-spin') as HTMLButtonElement;
  lever.classList.toggle('hidden', !m.lucky);
  lever.textContent = spinning ? t('shopSpinning') : t('shopSpin', { c: SHOP.spinCost });
  lever.disabled = spinning || PS.currency < SHOP.spinCost;
  const q = repairQuote();
  const fix = $('shop-repair') as HTMLButtonElement;
  fix.textContent = q.lost > 0 ? t('shopRepair', { c: q.price, a: q.lost }) : t('shopRepairNone');
  fix.disabled = q.lost <= 0 || PS.currency < q.price;
  const row = $('shop-shelf');
  row.innerHTML = items
    .map((s) => {
      const card = itemCard(s.it, '', !wearable(s.it));
      const cls2 = s.sold ? ' sold' : PS.currency < s.price ? ' cant' : '';
      const price = `<span class="price">${s.sold ? t('shopSold') : t('shopBuy', { c: s.price })}</span>`;
      return card.replace('<div class="item', `<div class="item${cls2}`).replace(/<\/div>$/, `${price}</div>`);
    })
    .join('');
  [...row.children].forEach((el, i) => {
    el.addEventListener('mouseenter', () => info(items[i].it, 'shop-info'));
    el.addEventListener('click', () => {
      const err = buy(items[i]);
      shopUi.message(err ? t(err) : t('shopBought', { n: ITEM[items[i].it.id].name[getLang()] }));
      renderShop();
    });
  });
  const bag = $('shop-bag');
  const cells: string[] = [];
  for (let i = 0; i < 8; i++) {
    const it = INV.bag[i];
    cells.push(it ? itemCard(it, '').replace(/<\/div>$/, `<span class="price">${t('shopBuy', { c: sellPrice(it) })}</span></div>`) : itemCard(undefined, ''));
  }
  bag.innerHTML = cells.join('');
  [...bag.children].forEach((el, i) => {
    el.addEventListener('mouseenter', () => {
      info(INV.bag[i], 'shop-info');
      if (INV.bag[i]) $('shop-info').insertAdjacentHTML('beforeend', `<div><b>${t('shopSellFor', { c: sellPrice(INV.bag[i]) })}</b></div>`);
    });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      sell(i);
      renderShop();
    });
  });
  $('shop-restock').textContent = m.lucky ? t('shopLuckyNote') : t('shopRestock', { s: restockIn(seconds) });
}

// Lucky machine lever: the result is decided at once; the slots then spin and stop one by one.
let spinning = false;
$('shop-spin').addEventListener('click', () => {
  if (!shopAt || spinning) return;
  const { cls } = shopUi.ctx();
  const res = spin(shopAt, cls);
  if ('err' in res) return shopUi.message(t(res.err));
  spinning = true;
  renderShop();
  const cards = [...$('shop-shelf').children] as HTMLElement[];
  const pool = Object.values(ITEM).filter((d) => wearable({ id: d.id, rarity: 'common', xp: 0 }));
  cards.forEach((el, i) => {
    el.classList.add('spin');
    const flick = setInterval(() => {
      const d = pool[Math.floor(Math.random() * pool.length)];
      el.querySelector('.icon')!.innerHTML = itemIcon(d.id, d.icon, '#6b6258');
    }, 70);
    setTimeout(() => {
      clearInterval(flick);
      el.classList.remove('spin');
      if (i === cards.length - 1) {
        spinning = false;
        renderShop();
        if (res.prize) shopUi.message(t('shopJackpot', { n: ITEM[res.prize.id].name[getLang()] }));
      }
    }, 600 + i * 180);
  });
});
$('shop-repair').addEventListener('click', () => {
  const err = repair();
  shopUi.message(err ? t(err) : t('shopRepaired'));
  renderShop();
});
