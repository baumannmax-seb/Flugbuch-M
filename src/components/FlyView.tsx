import { useState } from 'react';
import type { Recorder, RecorderState } from '../lib/recorder';
import type { AppSettings } from '../lib/settings';
import { fmtDuration } from '../lib/geo';
import { GpsStatusText, useGpsStatus } from '../lib/useGpsStatus';
import InstructorPicker from './InstructorPicker';
import AircraftArt from './AircraftArt';
import RecIcon from './RecIcon';
import Hangar from './Hangar';
import AddAircraftSheet from './AddAircraftSheet';

const PHASE_TXT = { GROUND: 'Am Boden', AIRBORNE: 'In der Luft', ROLLOUT: 'Ausrollen' } as const;

/**
 * Fliegen: Luftfahrzeug und Besatzung oben, GPS-Status und die Hauptaktion
 * unten direkt über der Tab-Leiste (mit dem Daumen erreichbar, auch mit Handschuh).
 */
export default function FlyView({ recorder, rec, settings, onSettings, onOpenNav, onShowLog }: { recorder: Recorder; rec: RecorderState; settings: AppSettings; onSettings: (s: AppSettings) => void; onOpenNav: () => void; onShowLog: () => void }) {
  const [reg, setReg] = useState(recorder.aircraftReg || settings.defaultAircraft || settings.aircraft[0]?.reg || '');
  const [crew, setCrew] = useState({ ...recorder.crew, instructor: recorder.crew.instructor || settings.defaultInstructor });
  const [adding, setAdding] = useState(false);
  const gps = useGpsStatus(!rec.active);
  const gpsInfo = GpsStatusText(gps);

  const startGps = () => {
    recorder.aircraftReg = reg;
    recorder.crew = crew;
    recorder.start('gps');
    onOpenNav();
  };

  if (rec.active) {
    const s = rec.snap;
    return (
      <div className="fly-page">
        <p className="eyebrow rec" style={{ marginTop: 8 }}>
          <RecIcon size={18} spinning /> Aufzeichnung läuft {rec.source === 'sim' && '· Simulator'}
        </p>
        <p className="serif" style={{ fontSize: 34, fontWeight: 700, margin: '0 0 6px' }}>{s ? (s.takeoffPending ? 'Startlauf …' : PHASE_TXT[s.phase]) : '–'}</p>
        <div className="kpis">
          <div className="kpi"><div className="v">{fmtDuration(s?.airborneMs ?? 0)}</div><div className="l">Flugzeit</div></div>
          <div className="kpi"><div className="v">{s?.landings ?? 0}</div><div className="l">Landungen</div></div>
          <div className="kpi"><div className="v">{s?.touchAndGos ?? 0}</div><div className="l">Touch&Go</div></div>
        </div>
        <p className="small muted">
          {rec.points.length} GPS-Punkte
          {s && s.rejectedTakeoffs > 0 && ` · ${s.rejectedTakeoffs}× Startlauf ohne Steigflug verworfen`} · Flug endet automatisch {Math.round(settings.detector.flightEndSec / 60)} min nach der letzten Landung im Stillstand.
        </p>
        {rec.error && <div className="err">{rec.error}</div>}
        <div className="fly-spacer" />
        <div className="fly-action">
          <button className="danger action-btn secondary" onClick={() => confirm('Aufzeichnung jetzt beenden?') && recorder.stop()}>Aufzeichnung beenden</button>
          <button className="primary action-btn" onClick={onOpenNav}>Navi öffnen</button>
        </div>
      </div>
    );
  }

  const savedAc = settings.aircraft.find((a) => a.reg === recorder.aircraftReg);
  return (
    <div className="fly-page">
      {rec.savedEntryId && (
        <div className="saved-card">
          {savedAc && <AircraftArt ac={savedAc} small />}
          <b className="serif" style={{ fontSize: 19 }}>✓ Flug gespeichert</b>
          <div style={{ margin: '4px 0 8px' }}>
            {rec.snap?.landings} Landung(en), davon {rec.snap?.touchAndGos} Touch-and-Go · Flugzeit {fmtDuration(rec.snap?.airborneMs ?? 0)}
          </div>
          <button className="link" onClick={onShowLog}>Im Flugbuch ansehen</button>
        </div>
      )}
      {rec.snap && !rec.savedEntryId && rec.snap.takeoffs === 0 && <div className="err">Letzte Aufzeichnung enthielt keinen Start – kein Eintrag angelegt.</div>}

      <p className="eyebrow" style={{ marginTop: 8 }}>Luftfahrzeug</p>
      <Hangar aircraft={settings.aircraft} value={reg} onChange={setReg} onAdd={() => setAdding(true)} />

      <div className="grid2" style={{ marginTop: 14 }}>
        <label>
          Funktion
          <select value={crew.role} onChange={(e) => setCrew({ ...crew, role: e.target.value as typeof crew.role })}>
            <option value="PIC">PIC</option>
            <option value="DUAL">Schulung mit FI</option>
            <option value="FI">Ich als Fluglehrer</option>
          </select>
        </label>
        {crew.role === 'DUAL' && <InstructorPicker value={crew.instructor} instructors={settings.instructors} onChange={(v) => setCrew({ ...crew, instructor: v })} />}
        {crew.role === 'FI' && (
          <label>
            Flugschüler
            <input value={crew.student} placeholder="Name" onChange={(e) => setCrew({ ...crew, student: e.target.value })} />
          </label>
        )}
      </div>


      <div className="fly-spacer" />
      <div className="fly-action">
        <div className={`gps-status ${gpsInfo.tone}`} role="status">
          <span className="gps-dot" />
          {gpsInfo.text}
        </div>
        <button className="primary action-btn" onClick={startGps}>
          <RecIcon size={34} />
          Flug starten
        </button>
        <button className="link map-only" onClick={onOpenNav}>Nur Karte ansehen – ohne Aufzeichnung</button>
      </div>
      {adding && (
        <AddAircraftSheet
          onClose={() => setAdding(false)}
          onAdd={(a) => {
            onSettings({ ...settings, aircraft: [...settings.aircraft.filter((x) => x.reg !== a.reg), a], defaultAircraft: settings.defaultAircraft || a.reg });
            setReg(a.reg);
            setAdding(false);
          }}
        />
      )}
    </div>
  );
}
