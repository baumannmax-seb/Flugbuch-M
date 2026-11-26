import { useState } from 'react';
import { db, type LogEntry, type Track } from '../lib/db';
import { exportBackup } from '../lib/export';
import { DEFAULT_SETTINGS } from '../lib/flightDetector';
import type { AppSettings } from '../lib/settings';
import MapSettings from './MapSettings';

export default function SettingsView({ settings, onChange, onDataChanged }: { settings: AppSettings; onChange: (s: AppSettings) => void; onDataChanged: () => void }) {
  const [reg, setReg] = useState('');
  const [type, setType] = useState('');
  const det = settings.detector;
  const setDet = (k: keyof typeof det, v: number) => onChange({ ...settings, detector: { ...det, [k]: v } });

  const addAc = () => {
    if (!reg.trim()) return;
    const ac = { reg: reg.trim().toUpperCase(), type: type.trim() };
    onChange({ ...settings, aircraft: [...settings.aircraft.filter((a) => a.reg !== ac.reg), ac], defaultAircraft: settings.defaultAircraft || ac.reg });
    setReg('');
    setType('');
  };

  const backup = async () => {
    const entries = await db.listEntries();
    const tracks = (await Promise.all(entries.filter((e) => e.trackId).map((e) => db.getTrack(e.trackId!)))).filter(Boolean);
    exportBackup({ version: 1, settings, entries, tracks });
  };

  const restore = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as { settings?: AppSettings; entries: LogEntry[]; tracks: Track[] };
      if (!Array.isArray(data.entries)) throw new Error('Ungültige Datei');
      for (const t of data.tracks ?? []) await db.putTrack(t);
      for (const e of data.entries) await db.putEntry(e);
      if (data.settings) onChange(data.settings);
      onDataChanged();
      alert(`${data.entries.length} Einträge importiert.`);
    } catch (e) {
      alert('Import fehlgeschlagen: ' + (e as Error).message);
    }
  };

  const num = (k: keyof typeof det, label: string, unit: string) => (
    <label>
      {label} ({unit})
      <input type="number" value={det[k] as number} onChange={(e) => setDet(k, Number(e.target.value))} />
    </label>
  );

  return (
    <>
      <div className="card">
        <h2>Pilot</h2>
        <label>
          Name (wird als PIC eingetragen)
          <input value={settings.pilotName} onChange={(e) => onChange({ ...settings, pilotName: e.target.value })} />
        </label>
      </div>

      <div className="card">
        <h2>Luftfahrzeuge</h2>
        {settings.aircraft.map((a) => (
          <div key={a.reg} className="row" style={{ marginBottom: 8 }}>
            <div>
              <b>{a.reg}</b> {a.type} {settings.defaultAircraft === a.reg && <span className="badge">Standard</span>}
            </div>
            {settings.defaultAircraft !== a.reg && (
              <button style={{ flex: '0 0 auto' }} onClick={() => onChange({ ...settings, defaultAircraft: a.reg })}>Standard</button>
            )}
            <button style={{ flex: '0 0 auto' }} className="danger" onClick={() => onChange({ ...settings, aircraft: settings.aircraft.filter((x) => x.reg !== a.reg) })}>✕</button>
          </div>
        ))}
        <div className="row">
          <input placeholder="D-MABC" value={reg} onChange={(e) => setReg(e.target.value)} />
          <input placeholder="Muster, z.B. C42" value={type} onChange={(e) => setType(e.target.value)} />
          <button style={{ flex: '0 0 auto' }} onClick={addAc}>＋</button>
        </div>
      </div>

      <MapSettings settings={settings} onChange={onChange} />

      <div className="card">
        <h2>Automatische Erkennung</h2>
        <p className="small muted" style={{ marginTop: 0 }}>
          Schwellen an dein Luftfahrzeug anpassen. Startgeschwindigkeit etwas unter der Abhebegeschwindigkeit, Landeschwelle
          deutlich darunter (Hysterese).
        </p>
        <div className="grid2">
          {num('takeoffKt', 'Start ab', 'kt GS')}
          {num('landingKt', 'Landung unter', 'kt GS')}
          {num('fullStopKt', 'Full-Stop unter', 'kt')}
          {num('touchdownAglFt', 'Aufsetzen unter', 'ft über Grund')}
          {num('confirmSec', 'Bestätigung', 's')}
          {num('flightEndSec', 'Flugende nach Stillstand', 's')}
        </div>
        <button onClick={() => onChange({ ...settings, detector: { ...DEFAULT_SETTINGS } })}>Standardwerte</button>
      </div>

      <div className="card">
        <h2>Daten</h2>
        <p className="small muted" style={{ marginTop: 0 }}>Alle Daten liegen nur lokal auf diesem Gerät. Regelmäßig sichern!</p>
        <div className="row">
          <button onClick={backup}>Backup exportieren</button>
          <label style={{ margin: 0 }}>
            <span className="muted small">Backup importieren</span>
            <input type="file" accept="application/json" onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])} />
          </label>
        </div>
      </div>
      <p className="small muted" style={{ textAlign: 'center' }}>
        Flugbuch M · Draft v0.1 · Flugplatzdaten: OurAirports (Public Domain) · Karten © OpenStreetMap / OpenTopoMap / openAIP
        <br />
        Kein zugelassenes Navigationsgerät – nur zur Unterstützung.
      </p>
    </>
  );
}
