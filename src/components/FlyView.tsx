import { useState } from 'react';
import type { Recorder, RecorderState } from '../lib/recorder';
import type { AppSettings } from '../lib/settings';
import type { Airfield } from '../lib/airfields';
import { fmtDuration } from '../lib/geo';
import AirfieldSearch from './AirfieldSearch';

const PHASE_TXT = { GROUND: 'Am Boden', AIRBORNE: 'In der Luft', ROLLOUT: 'Ausrollen' } as const;

export default function FlyView({ recorder, rec, settings, onOpenNav, onShowLog }: { recorder: Recorder; rec: RecorderState; settings: AppSettings; onOpenNav: () => void; onShowLog: () => void }) {
  const [reg, setReg] = useState(recorder.aircraftReg || settings.defaultAircraft);
  const [crew, setCrew] = useState(recorder.crew);
  const [simField, setSimField] = useState<Airfield | null>(null);
  const [pickSim, setPickSim] = useState(false);
  const [speedup, setSpeedup] = useState(10);

  const startGps = () => {
    recorder.aircraftReg = reg;
    recorder.crew = crew;
    recorder.start('gps');
    onOpenNav();
  };
  const startSim = () => {
    if (!simField) return;
    recorder.aircraftReg = reg;
    recorder.crew = crew;
    recorder.start('sim', { lat: simField.lat, lon: simField.lon, elevFt: simField.elevFt, speedup });
    onOpenNav();
  };

  if (rec.active) {
    const s = rec.snap;
    return (
      <>
        <div className="card">
          <h2>Aufzeichnung läuft {rec.source === 'sim' && '(Simulator)'}</h2>
          <p style={{ fontSize: 22, margin: '4px 0 10px' }}>
            <b>{s ? PHASE_TXT[s.phase] : '–'}</b>
          </p>
          <div className="kpis">
            <div className="kpi"><div className="v">{fmtDuration(s?.airborneMs ?? 0)}</div><div className="l">Flugzeit</div></div>
            <div className="kpi"><div className="v">{s?.landings ?? 0}</div><div className="l">Landungen</div></div>
            <div className="kpi"><div className="v">{s?.touchAndGos ?? 0}</div><div className="l">Touch&Go</div></div>
          </div>
          <p className="small muted">{rec.points.length} GPS-Punkte · Flug endet automatisch {Math.round(settings.detector.flightEndSec / 60)} min nach der letzten Landung im Stillstand.</p>
          {rec.error && <div className="err">{rec.error}</div>}
          <button className="primary big" onClick={onOpenNav}>🗺️ Navi / Moving Map öffnen</button>
          <div style={{ height: 8 }} />
          <button className="danger big" onClick={() => confirm('Aufzeichnung jetzt beenden?') && recorder.stop()}>Aufzeichnung beenden</button>
        </div>
      </>
    );
  }

  return (
    <>
      {rec.savedEntryId && (
        <div className="card" style={{ borderColor: 'var(--ok)' }}>
          <h2 className="status-ok">✓ Flug gespeichert</h2>
          <p style={{ margin: '0 0 10px' }}>
            {rec.snap?.landings} Landung(en), davon {rec.snap?.touchAndGos} Touch-and-Go · Flugzeit {fmtDuration(rec.snap?.airborneMs ?? 0)}
          </p>
          <button onClick={onShowLog}>Im Flugbuch ansehen</button>
        </div>
      )}
      {rec.snap && !rec.savedEntryId && rec.snap.takeoffs === 0 && (
        <div className="card muted">Letzte Aufzeichnung enthielt keinen Start – kein Eintrag angelegt.</div>
      )}
      <div className="card">
        <h2>Flug aufzeichnen</h2>
        <label>
          Luftfahrzeug
          <select value={reg} onChange={(e) => setReg(e.target.value)}>
            <option value="">– ohne –</option>
            {settings.aircraft.map((a) => (
              <option key={a.reg} value={a.reg}>{a.reg} · {a.type}</option>
            ))}
          </select>
        </label>
        <div className="grid2">
          <label>
            Funktion
            <select value={crew.role} onChange={(e) => setCrew({ ...crew, role: e.target.value as typeof crew.role })}>
              <option value="PIC">PIC (allein / verantwortlich)</option>
              <option value="DUAL">Schulung mit Fluglehrer</option>
              <option value="FI">Ich als Fluglehrer</option>
            </select>
          </label>
          {crew.role === 'DUAL' && (
            <label>
              Fluglehrer
              <input value={crew.instructor} placeholder="Name FI" onChange={(e) => setCrew({ ...crew, instructor: e.target.value })} />
            </label>
          )}
          {crew.role === 'FI' && (
            <label>
              Flugschüler
              <input value={crew.student} placeholder="Name Schüler" onChange={(e) => setCrew({ ...crew, student: e.target.value })} />
            </label>
          )}
        </div>
        <button className="primary big" onClick={startGps}>▶ GPS-Aufzeichnung starten</button>
        <p className="small muted">
          Einfach vor dem Rollen starten und das Handy ablegen. Start, jede Landung, Touch-and-Go und Full-Stop werden
          automatisch erkannt, Start-/Zielplatz aus der Flugplatzdatenbank ermittelt. Nach dem Abstellen wird der Flug
          selbstständig ins Flugbuch eingetragen.
        </p>
      </div>

      <div className="card">
        <h2>Simulator (Testen ohne Flugzeug)</h2>
        <p className="small muted" style={{ marginTop: 0 }}>
          Spielt eine Platzrunde mit Touch-and-Go und anschließender Full-Stop-Landung ab – ideal, um Erkennung und Navi
          am Schreibtisch auszuprobieren.
        </p>
        {simField && !pickSim ? (
          <div className="row" style={{ marginBottom: 10 }}>
            <div><b>{simField.icao}</b> {simField.name}</div>
            <button style={{ flex: '0 0 auto' }} onClick={() => setPickSim(true)}>Ändern</button>
          </div>
        ) : (
          <div style={{ marginBottom: 10 }}>
            <AirfieldSearch onPick={(a) => { setSimField(a); setPickSim(false); }} placeholder="Platz für Simulation, z.B. EDFE" />
          </div>
        )}
        <label>
          Zeitraffer
          <select value={speedup} onChange={(e) => setSpeedup(Number(e.target.value))}>
            <option value={1}>Echtzeit (ca. 17 min)</option>
            <option value={5}>5×</option>
            <option value={10}>10×</option>
            <option value={30}>30×</option>
          </select>
        </label>
        <button className="big" disabled={!simField} onClick={startSim}>▶ Simulation starten</button>
      </div>

      <div className="card">
        <h2>Nur Navi</h2>
        <button className="big" onClick={onOpenNav}>🗺️ Moving Map ohne Aufzeichnung</button>
      </div>
    </>
  );
}
