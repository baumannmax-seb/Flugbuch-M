import { useEffect, useState } from 'react';
import type { Airfield } from '../lib/airfields';
import {
  addFieldDoc,
  DEFAULT_CIRCUIT,
  getDetailsSync,
  getFieldData,
  getFieldDoc,
  loadDetails,
  removeFieldDoc,
  saveFieldData,
  setFieldShown,
  surfaceName,
  type FieldUserData,
} from '../lib/airfieldDetails';
import { bearing, distance, NM_IN_M, pad3 } from '../lib/geo';

/** Detailansicht eines Flugplatzes (öffnet sich beim Tippen auf einen Platz in der Karte) */
export default function AirfieldSheet({
  field,
  pos,
  onClose,
  onDirectTo,
  onChanged,
}: {
  field: Airfield;
  pos: { lat: number; lon: number } | null;
  onClose: () => void;
  onDirectTo: (f: Airfield) => void;
  onChanged: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [data, setData] = useState<FieldUserData | null>(null);

  useEffect(() => {
    loadDetails().then(() => setLoaded(true));
    getFieldData(field.icao).then(setData);
  }, [field.icao]);

  const det = loaded ? getDetailsSync(field.icao) : null;

  const update = async (d: FieldUserData) => {
    setData(d);
    await saveFieldData(field.icao, d);
    await setFieldShown(field.icao, !!d.active);
    onChanged();
  };

  const openDoc = async (id: string) => {
    const blob = await getFieldDoc(field.icao, id);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const dirs = det ? det.runways.flatMap((r) => [r.le, r.he]).filter(Boolean) : [];
  const active = data?.active ?? null;
  const cfg = active ? { ...DEFAULT_CIRCUIT, ...data?.circuits[active] } : null;
  const setCfg = (patch: Partial<typeof DEFAULT_CIRCUIT>) =>
    data && active && update({ ...data, circuits: { ...data.circuits, [active]: { ...DEFAULT_CIRCUIT, ...data.circuits[active], ...patch } } });

  const isGerman = field.icao.startsWith('ED') || field.icao.startsWith('ET');

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <div>
            <h3>{field.icao}</h3>
            <div className="muted small">
              {field.name}
              {det?.city ? ` · ${det.city}` : ''}
            </div>
          </div>
          <button className="ghost close-x" onClick={onClose}>✕</button>
        </div>

        <div className="row" style={{ marginBottom: 12 }}>
          <div className="kpi"><div className="v">{field.elevFt}</div><div className="l">ft Platzhöhe</div></div>
          {pos && (
            <div className="kpi">
              <div className="v">{(distance(pos.lat, pos.lon, field.lat, field.lon) / NM_IN_M).toFixed(1)}</div>
              <div className="l">NM · {pad3(bearing(pos.lat, pos.lon, field.lat, field.lon))}°</div>
            </div>
          )}
        </div>
        <button className="primary big" onClick={() => onDirectTo(field)}>D→ Direct-To {field.icao}</button>

        <div className="card" style={{ marginTop: 12 }}>
          <h2>Pisten</h2>
          {!det && <div className="muted small">Lade …</div>}
          {det && det.runways.length === 0 && <div className="muted small">Keine Pistendaten vorhanden.</div>}
          {det?.runways.map((r, i) => (
            <div key={i} className="small" style={{ padding: '4px 0', borderBottom: '1px solid var(--line)' }}>
              <b style={{ fontSize: 16 }}>{r.le}{r.he ? `/${r.he}` : ''}</b> · {Math.round(r.lengthFt * 0.3048)} × {Math.round(r.widthFt * 0.3048)} m · {surfaceName(r.surface)}
              {r.lighted ? ' · befeuert' : ''}
            </div>
          ))}
        </div>

        {det && det.freqs.length > 0 && (
          <div className="card">
            <h2>Frequenzen</h2>
            {det.freqs.map((f, i) => (
              <div key={i} className="row small" style={{ padding: '3px 0' }}>
                <div>{f.desc || f.type}</div>
                <b style={{ flex: '0 0 auto', fontSize: 16 }}>{Number(f.mhz).toFixed(3)}</b>
              </div>
            ))}
          </div>
        )}

        {data && det && dirs.length > 0 && (
          <div className="card">
            <h2>Platzrunde auf Karte</h2>
            <div className="chips">
              <button className={!active ? 'on' : ''} onClick={() => update({ ...data, active: null })}>aus</button>
              {dirs.map((d) => (
                <button key={d} className={active === d ? 'on' : ''} onClick={() => update({ ...data, active: d })}>
                  Pist. {d}
                </button>
              ))}
            </div>
            {active && cfg && (
              <>
                <div className="grid2" style={{ marginTop: 10 }}>
                  <label>
                    Richtung
                    <select value={cfg.dir} onChange={(e) => setCfg({ dir: e.target.value as 'L' | 'R' })}>
                      <option value="L">Linksplatzrunde</option>
                      <option value="R">Rechtsplatzrunde</option>
                    </select>
                  </label>
                  <label>
                    Abstand Gegenanflug
                    <select value={cfg.offsetM} onChange={(e) => setCfg({ offsetM: Number(e.target.value) })}>
                      {[600, 800, 1000, 1200, 1500, 1800, 2200].map((m) => (
                        <option key={m} value={m}>{m} m ({(m / NM_IN_M).toFixed(1)} NM)</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label>
                  Platzrundenhöhe (Notiz)
                  <input value={cfg.altFt} placeholder="z.B. 1400 ft MSL" onChange={(e) => setCfg({ altFt: e.target.value })} />
                </label>
              </>
            )}
            <p className="small muted" style={{ marginBottom: 0 }}>
              ⚠️ Schematische Darstellung aus der Pistenlage – nicht die veröffentlichte Platzrunde. Richtung, Abstand und Höhe bitte nach
              Sichtanflugkarte / Platzinfo einstellen.
            </p>
          </div>
        )}

        {data && (
          <div className="card">
            <h2>Eigene Notizen & Anflugkarten</h2>
            <label>
              Notizen (PPR, Besonderheiten, Platzrunde …)
              <textarea rows={3} value={data.notes} onChange={(e) => update({ ...data, notes: e.target.value })} />
            </label>
            {data.docs.map((d) => (
              <div key={d.id} className="row" style={{ marginBottom: 6 }}>
                <button onClick={() => openDoc(d.id)} style={{ textAlign: 'left' }}>📄 {d.name}</button>
                <button className="danger" style={{ flex: '0 0 auto' }} onClick={async () => confirm('Datei entfernen?') && setData(await removeFieldDoc(field.icao, d.id))}>✕</button>
              </div>
            ))}
            <label className="button-like">
              <input
                type="file"
                accept="application/pdf,image/*"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) setData(await addFieldDoc(field.icao, f));
                }}
              />
              <span>＋ Anflugkarte hinterlegen (PDF / Bild)</span>
            </label>
          </div>
        )}

        <div className="card">
          <h2>Links</h2>
          <div className="links">
            {isGerman && <a href="https://aip.dfs.de/basicVFR/" target="_blank" rel="noreferrer">DFS AIP VFR (Sichtanflugkarten)</a>}
            {det?.web && <a href={det.web} target="_blank" rel="noreferrer">Website des Platzes</a>}
            {det?.wiki && <a href={det.wiki} target="_blank" rel="noreferrer">Wikipedia</a>}
            <a href={`https://ourairports.com/airports/${encodeURIComponent(field.icao)}/`} target="_blank" rel="noreferrer">OurAirports</a>
          </div>
        </div>
        <p className="small muted">Daten: OurAirports (Public Domain), ohne Gewähr. Vor dem Flug immer amtliche Quellen prüfen.</p>
      </div>
    </div>
  );
}
