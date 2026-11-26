import { useState } from 'react';
import type { Recorder } from '../lib/recorder';
import type { AppSettings } from '../lib/settings';
import type { Airfield } from '../lib/airfields';
import AirfieldSearch from './AirfieldSearch';

/** Entwickler-Werkzeug: spielt eine Platzrunde mit Touch-and-Go und Full-Stop ab */
export default function SimulatorCard({ recorder, settings, onStarted }: { recorder: Recorder; settings: AppSettings; onStarted: () => void }) {
  const [field, setField] = useState<Airfield | null>(null);
  const [pick, setPick] = useState(false);
  const [speedup, setSpeedup] = useState(10);
  const start = () => {
    if (!field || recorder.state.active) return;
    recorder.aircraftReg = recorder.aircraftReg || settings.defaultAircraft;
    recorder.start('sim', { lat: field.lat, lon: field.lon, elevFt: field.elevFt, speedup });
    onStarted();
  };
  return (
    <div className="card">
      <h2>Simulator (Testwerkzeug)</h2>
      <p className="small muted" style={{ marginTop: 0 }}>
        Spielt eine Platzrunde mit Touch-and-Go und Full-Stop ab, um Erkennung und Navi ohne Flugzeug zu testen. Der Flug wird mit „SIM“ markiert ins Flugbuch eingetragen.
      </p>
      {field && !pick ? (
        <div className="row" style={{ marginBottom: 10 }}>
          <div><b>{field.icao}</b> {field.name}</div>
          <button style={{ flex: '0 0 auto' }} onClick={() => setPick(true)}>Ändern</button>
        </div>
      ) : (
        <div style={{ marginBottom: 10 }}>
          <AirfieldSearch autoFocus={false} onPick={(a) => { setField(a); setPick(false); }} placeholder="Platz suchen, z.B. EDFE" />
        </div>
      )}
      <div className="row">
        <label style={{ margin: 0 }}>
          Zeitraffer
          <select value={speedup} onChange={(e) => setSpeedup(Number(e.target.value))}>
            <option value={1}>Echtzeit (ca. 17 min)</option>
            <option value={5}>5×</option>
            <option value={10}>10×</option>
            <option value={30}>30×</option>
          </select>
        </label>
        <button disabled={!field || recorder.state.active} onClick={start}>Simulation starten</button>
      </div>
    </div>
  );
}
