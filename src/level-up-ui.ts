import { TOKEN_PRICE } from './balance';
import { cardText, currentOffer, pickCard, prog, tier3Open } from './progression';
import { PS } from './core';
import { kit, skills } from './kit';
import { skillIcon } from './icons';
import { t as T } from './i18n';
import type { Input } from './input';

const $ = (id: string) => document.getElementById(id)!;

/** Owns the level-up card panel and its keyboard/mouse interactions. */
export function createLevelUpUi(input: Input) {
  const cardsEl = $('cards');
  let open = false;

  function openCards() {
    const offer = currentOffer();
    if (!offer) return;
    open = true;
    cardsEl.classList.remove('hidden');
    if (document.pointerLockElement) document.exitPointerLock();
    const row = $('card-row');
    row.innerHTML = '';
    offer.forEach((c, i) => {
      const txt = cardText(c);
      const el = document.createElement('div');
      el.className = `card${c.locked ? ' locked' : ''}`;
      el.innerHTML = `
      <div class="seal-wrap">${skillIcon(c.id, txt.name, kit.id)}</div>
      <div class="tag ${c.isNew ? 'new' : ''}">${c.isNew ? T('newSkill') : `${T('tier')} ${c.tier}`}</div>
      <h3>${txt.name}</h3>
      ${c.isNew ? `<div class="desc">${txt.desc}</div>` : ''}
      <div class="tier">${T('tier')} ${c.tier}: ${txt.tier}</div>
      ${c.cost ? `<div class="cost">${T('token', { c: c.cost })}${c.locked ? ` (${T('youHave', { c: PS.currency })})` : ''}</div>` : ''}
      <div class="key">${c.locked ? c.locked : T('pickKey', { n: i + 1 })}</div>`;
      el.addEventListener('click', () => choose(i));
      row.appendChild(el);
    });
    if (!offer.length) row.innerHTML = `<p>${T('allMax')}</p>`;
    $('tier-rule').textContent = tier3Open()
      ? T('tier3Open', { c: TOKEN_PRICE })
      : T('tier3Rule', { n: skills.filter((s) => s.tier >= 2).length });
  }

  function closeCards() {
    if (!open) return;
    open = false;
    cardsEl.classList.add('hidden');
    input.lock();
  }

  function choose(i: number) {
    if (!pickCard(i)) return;
    if (prog.pending > 0) openCards();
    else closeCards();
  }

  $('card-close').addEventListener('click', closeCards);
  window.addEventListener('keydown', (e) => {
    if (!open) return;
    if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') choose(Number(e.code.slice(5)) - 1);
    else if (e.code === 'Escape') closeCards();
    input.consume(e.code);
  });
  // Keep the cards open only while Tab is held.
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Tab' && open) closeCards();
  });

  return { open: openCards, close: closeCards, choose, isOpen: () => open };
}
