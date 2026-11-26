import { db, type LogEntry, type Track } from '../lib/db';
import { exportBackup } from '../lib/export';
import { DEFAULT_SETTINGS } from '../lib/flightDetector';
import type { AppSettings } from '../lib/settings';
import MapSettings from './MapSettings';
import { AircraftSettings, InstructorSettings } from './FleetSettings';

export default function SettingsView({ settings, onChange, onDataChanged }: { settings: AppSettings; onChange: (s: AppSettings) => void; onDataChanged: () => void }) {
  const det = settings.detector;
  const setDet = (k: keyof typeof det, v: number) => onChange({ ...settings, detector: { ...det, [k]: v } });

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
    <div className="settings-grid">
      <div className="card">
        <h2>Pilot</h2>
        <label>
          Name (wird als PIC eingetragen)
          <input value={settings.pilotName} onChange={(e) => onChange({ ...settings, pilotName: e.target.value })} />
        </label>
      </div>

      <AircraftSettings settings={settings} onChange={onChange} />
      <InstructorSettings settings={settings} onChange={onChange} />

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
      <p className="small muted settings-foot" style={{ textAlign: 'center' }}>
        Platzrunde · Draft v0.2 · Flugplatzdaten: OurAirports (Public Domain) · Karten © OpenStreetMap / OpenTopoMap / openAIP
        <br />
        Kein zugelassenes Navigationsgerät – nur zur Unterstützung.
      </p>
    </div>
  );
}
