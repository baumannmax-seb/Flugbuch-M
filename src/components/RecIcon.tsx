/**
 * Aufnahme-Symbol: klassischer roter Aufnahme-Punkt mit Dreiblatt-Propeller.
 * Während einer laufenden Aufzeichnung dreht sich der Propeller.
 */
const BLADE = 'M16 16 C13.9 12.6 13.7 8 15 4.6 C15.4 3.7 16.5 3.8 16.8 4.7 C17.7 8 17.4 12.4 16 16 Z';

export default function RecIcon({ size = 26, spinning = false }: { size?: number; spinning?: boolean }) {
  return (
    <svg className={`rec-icon ${spinning ? 'spinning' : ''}`} width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r="15" fill="var(--red)" />
      <g className="prop" fill="#fff6e8">
        <path d={BLADE} />
        <path d={BLADE} transform="rotate(120 16 16)" />
        <path d={BLADE} transform="rotate(240 16 16)" />
        <circle cx="16" cy="16" r="2.8" stroke="var(--red)" strokeWidth="1" />
      </g>
    </svg>
  );
}
