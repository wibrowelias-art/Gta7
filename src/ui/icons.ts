import { svg } from './dom';

/** One consistent icon set: 24px grid, 2px stroke, round caps and joins. */
const P: Record<string, string> = {
  cash: '<rect x="3" y="6" width="18" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.6"/><path d="M6.5 9.5h.01M17.5 14.5h.01"/>',
  team: '<circle cx="9" cy="8.5" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="9.5" r="2.4"/><path d="M15.5 19a4.5 4.5 0 0 1 5-4.4"/>',
  build: '<path d="M4 20V9l5-3 5 3v11"/><path d="M14 20V12l6-3v11"/><path d="M4 20h16"/><path d="M8 13h1M8 16h1"/>',
  chat: '<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V16H6.5A2.5 2.5 0 0 1 4 13.5z"/><path d="M8.5 9h7M8.5 12h4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M5.6 18.4l1.6-1.6M16.8 7.2l1.6-1.6"/>',
  close: '<path d="M7 7l10 10M17 7L7 17"/>',
  back: '<path d="M14 6l-6 6 6 6"/>',
  command: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 8v8M8.5 10l7 4M15.5 10l-7 4"/>',
  factory: '<path d="M3 20V9l5 3V9l5 3V7l5 3v10z"/><path d="M7 16h2M12 16h2M17 16h2"/>',
  shop: '<path d="M4 9l1.2-4h13.6L20 9"/><path d="M4 9h16v2a2.5 2.5 0 0 1-5 0 2.5 2.5 0 0 1-6 0 2.5 2.5 0 0 1-5 0z"/><path d="M6 13v7h12v-7"/><path d="M10 20v-4h4v4"/>',
  treasury: '<rect x="4" y="5" width="16" height="14" rx="2.5"/><circle cx="12" cy="12" r="3"/><path d="M12 10.5v3M9.3 12h.6M14.1 12h.6"/>',
  bar: '<path d="M6 4h12l-5.5 7v6"/><path d="M9 20h6"/><path d="M8 7h8"/>',
  server: '<rect x="4" y="4" width="16" height="6" rx="1.5"/><rect x="4" y="14" width="16" height="6" rx="1.5"/><path d="M8 7h.01M8 17h.01M12 7h4M12 17h4"/>',
  studio: '<rect x="3" y="7" width="13" height="10" rx="2"/><path d="M16 11l5-3v8l-5-3"/><circle cx="8" cy="12" r="1.6"/>',
  lab: '<path d="M9 3h6"/><path d="M10 3v6L5 18.5A1.6 1.6 0 0 0 6.4 21h11.2a1.6 1.6 0 0 0 1.4-2.5L14 9V3"/><path d="M8 15h8"/>',
  bolt: '<path d="M13 3L5 14h6l-1 7 9-12h-6z"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9l-5.3 2.8 1.1-5.9-4.3-4.1 5.9-.8z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  play: '<path d="M7 5v14l11-7z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  fast: '<path d="M4 6v12l8-6zM12 6v12l8-6z"/>',
  up: '<path d="M12 19V6M6 12l6-6 6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  hire: '<circle cx="10" cy="8" r="3.2"/><path d="M4 19.5a6 6 0 0 1 12 0"/><path d="M18 8v6M15 11h6"/>',
  meeting: '<circle cx="12" cy="7" r="2.5"/><circle cx="5.5" cy="10" r="2"/><circle cx="18.5" cy="10" r="2"/><path d="M3 20a4 4 0 0 1 5-3.9M21 20a4 4 0 0 0-5-3.9M8 20a4 4 0 0 1 8 0"/>',
  radar: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/><path d="M12 4v4M12 12l5.5-5.5"/>',
  report: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  sound: '<path d="M4 10v4h3l4 3.5v-11L7 10z"/><path d="M15 9.5a3.5 3.5 0 0 1 0 5M17.5 7a7 7 0 0 1 0 10"/>',
  music: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  locate: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><circle cx="12" cy="12" r="8"/>',
  send: '<path d="M4 12l16-7-5 16-3-6z"/><path d="M12 15l8-10"/>',
  flag: '<path d="M6 21V4"/><path d="M6 4h11l-2 4 2 4H6"/>',
  coin: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5v9M9.5 10.3c0-1 1.1-1.8 2.5-1.8s2.5.8 2.5 1.8-1.1 1.6-2.5 1.7-2.5.7-2.5 1.7 1.1 1.8 2.5 1.8 2.5-.8 2.5-1.8"/>',
  box: '<path d="M3.5 8L12 3.5 20.5 8 12 12.5z"/><path d="M3.5 8v8l8.5 4.5V12.5M20.5 8v8L12 20.5"/>',
  fire: '<path d="M12 21c-4 0-6.5-2.6-6.5-6 0-3 2.5-5.3 3.5-7.5.8 1.6 1.5 2.6 2.5 3.3C12 8.5 12.5 5.5 14 3c2 3 4.5 6.5 4.5 11 0 4.4-2.5 7-6.5 7z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  alert: '<path d="M12 3.5l9 16H3z"/><path d="M12 10v4M12 17.5h.01"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
  trash: '<path d="M5 7h14M9 7V4.5h6V7M7 7l1 13h8l1-13"/>',
  smile: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14s1.2 2 3.5 2 3.5-2 3.5-2M9.5 10h.01M14.5 10h.01"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  skip: '<path d="M5 5l9 7-9 7zM18 5v14"/>',
  wifi: '<path d="M3 9.5a14 14 0 0 1 18 0M6.5 13a9 9 0 0 1 11 0M10 16.5a4 4 0 0 1 4 0"/><path d="M12 19.5h.01"/>',
  battery: '<rect x="3" y="7" width="16" height="10" rx="2"/><path d="M21 10.5v3M6 10v4M9 10v4"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
};

export type IconName = keyof typeof P;

export function icon(name: IconName | string, cls?: string): SVGElement {
  const path = P[name] ?? P.info;
  return svg(
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`,
    cls,
  );
}

export const ICON_NAMES = Object.keys(P) as IconName[];
