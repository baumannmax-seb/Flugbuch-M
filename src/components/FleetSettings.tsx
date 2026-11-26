import { useState } from 'react';
import { db, uid } from '../lib/db';
import type { AppSettings, AircraftCfg } from '../lib/settings';
import AircraftArt, { ARTWORK, artFor } from './AircraftArt';

/** Einstellungen: Luftfahrzeuge (mit Bildauswahl) und Fluglehrer */
export function AircraftSettings({ settings, onChange }: { settings: AppSettings; onChange: (s: AppSettings) => void }) {
  const [reg, setReg] = useState('');
  const [type, setType] = useState('');
  const [picking, setPicking] = useState<AircraftCfg | null>(null);

  const setAc = (a: AircraftCfg, patch: Partial<AircraftCfg>) =>
    onChange({ ...settings, aircraft: settings.aircraft.map((x) => (x.reg === a.reg ? { ...x, ...patch } : x)) });

  const add = () => {
    if (!reg.trim()) return;
    const ac: AircraftCfg = { reg: reg.trim().toUpperCase(), type: type.trim() };
    onChange({ ...settings, aircraft: [...settings.aircraft.filter((a) => a.reg !== ac.reg), ac], defaultAircraft: settings.defaultAircraft || ac.reg });
    setReg('');
    setType('');
  };

  const remove = async (a: AircraftCfg) => {
    if (!confirm(`${a.reg} entfernen?`)) return;
    if (a.image?.startsWith('custom:')) await db.del(`acimg:${a.image.slice(7)}`);
    const rest = settings.aircraft.filter((x) => x.reg !== a.reg);
    onChange({ ...settings, aircraft: rest, defaultAircraft: settings.defaultAircraft === a.reg ? rest[0]?.reg ?? '' : settings.defaultAircraft });
  };

  const choose = async (a: AircraftCfg, image: string) => {
    // altes eigenes Foto aufräumen
    if (a.image?.startsWith('custom:') && a.image !== image) await db.del(`acimg:${a.image.slice(7)}`);
    setAc(a, { image });
    setPicking(null);
  };

  const uploadPhoto = async (a: AircraftCfg, f: File) => {
    const id = uid();
    await db.set(`acimg:${id}`, f);
    await choose(a, `custom:${id}`);
  };

  const current = picking ? settings.aircraft.find((x) => x.reg === picking.reg) ?? picking : null;

  return (
    <div className="card">
      <h2>Luftfahrzeuge</h2>
      <div className="fleet">
        {settings.aircraft.map((a) => (
          <div key={a.reg} className="fleet-item">
            <button className="art-btn" onClick={() => setPicking(a)} aria-label={`Bild für ${a.reg} wählen`}>
              <AircraftArt ac={a} small />
              {!artFor(a) && <span className="muted small">kein Bild</span>}
            </button>
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <div>
                <div className="serif" style={{ fontSize: 22, fontWeight: 700 }}>
                  {a.reg} {settings.defaultAircraft === a.reg && <span className="badge">STANDARD</span>}
                </div>
                <input value={a.type} placeholder="Muster" onChange={(e) => setAc(a, { type: e.target.value })} />
              </div>
            </div>
            <div className="row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
              <button className="link" style={{ flex: '0 0 auto' }} onClick={() => setPicking(a)}>Bild wählen</button>
              {settings.defaultAircraft !== a.reg && (
                <button className="link" style={{ flex: '0 0 auto' }} onClick={() => onChange({ ...settings, defaultAircraft: a.reg })}>Als Standard</button>
              )}
              <button className="link" style={{ flex: '0 0 auto', color: 'var(--muted)' }} onClick={() => remove(a)}>Entfernen</button>
            </div>
          </div>
        ))}
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <input placeholder="Kennzeichen, z.B. D-MABC" value={reg} onChange={(e) => setReg(e.target.value)} />
        <input placeholder="Muster, z.B. C42" value={type} onChange={(e) => setType(e.target.value)} />
        <button style={{ flex: '0 0 auto' }} onClick={add} disabled={!reg.trim()}>＋</button>
      </div>

      {current && (
        <div className="sheet-backdrop" onClick={() => setPicking(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <h3>Bild für {current.reg}</h3>
              <button className="close-x" onClick={() => setPicking(null)}>✕</button>
            </div>
            <div className="art-grid">
              {ARTWORK.map((art) => (
                <button key={art.id} className={`art-choice ${current.image === art.id ? 'on' : ''}`} onClick={() => choose(current, art.id)}>
                  <AircraftArt ac={{ ...current, image: art.id }} small />
                  <span>{art.name}</span>
                </button>
              ))}
            </div>
            <div className="row" style={{ marginTop: 14 }}>
              <label className="button-like">
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) uploadPhoto(current, f); }} />
                <span>📷 Eigenes Foto</span>
              </label>
              <button onClick={() => choose(current, 'none')}>Kein Bild</button>
            </div>
            <p className="small muted">Ohne Auswahl wird die Zeichnung anhand des Musters gewählt.</p>
          </div>
        </div>
      )}
    </div>
  );
}

export function InstructorSettings({ settings, onChange }: { settings: AppSettings; onChange: (s: AppSettings) => void }) {
  const [name, setName] = useState('');
  const [lic, setLic] = useState('');
  const add = () => {
    const n = name.trim();
    if (!n) return;
    onChange({ ...settings, instructors: [...settings.instructors.filter((i) => i.name !== n), { name: n, license: lic.trim() }], defaultInstructor: settings.defaultInstructor || n });
    setName('');
    setLic('');
  };
  return (
    <div className="card">
      <h2>Fluglehrer</h2>
      {settings.instructors.length === 0 && <p className="small muted" style={{ marginTop: 0 }}>Hinterlegte Fluglehrer stehen beim Aufzeichnen und im Flugbuch zur Auswahl.</p>}
      {settings.instructors.map((i) => (
        <div key={i.name} className="row" style={{ borderBottom: '1px solid var(--rule-soft)', padding: '8px 0' }}>
          <div>
            <b>{i.name}</b> {settings.defaultInstructor === i.name && <span className="badge">STANDARD</span>}
            {i.license && <div className="small muted">{i.license}</div>}
          </div>
          {settings.defaultInstructor !== i.name && (
            <button className="link" style={{ flex: '0 0 auto' }} onClick={() => onChange({ ...settings, defaultInstructor: i.name })}>Standard</button>
          )}
          <button
            className="link"
            style={{ flex: '0 0 auto', color: 'var(--muted)' }}
            onClick={() => onChange({ ...settings, instructors: settings.instructors.filter((x) => x.name !== i.name), defaultInstructor: settings.defaultInstructor === i.name ? '' : settings.defaultInstructor })}
          >
            Entfernen
          </button>
        </div>
      ))}
      <div className="row" style={{ marginTop: 10 }}>
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="Lizenz-Nr. (optional)" value={lic} onChange={(e) => setLic(e.target.value)} />
        <button style={{ flex: '0 0 auto' }} onClick={add} disabled={!name.trim()}>＋</button>
      </div>
    </div>
  );
}
