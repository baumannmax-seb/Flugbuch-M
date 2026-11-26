import { useState } from 'react';
import type { Recorder, RecorderState } from '../lib/recorder';
import type { AppSettings } from '../lib/settings';
import type { Airfield } from '../lib/airfields';
import { fmtDuration } from '../lib/geo';
import AirfieldSearch from './AirfieldSearch';
import InstructorPicker from './InstructorPicker';
import AircraftArt from './AircraftArt';

const PHASE_TXT = { GROUND: 'Am Boden', AIRBORNE: 'In der Luft', ROLLOUT: 'Ausrollen' } as const;

export default function FlyView({ recorder, rec, settings, onOpenNav, onShowLog }: { recorder: Recorder; rec: RecorderState; settings: AppSettings; onOpenNav: () => void; onShowLog: () => void }) {
  const [reg, setReg] = useState(recorder.aircraftReg || settings.defaultAircraft);
  const [crew, setCrew] = useState({ ...recorder.crew, instructor: recorder.crew.instructor || settings.defaultInstructor });
  const [simField, setSimField] = useState<Airfield | null>(null);
  const [pickSim, setPickSim] = useState(false);
  const [speedup, setSpeedup] = useState(10);
  const [simOpen, setSimOpen] = useState(false);

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
        <div>
          <p className="eyebrow" style={{ marginTop: 8 }}>
            <span className="rec-dot" style={{ width: 12, height: 12, boxShadow: 'none', marginRight: 8, verticalAlign: 0 }} />
            Aufzeichnung läuft {rec.source === 'sim' && '· Simulator'}
          </p>
          <p className="serif" style={{ fontSize: 34, fontWeight: 700, margin: '0 0 6px' }}>{s ? PHASE_TXT[s.phase] : '–'}</p>
          <div className="kpis">
            <div className="kpi"><div className="v">{fmtDuration(s?.airborneMs ?? 0)}</div><div className="l">Flugzeit</div></div>
            <div className="kpi"><div className="v">{s?.landings ?? 0}</div><div className="l">Landungen</div></div>
            <div className="kpi"><div className="v">{s?.touchAndGos ?? 0}</div><div className="l">Touch&Go</div></div>
          </div>
          <p className="small muted">{rec.points.length} GPS-Punkte · Flug endet automatisch {Math.round(settings.detector.flightEndSec / 60)} min nach der letzten Landung im Stillstand.</p>
          {rec.error && <div className="err">{rec.error}</div>}
          <button className="primary big" onClick={onOpenNav}>Navi / Moving Map öffnen</button>
          <div style={{ height: 8 }} />
          <button className="danger big" onClick={() => confirm('Aufzeichnung jetzt beenden?') && recorder.stop()}>Aufzeichnung beenden</button>
        </div>
      </>
    );
  }

  const ac = settings.aircraft.find((a) => a.reg === reg);
  return (
    <>
      {rec.savedEntryId && (
        <div className="ok-box" style={{ marginBottom: 14 }}>
          <b className="serif" style={{ fontSize: 19 }}>✓ Flug gespeichert</b>
          <div style={{ margin: '4px 0 8px' }}>
            {rec.snap?.landings} Landung(en), davon {rec.snap?.touchAndGos} Touch-and-Go · Flugzeit {fmtDuration(rec.snap?.airborneMs ?? 0)}
          </div>
          <button className="link" onClick={onShowLog}>Im Flugbuch ansehen</button>
        </div>
      )}
      {rec.snap && !rec.savedEntryId && rec.snap.takeoffs === 0 && (
        <div className="err">Letzte Aufzeichnung enthielt keinen Start – kein Eintrag angelegt.</div>
      )}

      <div className="fly-grid">
      <div className="fly-main">
      <div className="fly-art"><AircraftArt ac={ac} /></div>
      <p className="eyebrow" style={{ marginTop: 8 }}>Luftfahrzeug</p>
      <div className="ac-select">
        <span className="reg">{reg || '—'}</span>
        <span className="type">{ac?.type || (settings.aircraft.length ? 'auswählen' : 'in Einstellungen anlegen')}</span>
        <span className="chev" />
        <select value={reg} onChange={(e) => setReg(e.target.value)} aria-label="Luftfahrzeug">
          <option value="">– ohne –</option>
          {settings.aircraft.map((a) => (
            <option key={a.reg} value={a.reg}>{a.reg} · {a.type}</option>
          ))}
        </select>
      </div>

      <div className="grid2" style={{ marginTop: 14 }}>
        <label>
          Funktion
          <select value={crew.role} onChange={(e) => setCrew({ ...crew, role: e.target.value as typeof crew.role })}>
            <option value="PIC">PIC</option>
            <option value="DUAL">Schulung mit FI</option>
            <option value="FI">Ich als Fluglehrer</option>
          </select>
        </label>
        {crew.role === 'DUAL' && (
          <InstructorPicker value={crew.instructor} instructors={settings.instructors} onChange={(v) => setCrew({ ...crew, instructor: v })} />
        )}
        {crew.role === 'FI' && (
          <label>
            Flugschüler
            <input value={crew.student} placeholder="Name" onChange={(e) => setCrew({ ...crew, student: e.target.value })} />
          </label>
        )}
      </div>

      <button className="primary big" style={{ marginTop: 10 }} onClick={startGps}>
        <span className="rec-dot" />
        Aufzeichnung starten
      </button>
      <p className="hint">Vor dem Rollen starten.</p>
      </div>

      <div className="fly-side" style={{ borderTop: '1.5px solid var(--rule)' }}>
        <details className="section">
          <summary>So funktioniert die Erkennung</summary>
          <div className="body">
            <p style={{ marginTop: 0, lineHeight: 1.5 }}>
              Handy mit eingeschaltetem Bildschirm ablegen. Start, jede Landung, Touch-and-Go und Full-Stop werden aus GPS-Geschwindigkeit
              und Höhe erkannt; Start- und Zielplatz kommen aus der Flugplatzdatenbank. {Math.round(settings.detector.flightEndSec / 60)} Minuten
              Stillstand nach der letzten Landung beenden den Flug – er wird dann selbstständig ins Flugbuch eingetragen.
            </p>
            <p className="small muted" style={{ marginBottom: 0 }}>Schwellwerte lassen sich unter Einstellungen an dein Luftfahrzeug anpassen.</p>
          </div>
        </details>

        <details className="section" onToggle={(e) => setSimOpen((e.target as HTMLDetailsElement).open)}>
          <summary>
            <span>
              <span className="sum-eyebrow">Simulator</span>
              Platzrunde testen
            </span>
          </summary>
          {simOpen && (
            <div className="body">
              <p className="small muted" style={{ marginTop: 0 }}>Spielt eine Platzrunde mit Touch-and-Go und Full-Stop ab – zum Ausprobieren am Schreibtisch.</p>
              {simField && !pickSim ? (
                <div className="row" style={{ marginBottom: 10 }}>
                  <div><b>{simField.icao}</b> {simField.name}</div>
                  <button style={{ flex: '0 0 auto' }} onClick={() => setPickSim(true)}>Ändern</button>
                </div>
              ) : (
                <div style={{ marginBottom: 10 }}>
                  <AirfieldSearch onPick={(a) => { setSimField(a); setPickSim(false); }} placeholder="Platz suchen, z.B. EDFE" />
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
              <button className="big" disabled={!simField} onClick={startSim}>Simulation starten</button>
            </div>
          )}
        </details>

        <details className="section">
          <summary>
            <span>
              <span className="sum-eyebrow">Navi</span>
              Moving Map ohne Aufzeichnung
            </span>
          </summary>
          <div className="body">
            <button className="big" onClick={onOpenNav}>Karte öffnen</button>
          </div>
        </details>
      </div>
      </div>
    </>
  );
}
