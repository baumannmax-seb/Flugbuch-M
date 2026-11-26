import { useState } from 'react';
import type { Recorder, RecorderState } from '../lib/recorder';
import type { AppSettings } from '../lib/settings';
import { fmtDuration } from '../lib/geo';
import { GpsStatusText, useGpsStatus } from '../lib/useGpsStatus';
import InstructorPicker from './InstructorPicker';
import AircraftArt from './AircraftArt';
import RecIcon from './RecIcon';

const PHASE_TXT = { GROUND: 'Am Boden', AIRBORNE: 'In der Luft', ROLLOUT: 'Ausrollen' } as const;

/**
 * Fliegen: Luftfahrzeug und Besatzung oben, GPS-Status und die Hauptaktion
 * unten direkt über der Tab-Leiste (mit dem Daumen erreichbar, auch mit Handschuh).
 */
export default function FlyView({ recorder, rec, settings, onOpenNav, onShowLog }: { recorder: Recorder; rec: RecorderState; settings: AppSettings; onOpenNav: () => void; onShowLog: () => void }) {
  const [reg, setReg] = useState(recorder.aircraftReg || settings.defaultAircraft);
  const [crew, setCrew] = useState({ ...recorder.crew, instructor: recorder.crew.instructor || settings.defaultInstructor });
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
        <p className="serif" style={{ fontSize: 34, fontWeight: 700, margin: '0 0 6px' }}>{s ? PHASE_TXT[s.phase] : '–'}</p>
        <div className="kpis">
          <div className="kpi"><div className="v">{fmtDuration(s?.airborneMs ?? 0)}</div><div className="l">Flugzeit</div></div>
          <div className="kpi"><div className="v">{s?.landings ?? 0}</div><div className="l">Landungen</div></div>
          <div className="kpi"><div className="v">{s?.touchAndGos ?? 0}</div><div className="l">Touch&Go</div></div>
        </div>
        <p className="small muted">
          {rec.points.length} GPS-Punkte · Flug endet automatisch {Math.round(settings.detector.flightEndSec / 60)} min nach der letzten Landung im Stillstand.
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

  const ac = settings.aircraft.find((a) => a.reg === reg);
  return (
    <div className="fly-page">
      {rec.savedEntryId && (
        <div className="ok-box" style={{ marginBottom: 14 }}>
          <b className="serif" style={{ fontSize: 19 }}>✓ Flug gespeichert</b>
          <div style={{ margin: '4px 0 8px' }}>
            {rec.snap?.landings} Landung(en), davon {rec.snap?.touchAndGos} Touch-and-Go · Flugzeit {fmtDuration(rec.snap?.airborneMs ?? 0)}
          </div>
          <button className="link" onClick={onShowLog}>Im Flugbuch ansehen</button>
        </div>
      )}
      {rec.snap && !rec.savedEntryId && rec.snap.takeoffs === 0 && <div className="err">Letzte Aufzeichnung enthielt keinen Start – kein Eintrag angelegt.</div>}

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
        {crew.role === 'DUAL' && <InstructorPicker value={crew.instructor} instructors={settings.instructors} onChange={(v) => setCrew({ ...crew, instructor: v })} />}
        {crew.role === 'FI' && (
          <label>
            Flugschüler
            <input value={crew.student} placeholder="Name" onChange={(e) => setCrew({ ...crew, student: e.target.value })} />
          </label>
        )}
      </div>

      <details className="section" style={{ borderTop: '1.5px solid var(--rule-soft)', marginTop: 6 }}>
        <summary>So funktioniert die Erkennung</summary>
        <div className="body">
          <p style={{ marginTop: 0, lineHeight: 1.5 }}>
            Vor dem Rollen starten und das Handy mit eingeschaltetem Bildschirm ablegen. Start, jede Landung, Touch-and-Go und Full-Stop werden aus
            GPS-Geschwindigkeit und Höhe erkannt; Start- und Zielplatz kommen aus der Flugplatzdatenbank. {Math.round(settings.detector.flightEndSec / 60)} Minuten
            Stillstand nach der letzten Landung beenden den Flug – er wird dann selbstständig ins Flugbuch eingetragen.
          </p>
          <button className="link" onClick={onOpenNav}>Karte ohne Aufzeichnung öffnen</button>
        </div>
      </details>

      <div className="fly-spacer" />
      <div className="fly-action">
        <div className={`gps-status ${gpsInfo.tone}`} role="status">
          <span className="gps-dot" />
          {gpsInfo.text}
        </div>
        <button className="primary action-btn" onClick={startGps}>
          <RecIcon size={34} />
          Aufzeichnung starten
        </button>
      </div>
    </div>
  );
}
