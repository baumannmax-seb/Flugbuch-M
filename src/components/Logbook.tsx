import { useState } from 'react';
import type { LogEntry } from '../lib/db';
import { fmtDate, fmtDuration, fmtTime } from '../lib/geo';
import { exportCsv } from '../lib/export';
import type { AppSettings } from '../lib/settings';
import EntryForm, { emptyEntry } from './EntryForm';
import CsvImportSheet from './CsvImportSheet';

export default function Logbook({ entries, settings, onChange }: { entries: LogEntry[]; settings: AppSettings; onChange: () => void }) {
  const [edit, setEdit] = useState<{ entry: LogEntry; isNew: boolean } | null>(null);
  const [q, setQ] = useState('');
  const [importing, setImporting] = useState(false);

  const totalMin = entries.reduce((s, e) => s + e.flightMin, 0);
  const totalLdg = entries.reduce((s, e) => s + e.landings, 0);
  const s = q.trim().toLowerCase();
  const list = s ? entries.filter((e) => [e.from, e.to, e.aircraftReg, e.aircraftType, e.remarks, e.pic, e.instructor ?? '', e.student ?? '', fmtDate(e.date)].join(' ').toLowerCase().includes(s)) : entries;

  return (
    <>
      <div className="kpis">
        <div className="kpi"><div className="v">{fmtDuration(totalMin * 60000)}</div><div className="l">Flugstunden</div></div>
        <div className="kpi"><div className="v">{entries.length}</div><div className="l">Flüge</div></div>
        <div className="kpi"><div className="v">{totalLdg}</div><div className="l">Landungen</div></div>
      </div>
      <div className="row" style={{ marginBottom: 8 }}>
        <button onClick={() => setImporting(true)}>⬇︎ Import</button>
        <button onClick={() => exportCsv(entries)} disabled={!entries.length}>⬆︎ Export</button>
        <button className="primary" onClick={() => setEdit({ entry: emptyEntry(settings), isNew: true })}>＋ Flug</button>
      </div>
      <input style={{ marginBottom: 12 }} placeholder="Suchen (Platz, Kennzeichen, Fluglehrer …)" value={q} onChange={(e) => setQ(e.target.value)} />
      {list.length === 0 && (
        <div className="card muted">
          Noch keine Flüge. Starte unter <b>Fliegen</b> eine GPS-Aufzeichnung (oder den Simulator) – Start, Landungen und
          Touch-and-Gos werden automatisch erkannt und hier eingetragen. Oder trage einen Flug manuell ein – oder importiere
          dein bisheriges Flugbuch per <b>Import</b> (CSV aus b4takeoff, mein-flugbuch, Excel …).
        </div>
      )}
      {list.map((e) => (
        <div key={e.id} className="entry" onClick={() => setEdit({ entry: e, isNew: false })}>
          <div className="route">
            {e.from || '?'} → {e.to || '?'}
            {e.source === 'gps' && <span className={`badge ${e.remarks.startsWith('SIMULATION') ? 'sim' : ''}`}>{e.remarks.startsWith('SIMULATION') ? 'SIM' : 'GPS'}</span>}
          </div>
          <div className="time">{fmtDuration(e.flightMin * 60000)}</div>
          <div className="meta">
            {fmtDate(e.date)} · {fmtTime(e.takeoff)}–{fmtTime(e.landing)} · {e.aircraftReg || '—'} {e.aircraftType}
          </div>
          <div className="meta" style={{ textAlign: 'right' }}>
            {e.landings} Ldg{e.touchAndGos ? ` (${e.touchAndGos} T&G)` : ''}
            {e.role === 'DUAL' && <div>🎓 {e.instructor || 'mit FI'}</div>}
            {e.role === 'FI' && <div>👨‍✈️ FI{e.student ? ` · ${e.student}` : ''}</div>}
          </div>
        </div>
      ))}
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
