// Linien-Icons im Stil des Designs (Strichstärke 1.6, Tannengrün)
const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export const BrandMark = () => (
  <svg viewBox="0 0 46 24" aria-hidden>
    {/* stilisierte Platzrunde: abgerundetes Rechteck mit Position */}
    <path d="M8 21h26c2.5 0 4.3-1.4 5-3.6l2.6-9C42.4 5.6 40.9 3 38 3H12C9.6 3 7.7 4.4 7 6.6L3.6 17.4C2.9 19.4 5.4 21 8 21z" {...P} strokeWidth={1.8} />
    <circle cx="42" cy="4" r="2.2" fill="currentColor" />
  </svg>
);

export const IconBook = () => (
  <svg viewBox="0 0 32 32" aria-hidden>
    <path d="M16 8.5C13 6.5 8.5 6 4 6.5v18c4.5-.5 9 0 12 2 3-2 7.5-2.5 12-2v-18c-4.5-.5-9 0-12 2z" {...P} />
    <path d="M16 8.5v18" {...P} />
  </svg>
);

export const IconPlane = () => (
  <svg viewBox="0 0 32 32" aria-hidden>
    <path d="M16 4.5c1 0 1.6 1 1.6 2.3V13l11 3.2v2.3l-11-1.6v5.6l3.2 2.3v1.7L16 25.6l-4.8 1.2v-1.7l3.2-2.3v-5.6l-11 1.6v-2.3l11-3.2V6.8c0-1.3.6-2.3 1.6-2.3z" {...P} />
    <path d="M9 9.5h14" {...P} />
  </svg>
);

export const IconStats = () => (
  <svg viewBox="0 0 32 32" aria-hidden>
    <rect x="5" y="17" width="5" height="10" {...P} />
    <rect x="13.5" y="11" width="5" height="16" {...P} />
    <rect x="22" y="5" width="5" height="22" {...P} />
  </svg>
);

export const IconSliders = () => (
  <svg viewBox="0 0 32 32" aria-hidden>
    <path d="M4 10h24M4 22h24" {...P} />
    <circle cx="20" cy="10" r="3" {...P} fill="var(--paper)" />
    <circle cx="12" cy="22" r="3" {...P} fill="var(--paper)" />
  </svg>
);
