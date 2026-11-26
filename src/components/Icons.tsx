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

/** Kleines Propellerflugzeug / UL in Draufsicht (gerader Flügel, Propeller, T-Leitwerk) */
export const IconPlane = () => (
  <svg viewBox="0 0 32 32" aria-hidden>
    <path d="M12.5 3.6h7" {...P} />
    <rect x="3" y="11" width="26" height="4.6" rx="2.1" {...P} fill="var(--paper)" />
    <rect x="10.4" y="24.2" width="11.2" height="2.8" rx="1.3" {...P} fill="var(--paper)" />
    <path d="M14.5 7.6c0-1.6.6-3 1.5-3s1.5 1.4 1.5 3l-.3 14.6-.7 5.6h-1l-.7-5.6z" {...P} fill="var(--paper)" />
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
