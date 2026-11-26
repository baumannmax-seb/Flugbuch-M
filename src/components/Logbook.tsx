import { useState } from 'react';
import type { LogEntry } from '../lib/db';
import { fmtDate, fmtDuration, fmtTime } from '../lib/geo';
import { exportCsv } from '../lib/export';
import type { AppSettings } from '../lib/settings';
import EntryForm, { emptyEntry } from './EntryForm';

export default function Logbook({ entries, settings, onChange }: { entries: LogEntry[]; settings: AppSettings; onChange: () => void }) {
  const [edit, setEdit] = useState<{ entry: LogEntry; isNew: boolean } | null>(null);
  const [q, setQ] = useState('');

  const totalMin = entries.reduce((s, e) => s + e.flightMin, 0);
  const totalLdg = entries.reduce((s, e) => s + e.landings, 0);
  const s = q.trim().toLowerCase();
  const list = s ? entries.filter((e) => [e.from, e.to, e.aircraftReg, e.aircraftType, e.remarks, fmtDate(e.date)].join(' ').toLowerCase().includes(s)) : entries;

  return (
    <>
      <div className="kpis">
        <div className="kpi"><div className="v">{fmtDuration(totalMin * 60000)}</div><div className="l">Flugstunden</div></div>
        <div className="kpi"><div className="v">{entries.length}</div><div className="l">Flüge</div></div>
        <div className="kpi"><div className="v">{totalLdg}</div><div className="l">Landungen</div></div>
      </div>
      <div className="row" style={{ marginBottom: 12 }}>
        <input placeholder="Suchen (Platz, Kennzeichen, …)" value={q} onChange={(e) => setQ(e.target.value)} />
        <button style={{ flex: '0 0 auto' }} onClick={() => exportCsv(entries)} disabled={!entries.length}>CSV</button>
        <button className="primary" style={{ flex: '0 0 auto' }} onClick={() => setEdit({ entry: emptyEntry(settings), isNew: true })}>＋ Flug</button>
      </div>
      {list.length === 0 && (
        <div className="card muted">
          Noch keine Flüge. Starte unter <b>Fliegen</b> eine GPS-Aufzeichnung (oder den Simulator) – Start, Landungen und
          Touch-and-Gos werden automatisch erkannt und hier eingetragen. Oder trage einen Flug manuell ein.
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
          </div>
        </div>
      ))}
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
