import { useEffect, useRef } from 'react';
import type { AircraftCfg } from '../lib/settings';
import AircraftArt from './AircraftArt';

/**
 * „Hangar“: Flugzeuge als wischbare Karten (Zeichnung mit aufgemaltem Kennzeichen).
 * Die mittig eingerastete Karte ist ausgewählt.
 */
export default function Hangar({ aircraft, value, onChange, onAdd }: { aircraft: AircraftCfg[]; value: string; onChange: (reg: string) => void; onAdd: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const idx = Math.max(0, aircraft.findIndex((a) => a.reg === value));

  // beim Öffnen zur gewählten Karte springen
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollLeft = idx * el.clientWidth;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    const a = aircraft[i];
    if (a && a.reg !== value) onChange(a.reg);
  };

  const goTo = (i: number) => ref.current?.scrollTo({ left: i * ref.current.clientWidth, behavior: 'smooth' });

  if (!aircraft.length) {
    return (
      <button className="hangar-empty" onClick={onAdd}>
        <AircraftArt ac={{ reg: 'D-M…', type: '' }} />
        <span>＋ Luftfahrzeug anlegen</span>
      </button>
    );
  }

  return (
    <div className="hangar">
      <div className="hangar-track" ref={ref} onScroll={onScroll}>
        {aircraft.map((a) => (
          <div key={a.reg} className="hangar-card">
            <AircraftArt ac={a} />
            <div className="hangar-meta">
              <span className="reg">{a.reg}</span>
              <span className="type">{a.type}</span>
            </div>
          </div>
        ))}
      </div>
      {aircraft.length > 1 && (
        <div className="hangar-dots" role="tablist" aria-label="Luftfahrzeug wählen">
          {aircraft.map((a, i) => (
            <button key={a.reg} className={i === idx ? 'on' : ''} aria-label={a.reg} onClick={() => goTo(i)} />
          ))}
        </div>
      )}
    </div>
  );
}
