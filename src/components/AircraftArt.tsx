import { useEffect, useState } from 'react';
import { db } from '../lib/db';
import type { AppSettings } from '../lib/settings';

/**
 * Flugzeug-Zeichnungen mit Kennzeichen auf dem Rumpf.
 * Position je Zeichnung: Mitte x/y in %, Drehung in Grad, Schriftgröße in % der Bildbreite.
 */
export const ARTWORK = [
  { id: 'wt9', name: 'Aerospool WT9 Dynamic', match: /wt.?9|dynamic/i, reg: { x: 66, y: 55, rot: -2, size: 5 } },
  { id: 'ctls', name: 'Flight Design CTLS', match: /\bct\b|ctls|ctsw|flight ?design/i, reg: { x: 50, y: 54.5, rot: -1, size: 3.6 } },
  { id: 'c172', name: 'Cessna 172', match: /c ?1[57]\d|cessna|skyhawk|c42|ikarus|hochdecker/i, reg: { x: 66, y: 60, rot: -3, size: 5.2 } },
  { id: 'pa18', name: 'Piper PA-18 Super Cub', match: /pa.?18|cub|husky|spornrad/i, reg: { x: 66, y: 49, rot: -2, size: 5 } },
  { id: 'pa28', name: 'Piper PA-28', match: /pa.?28|archer|warrior|cherokee|arrow/i, reg: { x: 73, y: 47.5, rot: -3, size: 4.8 } },
  { id: 'dr400', name: 'Robin DR400', match: /dr.?4|robin|dr.?3/i, reg: { x: 74, y: 44.5, rot: -3, size: 4.6 } },
] as const;

export type ArtId = (typeof ARTWORK)[number]['id'];

/** Bild für ein Luftfahrzeug: gewählt, sonst anhand des Musters geraten, sonst WT9 */
export function artFor(ac: { type: string; image?: string } | undefined) {
  if (ac?.image === 'none') return null;
  if (ac?.image?.startsWith('custom:')) return { custom: ac.image.slice(7) };
  const chosen = ARTWORK.find((a) => a.id === ac?.image);
  if (chosen) return chosen;
  return ARTWORK.find((a) => ac && a.match.test(ac.type)) ?? ARTWORK[0];
}

function CustomPhoto({ id, reg }: { id: string; reg: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let u: string | null = null;
    db.get<Blob>(`acimg:${id}`).then((b) => {
      if (b) setUrl((u = URL.createObjectURL(b)));
    });
    return () => {
      if (u) URL.revokeObjectURL(u);
    };
  }, [id]);
  return (
    <div className="ac-art photo">
      {url && <img src={url} alt={reg} />}
      {reg && <span className="photo-reg">{reg}</span>}
    </div>
  );
}

/** Zeichnung mit aufgemaltem Kennzeichen */
export default function AircraftArt({ ac, small = false }: { ac: { reg: string; type: string; image?: string } | undefined; small?: boolean }) {
  const art = artFor(ac);
  if (!art) return null;
  if ('custom' in art) return <CustomPhoto id={art.custom} reg={ac?.reg ?? ''} />;
  return (
    <div className={`ac-art ${small ? 'small' : ''}`}>
      <img src={`./aircraft/${art.id}.png`} alt={art.name} />
      {ac?.reg && (
        <span
          className="ac-reg"
          style={{ left: `${art.reg.x}%`, top: `${art.reg.y}%`, fontSize: `${art.reg.size}cqw`, transform: `translate(-50%, -50%) rotate(${art.reg.rot}deg)` }}
        >
          {ac.reg}
        </span>
      )}
    </div>
  );
}

export function defaultAircraft(s: AppSettings) {
  return s.aircraft.find((a) => a.reg === s.defaultAircraft) ?? s.aircraft[0];
}
