import { useMemo, useState } from 'react';
import { db } from '../lib/db';
import type { AppSettings } from '../lib/settings';
import { analyzeTrack, parseTrackFile, type ParsedTrack } from '../lib/trackImport';
import { fmtDate, fmtDuration, fmtTime } from '../lib/geo';
import TrackMap from './TrackMap';
import InstructorPicker from './InstructorPicker';

/** GPS-Track (GPX, KML, IGC, Flightradar24) importieren → Flugbucheintrag mit Strecke */
export default function TrackImportSheet({ settings, onClose }: { settings: AppSettings; onClose: (imported: boolean) => void }) {
  const [parsed, setParsed] = useState<ParsedTrack | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [reg, setReg] = useState(settings.defaultAircraft || settings.aircraft[0]?.reg || '');
  const [role, setRole] = useState<'PIC' | 'DUAL' | 'FI'>('PIC');
  const [instructor, setInstructor] = useState(settings.defaultInstructor);
  const [busy, setBusy] = useState(false);

  const onFile = async (f: File) => {
    setError(null);
    try {
      setParsed(parseTrackFile(await f.text(), f.name));
      setFileName(f.name);
    } catch (e) {
      setParsed(null);
      setError((e as Error).message);
    }
  };

  const result = useMemo(
    () => (parsed ? analyzeTrack(parsed, settings, reg, { role, instructor, student: '' }, fileName) : null),
    [parsed, settings, reg, role, instructor, fileName]
  );

  const save = async () => {
    if (!result) return;
    setBusy(true);
    await db.putTrack(result.track);
    await db.putEntry(result.entry);
    setBusy(false);
    onClose(true);
  };

  const e = result?.entry;
  return (
    <div className="sheet-backdrop" onClick={() => onClose(false)}>
      <div className="sheet" onClick={(ev) => ev.stopPropagation()}>
        <div className="sheet-head">
          <h3>GPS-Track importieren</h3>
          <button className="close-x" onClick={() => onClose(false)}>✕</button>
        </div>
        {!parsed && (
          <>
            <p className="small muted" style={{ marginTop: 0 }}>
              Track aus Flightradar24 (KML oder CSV), SkyDemon, ForeFlight, Garmin (GPX) oder einem Logger (IGC) wählen. Start, Landungen,
              Touch-and-Gos, Off-/On-Block und Plätze werden wie bei einer Live-Aufzeichnung automatisch erkannt.
            </p>
            <label className="button-like">
              <input type="file" accept=".gpx,.kml,.igc,.csv,.txt,application/gpx+xml,application/vnd.google-earth.kml+xml" style={{ display: 'none' }} onChange={(ev) => { const f = ev.target.files?.[0]; ev.target.value = ''; if (f) onFile(f); }} />
              <span>📂 Track-Datei wählen</span>
            </label>
          </>
        )}
        {error && <div className="err" style={{ marginTop: 10 }}>{error}</div>}

        {result && e && parsed && (
          <>
            <p className="small muted" style={{ marginTop: 0 }}>{fileName} · {parsed.format} · {parsed.points.length} Punkte</p>
            <TrackMap track={result.track} settings={settings} />
            {result.snap.takeoffs === 0 ? (
              <div className="err">In diesem Track wurde kein Start erkannt (zu langsam oder zu wenige Punkte).</div>
            ) : (
              <div className="card" style={{ paddingTop: 4 }}>
                <div className="serif" style={{ fontSize: 24, fontWeight: 700 }}>{e.from || '?'} → {e.to || '?'}</div>
                <div className="muted">{fmtDate(e.date)} · Start {fmtTime(e.takeoff)} · Landung {fmtTime(e.landing)}</div>
                <div className="kpis" style={{ borderBottom: 0, marginTop: 8 }}>
                  <div className="kpi"><div className="v">{fmtDuration(e.flightMin * 60000)}</div><div className="l">Flugzeit</div></div>
                  <div className="kpi"><div className="v">{e.landings}</div><div className="l">Landungen</div></div>
                  <div className="kpi"><div className="v">{e.touchAndGos}</div><div className="l">Touch&Go</div></div>
                </div>
                <div className="small muted">Off-Block {fmtTime(e.offBlock)} · On-Block {fmtTime(e.onBlock)} · Blockzeit {fmtDuration(e.blockMin * 60000)}</div>
              </div>
            )}
            <div className="grid2">
              <label>
                Luftfahrzeug
                <select value={reg} onChange={(ev) => setReg(ev.target.value)}>
                  <option value="">– ohne –</option>
                  {settings.aircraft.map((a) => <option key={a.reg} value={a.reg}>{a.reg} · {a.type}</option>)}
                </select>
              </label>
              <label>
                Funktion
                <select value={role} onChange={(ev) => setRole(ev.target.value as typeof role)}>
                  <option value="PIC">PIC</option>
                  <option value="DUAL">Schulung mit FI</option>
                  <option value="FI">Ich als Fluglehrer</option>
                </select>
              </label>
            </div>
            {role === 'DUAL' && <InstructorPicker value={instructor} instructors={settings.instructors} onChange={setInstructor} />}
            <p className="small muted">Plätze, Zeiten und Landungen lassen sich nach dem Import im Eintrag noch korrigieren.</p>
            <div className="row">
              <button onClick={() => setParsed(null)}>Andere Datei</button>
              <button className="primary" disabled={busy || result.snap.takeoffs === 0} onClick={save}>Ins Flugbuch übernehmen</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
