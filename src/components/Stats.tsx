import type { LogEntry } from '../lib/db';
import { fmtDate, fmtDuration } from '../lib/geo';

const DAY = 86400000;

export default function Stats({ entries }: { entries: LogEntry[] }) {
  const now = Date.now();
  const sum = (l: LogEntry[]) => ({ min: l.reduce((s, e) => s + e.flightMin, 0), ldg: l.reduce((s, e) => s + e.landings, 0), n: l.length });

  // Passagierberechtigung: 3 Starts & Landungen in den letzten 90 Tagen (FCL.060 / UL analog)
  const last90 = entries.filter((e) => now - e.date <= 90 * DAY);
  const ldg90 = sum(last90).ldg;
  // für den Ablauf: drittletzte Landung bestimmen
  const byDate = [...entries].sort((a, b) => b.date - a.date);
  let acc = 0;
  let thirdDate: number | null = null;
  for (const e of byDate) {
    acc += e.landings;
    if (acc >= 3) {
      thirdDate = e.date;
      break;
    }
  }
  const paxUntil = thirdDate ? thirdDate + 90 * DAY : null;

  // 24 Monate (z.B. Klassenberechtigung SEP / LAPL: 12 h, 12 Ldg in 24 Mon. – Hinweis, keine Rechtsberatung)
  const last24m = sum(entries.filter((e) => now - e.date <= 730 * DAY));

  const byAc = new Map<string, LogEntry[]>();
  const byYear = new Map<number, LogEntry[]>();
  for (const e of entries) {
    const k = `${e.aircraftReg || '–'} ${e.aircraftType}`.trim();
    byAc.set(k, [...(byAc.get(k) ?? []), e]);
    const y = new Date(e.date).getFullYear();
    byYear.set(y, [...(byYear.get(y) ?? []), e]);
  }
  const total = sum(entries);

  return (
    <div className="stats-grid">
      <div className="kpis">
        <div className="kpi"><div className="v">{fmtDuration(total.min * 60000)}</div><div className="l">Gesamt h</div></div>
        <div className="kpi"><div className="v">{total.n}</div><div className="l">Flüge</div></div>
        <div className="kpi"><div className="v">{total.ldg}</div><div className="l">Landungen</div></div>
      </div>

      <div className="card">
        <h2>Nach Funktion</h2>
        <table className="stats">
          <tbody>
            {(
              [
                ['PIC', 'PIC'],
                ['DUAL', 'Schulung (mit FI)'],
                ['FI', 'als Fluglehrer'],
                ['PAX', 'Mitflug'],
              ] as const
            ).map(([k, label]) => {
              const s = sum(entries.filter((e) => e.role === k));
              return s.n ? <tr key={k}><td>{label}</td><td>{s.n} Flüge</td><td>{fmtDuration(s.min * 60000)}</td></tr> : null;
            })}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Passagiermitnahme (90 Tage)</h2>
        <p style={{ margin: 0, fontSize: 18 }} className={ldg90 >= 3 ? 'status-ok' : 'status-bad'}>
          {ldg90 >= 3 ? '✓' : '✗'} {ldg90} Landungen in 90 Tagen (min. 3)
        </p>
        {paxUntil && ldg90 >= 3 && <p className="small muted" style={{ marginBottom: 0 }}>gültig bis ca. {fmtDate(paxUntil)}</p>}
      </div>

      <div className="card">
        <h2>Letzte 24 Monate</h2>
        <p style={{ margin: 0 }}>
          {fmtDuration(last24m.min * 60000)} h · {last24m.ldg} Landungen · {last24m.n} Flüge
        </p>
        <p className="small muted" style={{ marginBottom: 0 }}>Hilfreich für Verlängerung nach Erfahrung. Bitte Anforderungen deiner Lizenz prüfen.</p>
      </div>

      <div className="card">
        <h2>Nach Luftfahrzeug</h2>
        <table className="stats">
          <thead><tr><th>LFZ</th><th>Flüge</th><th>Ldg</th><th>Zeit</th></tr></thead>
          <tbody>
            {[...byAc.entries()].map(([k, l]) => {
              const s = sum(l);
              return <tr key={k}><td>{k}</td><td>{s.n}</td><td>{s.ldg}</td><td>{fmtDuration(s.min * 60000)}</td></tr>;
            })}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Nach Jahr</h2>
        <table className="stats">
          <thead><tr><th>Jahr</th><th>Flüge</th><th>Ldg</th><th>Zeit</th></tr></thead>
          <tbody>
            {[...byYear.entries()].sort((a, b) => b[0] - a[0]).map(([y, l]) => {
              const s = sum(l);
              return <tr key={y}><td>{y}</td><td>{s.n}</td><td>{s.ldg}</td><td>{fmtDuration(s.min * 60000)}</td></tr>;
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
