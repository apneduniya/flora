const svg = (d: string, extra = "") =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;

export const ICONS = {
  // Five-petal bloom: the flora mark.
  flora: `<svg viewBox="0 0 24 24" fill="currentColor"><g opacity=".95">${[0, 72, 144, 216, 288]
    .map((r) => `<ellipse cx="12" cy="6.6" rx="3.3" ry="5" transform="rotate(${r} 12 12)" opacity=".82"/>`)
    .join("")}</g><circle cx="12" cy="12" r="2.6" fill="#fff"/></svg>`,
  send: svg('<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>'),
  close: svg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
  undo: svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  eyeOff: svg('<path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 7 10 7a17.6 17.6 0 0 1-2.16 3.19"/><path d="M6.61 6.61A17.4 17.4 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.39-1.61"/><path d="m2 2 20 20"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/>'),
  sparkle: svg('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.2 2.2M15.5 15.5l2.2 2.2M6.3 17.7l2.2-2.2M15.5 8.5l2.2-2.2"/>'),
  eye: svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'),
};
