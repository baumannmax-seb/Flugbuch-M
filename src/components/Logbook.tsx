import { useState } from 'react';
import type { LogEntry } from '../lib/db';
import { fmtDate, fmtDuration, fmtTime } from '../lib/geo';
import { exportCsv } from '../lib/export';
import type { AppSettings } from '../lib/settings';
import EntryForm, { emptyEntry } from './EntryForm';
import CsvImportSheet from './CsvImportSheet';
import TrackImportSheet from './TrackImportSheet';
import RecIcon from './RecIcon';
import AircraftArt, { defaultAircraft } from './AircraftArt';

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

/** Zeichnung des Standard-Luftfahrzeugs, Kennzeichen auf dem Rumpf, Muster darunter */
export function AircraftHero({ settings }: { settings: AppSettings }) {
  const ac = defaultAircraft(settings);
  return (
    <>
      <AircraftArt ac={ac ?? { reg: '', type: '' }} />
      {ac?.type && (
        <div className="plane-caption">
          <span>{ac.type}</span>
        </div>
      )}
    </>
  );
}

export default function Logbook({
  entries,
  settings,
  onChange,
  menuOpen,
  onMenuClose,
  onRecord,
}: {
  entries: LogEntry[];
  settings: AppSettings;
  onChange: () => void;
  menuOpen: boolean;
  onMenuClose: () => void;
  onRecord: () => void;
}) {
  const [edit, setEdit] = useState<{ entry: LogEntry; isNew: boolean } | null>(null);
  const [q, setQ] = useState('');
  const [importing, setImporting] = useState(false);
  const [trackImport, setTrackImport] = useState(false);

  const totalMin = entries.reduce((s, e) => s + e.flightMin, 0);
  const totalLdg = entries.reduce((s, e) => s + e.landings, 0);
  const s = q.trim().toLowerCase();
  const list = s ? entries.filter((e) => [e.from, e.to, e.aircraftReg, e.aircraftType, e.remarks, e.pic, e.instructor ?? '', e.student ?? '', fmtDate(e.date)].join(' ').toLowerCase().includes(s)) : entries;
  const newEntry = () => setEdit({ entry: emptyEntry(settings), isNew: true });

  let lastMonth = '';

  return (
    <>
      {/* Kennzahlen erst ab dem ersten Flug – der Leer-Zustand bleibt ruhig */}
      {entries.length > 0 && (
        <div className="kpis">
          <div className="kpi"><div className="v">{fmtDuration(totalMin * 60000)}</div><div className="l">Flugstunden</div></div>
          <div className="kpi"><div className="v">{entries.length}</div><div className="l">Flüge</div></div>
          <div className="kpi"><div className="v">{totalLdg}</div><div className="l">Landungen</div></div>
        </div>
      )}

      {entries.length === 0 ? (
        <div className="hero">
          <div>
            <AircraftHero settings={settings} />
          </div>
          <div>
          <h2>Dein erster Flug</h2>
          <p>Starte eine GPS-Aufzeichnung – Start, Landungen und Touch-and-Gos werden automatisch erkannt und hier eingetragen.</p>
          <button className="primary big" onClick={onRecord}>
            <RecIcon size={34} />
            Flug starten
          </button>
          <div className="hero-links" style={{ marginTop: 14, display: 'flex', gap: 28, justifyContent: 'center' }}>
            <button className="link" onClick={newEntry}>Manuell eintragen</button>
            <button className="link" onClick={() => setImporting(true)}>Flugbuch importieren</button>
          </div>
          </div>
        </div>
      ) : (
        <>
          <input style={{ margin: '4px 0 4px' }} placeholder="Suchen – Platz, Kennzeichen, Fluglehrer …" value={q} onChange={(e) => setQ(e.target.value)} />
          {list.length === 0 && <p className="muted center">Nichts gefunden.</p>}
          {list.map((e) => {
            const d = new Date(e.date);
            const m = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
            const head = m !== lastMonth ? m : null;
            lastMonth = m;
            const sim = e.remarks.startsWith('SIMULATION');
            return (
              <div key={e.id}>
                {head && <div className="month">{head}</div>}
                <div className="entry" onClick={() => setEdit({ entry: e, isNew: false })}>
                  <div className="route">
                    {e.from || '?'} → {e.to || '?'}
                    {e.source === 'gps' && <span className={`badge ${sim ? 'sim' : ''}`}>{sim ? 'SIM' : 'GPS'}</span>}
                  </div>
                  <div className="time">{fmtDuration(e.flightMin * 60000)}</div>
                  <div className="meta">
                    {fmtDate(e.date)} · {fmtTime(e.takeoff)}–{fmtTime(e.landing)} · {e.aircraftReg || '—'}
                    {e.role === 'DUAL' && ` · mit ${e.instructor || 'FI'}`}
                    {e.role === 'FI' && ` · als FI${e.student ? ` (${e.student})` : ''}`}
                  </div>
                  <div className="meta" style={{ textAlign: 'right' }}>
                    {e.landings} Ldg{e.touchAndGos ? ` · ${e.touchAndGos} T&G` : ''}
                  </div>
                </div>
              </div>
            );
          })}
          <div style={{ marginTop: 18 }}>
            <button className="link" onClick={newEntry}>＋ Flug manuell eintragen</button>
          </div>
        </>
      )}

      {menuOpen && (
        <div className="sheet-backdrop" onClick={onMenuClose}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <h3>Flugbuch</h3>
              <button className="close-x" onClick={onMenuClose}>✕</button>
            </div>
            <div className="menu-list">
              <button onClick={() => { onMenuClose(); newEntry(); }}>＋ Flug manuell eintragen</button>
              <button onClick={() => { onMenuClose(); setImporting(true); }}>⬇︎ Flugbuch importieren (CSV aus b4takeoff, Excel …)</button>
              <button onClick={() => { onMenuClose(); setTrackImport(true); }}>🛰 GPS-Track importieren (Flightradar24, GPX, KML, IGC)</button>
              <button disabled={!entries.length} onClick={() => { onMenuClose(); exportCsv(entries); }}>⬆︎ Exportieren als CSV</button>
            </div>
          </div>
        </div>
      )}
      {trackImport && (
        <TrackImportSheet
          settings={settings}
          onClose={(imported) => {
            setTrackImport(false);
            if (imported) onChange();
          }}
        />
      )}
      {importing && (
        <CsvImportSheet
          existing={entries}
          defaultPic={settings.pilotName}
          onClose={(imported) => {
            setImporting(false);
            if (imported) onChange();
          }}
        />
      )}
      {edit && (
        <EntryForm
          initial={edit.entry}
          isNew={edit.isNew}
          settings={settings}
          onClose={(changed) => {
            setEdit(null);
            if (changed) onChange();
          }}
        />
      )}
    </>
  );
}
