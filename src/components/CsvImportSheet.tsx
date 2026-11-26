import { useMemo, useState } from 'react';
import { db, type LogEntry } from '../lib/db';
import { autoMap, buildEntries, decodeFile, dupKey, FIELD_LABELS, parseCsv, type FieldKey, type Mapping, type ParsedCsv } from '../lib/csvImport';
import { fmtDate, fmtDuration, fmtTime } from '../lib/geo';

export default function CsvImportSheet({ existing, defaultPic, onClose }: { existing: LogEntry[]; defaultPic: string; onClose: (imported: boolean) => void }) {
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [fileName, setFileName] = useState('');
  const [map, setMap] = useState<Mapping>({});
  const [unit, setUnit] = useState<'auto' | 'h' | 'min'>('auto');
  const [skipDups, setSkipDups] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (f: File) => {
    setError(null);
    try {
      const { text, encoding } = decodeFile(await f.arrayBuffer());
      const p = parseCsv(text, encoding);
      if (!p.rows.length) throw new Error('Keine Datenzeilen gefunden.');
      setParsed(p);
      setFileName(f.name);
      setMap(autoMap(p.headers, p.rows));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const result = useMemo(() => (parsed ? buildEntries(parsed, map, { durationUnit: unit, defaultPic }) : null), [parsed, map, unit, defaultPic]);
  const existingKeys = useMemo(() => new Set(existing.map(dupKey)), [existing]);
  const toImport = result ? result.entries.filter((e) => !skipDups || !existingKeys.has(dupKey(e))) : [];
  const dups = result ? result.entries.length - toImport.length : 0;
  const totalMin = toImport.reduce((s, e) => s + e.flightMin, 0);

  const doImport = async () => {
    setBusy(true);
    for (const e of toImport) await db.putEntry(e);
    setBusy(false);
    alert(`${toImport.length} Flüge importiert.`);
    onClose(true);
  };

  const setCol = (k: FieldKey, v: string) => setMap((m) => {
    const n = { ...m };
    if (v === '') delete n[k];
    else n[k] = Number(v);
    return n;
  });

  return (
    <div className="sheet-backdrop" onClick={() => onClose(false)}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h3>Flugbuch importieren (CSV)</h3>
          <button className="ghost close-x" onClick={() => onClose(false)}>✕</button>
        </div>
        {!parsed && (
          <>
            <p className="small muted" style={{ marginTop: 0 }}>
              CSV-Export aus b4takeoff, mein-flugbuch, UL-Flugbuch, Excel oder einem anderen Flugbuch auswählen. Spalten werden
              automatisch erkannt – du kannst die Zuordnung vor dem Import prüfen und ändern. Excel-Dateien vorher in Excel/Numbers
              als „CSV“ speichern.
            </p>
            <label className="button-like">
              <input type="file" accept=".csv,.txt,text/csv,text/plain" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f); }} />
              <span>📂 CSV-Datei auswählen</span>
            </label>
          </>
        )}
        {error && <div className="err" style={{ marginTop: 10 }}>{error}</div>}

        {parsed && result && (
          <>
            <p className="small muted" style={{ marginTop: 0 }}>
              {fileName} · {parsed.rows.length} Zeilen · Trennzeichen „{parsed.delimiter === '\t' ? 'Tab' : parsed.delimiter}“ · {parsed.encoding}
            </p>

            <div className="card">
              <h2>Spaltenzuordnung</h2>
              {(Object.keys(FIELD_LABELS) as FieldKey[]).map((k) => (
                <div key={k} className="map-row">
                  <span className={map[k] !== undefined ? '' : 'muted'}>{FIELD_LABELS[k]}</span>
                  <select value={map[k] ?? ''} onChange={(e) => setCol(k, e.target.value)}>
                    <option value="">– nicht vorhanden –</option>
                    {parsed.headers.map((h, i) => (
                      <option key={i} value={i}>{h || `Spalte ${i + 1}`}{parsed.rows[0]?.[i] ? ` (z.B. ${parsed.rows[0][i].slice(0, 16)})` : ''}</option>
                    ))}
                  </select>
                </div>
              ))}
              <label style={{ marginTop: 10 }}>
                Zeitangaben ohne Doppelpunkt (z.B. „1,5“ oder „90“) sind …
                <select value={unit} onChange={(e) => setUnit(e.target.value as typeof unit)}>
                  <option value="auto">automatisch (Dezimalstunden, „min“ im Spaltennamen = Minuten)</option>
                  <option value="h">Stunden (1,5 = 1:30)</option>
                  <option value="min">Minuten (90 = 1:30)</option>
                </select>
              </label>
            </div>

            <div className="card">
              <h2>Vorschau</h2>
              {result.entries.slice(0, 4).map((e) => (
                <div key={e.id} className="small" style={{ padding: '4px 0', borderBottom: '1px solid var(--line)' }}>
                  <b>{fmtDate(e.date)}</b> {e.from || '?'} → {e.to || '?'} · {e.aircraftReg} {e.aircraftType} · {fmtTime(e.takeoff)}–{fmtTime(e.landing)} · <b>{fmtDuration(e.flightMin * 60000)}</b> · {e.landings} Ldg
                  {e.role === 'DUAL' && ` · FI ${e.instructor ?? ''}`}
                </div>
              ))}
              {result.skipped.length > 0 && (
                <details className="small" style={{ marginTop: 8 }}>
                  <summary className="status-warn">{result.skipped.length} Zeilen werden übersprungen</summary>
                  {result.skipped.slice(0, 30).map((s) => (
                    <div key={s.row} className="muted">Zeile {s.row}: {s.reason}</div>
                  ))}
                </details>
              )}
              <label className="check" style={{ marginTop: 6 }}>
                <input type="checkbox" checked={skipDups} onChange={(e) => setSkipDups(e.target.checked)} /> bereits vorhandene Flüge überspringen {dups > 0 && `(${dups})`}
              </label>
            </div>

            <div className="row">
              <button onClick={() => setParsed(null)}>Andere Datei</button>
              <button className="primary" disabled={busy || !toImport.length || map.date === undefined} onClick={doImport}>
                {busy ? 'Importiere …' : `${toImport.length} Flüge (${fmtDuration(totalMin * 60000)} h) importieren`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
