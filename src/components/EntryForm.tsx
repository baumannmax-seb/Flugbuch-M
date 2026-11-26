import { useEffect, useState } from 'react';
import { db, uid, type LogEntry, type Track } from '../lib/db';
import { fmtDuration } from '../lib/geo';
import { exportGpx } from '../lib/export';
import type { AppSettings } from '../lib/settings';
import TrackMap from './TrackMap';
import AircraftArt from './AircraftArt';
import InstructorPicker from './InstructorPicker';

const toDateInput = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const toTimeInput = (t: number | null) => {
  if (!t) return '';
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const combine = (date: number, hhmm: string): number | null => {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d.getTime();
};

export function emptyEntry(settings: AppSettings): LogEntry {
  const ac = settings.aircraft.find((a) => a.reg === settings.defaultAircraft);
  return {
    id: uid(),
    date: Date.now(),
    aircraftReg: ac?.reg ?? '',
    aircraftType: ac?.type ?? '',
    from: '',
    to: '',
    offBlock: null,
    takeoff: null,
    landing: null,
    onBlock: null,
    flightMin: 0,
    blockMin: 0,
    landings: 1,
    touchAndGos: 0,
    pic: settings.pilotName,
    role: 'PIC',
    remarks: '',
    createdAt: Date.now(),
    source: 'manual',
  };
}

export default function EntryForm({ initial, settings, isNew = false, onClose }: { initial: LogEntry; settings: AppSettings; isNew?: boolean; onClose: (changed: boolean) => void }) {
  const [e, setE] = useState<LogEntry>(initial);
  const [track, setTrack] = useState<Track | null>(null);
  const [knownNames, setKnownNames] = useState<string[]>([]);
  useEffect(() => {
    db.listEntries().then((l) => setKnownNames([...new Set(l.flatMap((x) => [x.pic, x.instructor ?? '', x.student ?? '']).filter(Boolean))].sort()));
  }, []);

  useEffect(() => {
    if (initial.trackId) db.getTrack(initial.trackId).then((t) => setTrack(t ?? null));
  }, [initial.trackId]);

  const set = <K extends keyof LogEntry>(k: K, v: LogEntry[K]) => setE((p) => ({ ...p, [k]: v }));

  const setTime = (k: 'offBlock' | 'takeoff' | 'landing' | 'onBlock', v: string) => {
    setE((p) => {
      const n = { ...p, [k]: combine(p.date, v) };
      if (n.takeoff && n.landing) n.flightMin = Math.max(0, Math.round((n.landing - n.takeoff) / 60000));
      if (n.offBlock && n.onBlock) n.blockMin = Math.max(0, Math.round((n.onBlock - n.offBlock) / 60000));
      return n;
    });
  };

  const setDate = (v: string) => {
    const [y, m, d] = v.split('-').map(Number);
    const shift = (t: number | null) => {
      if (!t) return t;
      const x = new Date(t);
      x.setFullYear(y, m - 1, d);
      return x.getTime();
    };
    setE((p) => ({ ...p, date: new Date(y, m - 1, d, 12).getTime(), offBlock: shift(p.offBlock), takeoff: shift(p.takeoff), landing: shift(p.landing), onBlock: shift(p.onBlock) }));
  };

  const save = async () => {
    await db.putEntry({ ...e, aircraftReg: e.aircraftReg.toUpperCase(), from: e.from.toUpperCase(), to: e.to.toUpperCase() });
    onClose(true);
  };
  const remove = async () => {
    if (!confirm('Eintrag wirklich löschen?')) return;
    await db.deleteEntry(e.id);
    if (e.trackId) await db.deleteTrack(e.trackId);
    onClose(true);
  };

  return (
    <div className="sheet-backdrop" onClick={() => onClose(false)}>
      <div className="sheet" onClick={(ev) => ev.stopPropagation()}>
        <div className="sheet-head">
          <h3>{isNew ? 'Neuer Flug' : 'Flug bearbeiten'}</h3>
          <button className="ghost close-x" onClick={() => onClose(false)}>✕</button>
        </div>
        {track ? (
          <TrackMap track={track} settings={settings} />
        ) : (
          e.aircraftReg && (
            <div className="entry-art">
              <AircraftArt ac={settings.aircraft.find((a) => a.reg.toUpperCase() === e.aircraftReg.toUpperCase()) ?? { reg: e.aircraftReg.toUpperCase(), type: e.aircraftType }} />
            </div>
          )
        )}
        <div className="grid2">
          <label>
            Datum
            <input type="date" value={toDateInput(e.date)} onChange={(ev) => setDate(ev.target.value)} />
          </label>
          <label>
            Funktion
            <select value={e.role} onChange={(ev) => { const role = ev.target.value as LogEntry['role']; setE((p) => ({ ...p, role, instructor: role === 'DUAL' ? p.instructor || settings.defaultInstructor : p.instructor })); }}>
              <option value="PIC">PIC</option>
              <option value="DUAL">Schulung (Dual)</option>
              <option value="FI">Fluglehrer (FI)</option>
              <option value="PAX">Mitflug</option>
            </select>
          </label>
          <label>
            Kennzeichen
            <input list="ac-list" value={e.aircraftReg} placeholder="D-MXXX" onChange={(ev) => {
              const reg = ev.target.value;
              const ac = settings.aircraft.find((a) => a.reg.toUpperCase() === reg.toUpperCase());
              setE((p) => ({ ...p, aircraftReg: reg, aircraftType: ac?.type ?? p.aircraftType }));
            }} />
            <datalist id="ac-list">
              {settings.aircraft.map((a) => <option key={a.reg} value={a.reg}>{a.type}</option>)}
            </datalist>
          </label>
          <label>
            Muster
            <input value={e.aircraftType} placeholder="z.B. C42" onChange={(ev) => set('aircraftType', ev.target.value)} />
          </label>
          <label>
            Von
            <input value={e.from} placeholder="ICAO" onChange={(ev) => set('from', ev.target.value)} />
          </label>
          <label>
            Nach
            <input value={e.to} placeholder="ICAO" onChange={(ev) => set('to', ev.target.value)} />
          </label>
        </div>
        <div className="grid2 grid4-wide">
          <label>Off-Block<input type="time" value={toTimeInput(e.offBlock)} onChange={(ev) => setTime('offBlock', ev.target.value)} /></label>
          <label>Start<input type="time" value={toTimeInput(e.takeoff)} onChange={(ev) => setTime('takeoff', ev.target.value)} /></label>
          <label>Landung<input type="time" value={toTimeInput(e.landing)} onChange={(ev) => setTime('landing', ev.target.value)} /></label>
          <label>On-Block<input type="time" value={toTimeInput(e.onBlock)} onChange={(ev) => setTime('onBlock', ev.target.value)} /></label>
        </div>
        <div className="grid2 grid4-wide">
          <label>Flugzeit (min)<input type="number" min={0} value={e.flightMin} onChange={(ev) => set('flightMin', Number(ev.target.value))} /></label>
          <label>Blockzeit (min)<input type="number" min={0} value={e.blockMin} onChange={(ev) => set('blockMin', Number(ev.target.value))} /></label>
          <label>Landungen<input type="number" min={0} value={e.landings} onChange={(ev) => set('landings', Number(ev.target.value))} /></label>
          <label>davon T&G<input type="number" min={0} value={e.touchAndGos} onChange={(ev) => set('touchAndGos', Number(ev.target.value))} /></label>
        </div>
        <p className="small muted" style={{ marginTop: -4 }}>Flugzeit {fmtDuration(e.flightMin * 60000)} h · Blockzeit {fmtDuration(e.blockMin * 60000)} h</p>
        <div className="grid2">
          <label>
            PIC / Pilot
            <input list="name-list" value={e.pic} onChange={(ev) => set('pic', ev.target.value)} />
          </label>
          {e.role === 'DUAL' && (
            <InstructorPicker value={e.instructor ?? ''} instructors={settings.instructors} onChange={(v) => set('instructor', v)} />
          )}
          {e.role === 'FI' && (
            <label>
              Flugschüler
              <input list="name-list" value={e.student ?? ''} placeholder="Name Schüler" onChange={(ev) => set('student', ev.target.value)} />
            </label>
          )}
        </div>
        <datalist id="name-list">
          {knownNames.map((n) => <option key={n} value={n} />)}
        </datalist>
        <label>
          Bemerkungen
          <textarea rows={2} value={e.remarks} onChange={(ev) => set('remarks', ev.target.value)} />
        </label>
        <div className="row" style={{ marginTop: 8 }}>
          {!isNew && <button className="danger" onClick={remove}>Löschen</button>}
          {track && <button onClick={() => exportGpx(e, track)}>GPX</button>}
          <button className="primary" onClick={save}>Speichern</button>
        </div>
      </div>
    </div>
  );
}
