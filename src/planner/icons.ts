/** The planner's icons: drawn on a 24 grid with one round 1.7 stroke, so they read as one ink set. */
const P: Record<string, string> = {
  view: '<path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12M11 11V5a1.5 1.5 0 0 1 3 0v6M14 11V6.5a1.5 1.5 0 0 1 3 0V14c0 4-2.5 7-6 7-2.6 0-4-1.2-5.6-3.6L4 14.6a1.5 1.5 0 0 1 2.4-1.8L8 15"/>',
  place: '<path d="M12 21v-7M12 14c-4.5 0-6-3-6-7 3.5 0 6 1.6 6 5M12 13c0-3.4 2-6 6-6 0 4-1.6 6.5-6 6.5"/><path d="M7 21h10"/>',
  move: '<path d="M12 3v18M3 12h18M12 3 9.5 5.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5"/>',
  erase: '<path d="m8.5 19.5-4-4a1.8 1.8 0 0 1 0-2.5l8.5-8.5a1.8 1.8 0 0 1 2.5 0l4 4a1.8 1.8 0 0 1 0 2.5L12 18.5"/><path d="M8.5 19.5H20M9 9.5l5.5 5.5"/>',
  raise: '<path d="M3 19 9.5 9l3.5 5 2.5-3.5L21 19z"/><path d="M15.5 3v5M13.3 5.2 15.5 3l2.2 2.2"/>',
  lower: '<path d="M3 8c3 0 3.5 7 9 7s6-7 9-7"/><path d="M12 3v7M9.8 7.8 12 10l2.2-2.2M4 19.5h16"/>',
  zone: '<circle cx="12" cy="12" r="8.5" stroke-dasharray="2.6 2.6"/><circle cx="10" cy="10.5" r="1.1"/><circle cx="14.2" cy="9.4" r=".8"/><circle cx="12.8" cy="14" r="1.3"/>',
  walk: '<path d="M8.2 21c-1.6 0-2.4-1.2-2-3l.6-2.6h3.6l-.3 2.8c-.2 1.7-.8 2.8-1.9 2.8zM6.8 13.4c-.6-3 0-6.4 2-6.4s2.2 3 1.6 6.4zM16 15c-1.1 0-1.7-1.1-1.9-2.8l-.3-2.8h3.6l.6 2.6c.4 1.8-.4 3-2 3zM14.1 7.4c-.6-3.4-.4-6.4 1.6-6.4s2.6 3.4 2 6.4z"/>',
  mirror: '<path d="M12 3v18" stroke-dasharray="2 2.4"/><path d="M9 7 4 12l5 5zM15 7l5 5-5 5z"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  photo: '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7H8l1.5-2h5L16 7h2.5A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="13" r="3.4"/>',
  hide: '<path d="M3 12s3.2-6 9-6 9 6 9 6-3.2 6-9 6-9-6-9-6z"/><circle cx="12" cy="12" r="2.6"/><path d="M4 20 20 4"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3.5"/><circle cx="8.8" cy="8.8" r=".9"/><circle cx="15.2" cy="15.2" r=".9"/><circle cx="15.2" cy="8.8" r=".9"/><circle cx="8.8" cy="15.2" r=".9"/><circle cx="12" cy="12" r=".9"/>',
  door: '<path d="M6 21V5.5A2.5 2.5 0 0 1 8.5 3h7A2.5 2.5 0 0 1 18 5.5V21M4 21h16"/><circle cx="14.6" cy="12.4" r=".9"/>',
  back: '<path d="M10 6 4 12l6 6M4 12h16"/>',
  turn: '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v4.5h-4.5"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.9 12.2a1.5 1.5 0 0 0 1.5 1.3h6.2a1.5 1.5 0 0 0 1.5-1.3L17.5 7M10 11v6M14 11v6"/>',
  lang: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.4 3.4 5.3 3.4 8.5s-1 6.1-3.4 8.5c-2.4-2.4-3.4-5.3-3.4-8.5s1-6.1 3.4-8.5z"/>',
  play: '<path d="M7 4.8v14.4a.8.8 0 0 0 1.2.7l11.3-7.2a.8.8 0 0 0 0-1.4L8.2 4.1A.8.8 0 0 0 7 4.8z"/>',
  down: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/>',
  up: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 19.5h14"/>',
  panel: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M14.5 4.5v15"/>',
  warn: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17.2v.1"/>',
  ok: '<circle cx="12" cy="12" r="8.5"/><path d="m8 12.3 2.7 2.7L16.2 9.5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/>',
};

export function icon(name: keyof typeof P | string, size = 20): string {
  return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] ?? ''}</svg>`;
}
