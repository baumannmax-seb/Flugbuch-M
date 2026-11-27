// Linien-Icons im Stil des Designs (Strichstärke 1.6, Tannengrün)
const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

/** App-Zeichen: Propellerflugzeug im Steigflug mit Spur ab rotem Punkt (wie das App-Icon) */
export const BrandMark = ({ size = 40 }: { size?: number }) => (
  <svg viewBox="0 0 512 512" width={size} height={size} aria-hidden style={{ flex: '0 0 auto' }}>
    <rect width="512" height="512" rx="112" fill="#1c4535" />
    <path d="M134 388 C 214 380, 278 336, 296 248" fill="none" stroke="#f6efe4" strokeWidth="15" strokeLinecap="round" />
    <circle cx="118" cy="392" r="27" fill="#c63d24" />
    <g transform="translate(352 178) rotate(42)" fill="#f6efe4">
      <rect x="-13" y="-74" width="26" height="160" rx="13" />
      <path d="M-100 -24 Q-100 -34 -90 -34 L90 -34 Q100 -34 100 -24 L100 -4 Q100 6 90 5 L-90 5 Q-100 6 -100 -4 Z" />
      <rect x="-44" y="62" width="88" height="24" rx="9" />
      <circle cx="0" cy="-76" r="10" />
      <rect x="-34" y="-90" width="68" height="9" rx="4.5" />
    </g>
  </svg>
);

/** Start: Haus */
export const IconHome = () => (
  <svg viewBox="0 0 32 32" aria-hidden>
    <path d="M5 14.5 16 5l11 9.5" {...P} />
    <path d="M8 12.5V27h6v-7h4v7h6V12.5" {...P} />
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
