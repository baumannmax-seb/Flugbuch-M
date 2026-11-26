import { useState } from 'react';
import { downloadOfm, parseOfmxFile, type OfmxData } from '../lib/ofmx';
import type { OfmxDiag } from '../lib/ofmx';
import { clearOfmx, ofmxAirportCount, ofmxExpired, ofmxMeta, saveOfmx } from '../lib/ofmxStore';

const d = (s: string) => (s ? new Date(s).toLocaleDateString('de-DE') : '–');

/** Import von openflightmaps-Daten (OFMX) */
export default function OfmxSettings() {
  const [, force] = useState(0);
  const [progress, setProgress] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const meta = ofmxMeta();

  const [region, setRegion] = useState(meta?.regions?.toLowerCase() || 'ed');
  const [info, setInfo] = useState('');

  const onFile = (f: File) => run(() => parseOfmxFile(f, (x) => setProgress(x)));
  const onDownload = () => run(() => downloadOfm(region, (x, i) => { setProgress(x); setInfo(i); }));

  const run = async (load: () => Promise<OfmxData>) => {
    setMsg(null);
    setProgress(0);
    setInfo('');
    try {
      const data = await load();
      await saveOfmx(data);
      const aps = Object.values(data.airports);
      const rps = aps.reduce((s, a) => s + a.rps.length, 0);
      const procs = aps.reduce((s, a) => s + a.procs.filter((p) => p.kind === 'circuit').length, 0);
      const routes = aps.reduce((s, a) => s + a.procs.filter((p) => p.kind !== 'circuit').length, 0);
      const pat = aps.reduce((s, a) => s + a.runways.reduce((t, r) => t + r.dirs.filter((x) => x.pattern === 'L' || x.pattern === 'R').length, 0), 0);
      setMsg({
        ok: true,
        text:
          `${aps.length} Flugplätze und ${rps} VFR-Meldepunkte übernommen. ` +
          (procs
            ? `${procs} veröffentlichte Platzrunden und ${routes} An-/Abflug-/Transitrouten übernommen.`
            : 'Keine Platzrunden in dieser Datei – nutze „Direkt von openflightmaps laden“.') +
          (pat ? ` ${pat} Platzrundenrichtungen.` : ''),
      });
    } catch (e) {
      setMsg({ ok: false, text: `Import fehlgeschlagen: ${(e as Error).message}` });
    } finally {
      setProgress(null);
      force((x) => x + 1);
    }
  };

  return (
    <div className="card">
      <h2>Platzdaten (openflightmaps)</h2>
      <p className="small muted" style={{ marginTop: 0 }}>
        Lädt die aktuellen openflightmaps-Daten deiner Region: veröffentlichte Platzrunden mit Höhe, An-/Abflug- und Transitrouten,
        VFR-Meldepunkte, exakte Pisten, Frequenzen und Platzhinweise. Damit kennt die App die exakte Pistenlage, die Platzrundenrichtung je Piste, die VFR-Meldepunkte, Frequenzen und
        Platzhinweise. Die Daten bleiben auf diesem Gerät; bitte die Nutzungsbedingungen von openflightmaps beachten.
      </p>
      {meta && (
        <div className={ofmxExpired() ? 'err' : 'ok-box'} style={{ marginBottom: 10 }}>
          <b>{meta.regions || 'OFMX'}</b> · {ofmxAirportCount()} Flugplätze · gültig {meta.expiration ? `${d(meta.effective)} – ${d(meta.expiration)}` : `ab ${d(meta.effective)}`}
          {ofmxExpired() && <div>⚠️ Abgelaufen – bitte den aktuellen AIRAC-Stand neu importieren.</div>}
          <div className="small muted">{meta.fileName}</div>
        </div>
      )}
      {progress != null ? (
        <div>
          <div className="small">{info || 'Lese OFMX …'} · {Math.round(progress * 100)} %</div>
          <div className="progress"><div style={{ width: `${progress * 100}%` }} /></div>
        </div>
      ) : (
        <>
        <div className="row" style={{ marginBottom: 10 }}>
          <label style={{ flex: '0 0 90px', margin: 0 }}>
            Region
            <select value={region} onChange={(e) => setRegion(e.target.value)}>
              {[['ed', 'ED Deutschland'], ['lo', 'LO Österreich'], ['ls', 'LS Schweiz'], ['lk', 'LK Tschechien'], ['lh', 'LH Ungarn'], ['lj', 'LJ Slowenien'], ['lz', 'LZ Slowakei'], ['eb', 'EB Benelux']].map(([v, n]) => (
                <option key={v} value={v}>{n}</option>
              ))}
            </select>
          </label>
          <button className="primary" onClick={onDownload}>⬇︎ Direkt von openflightmaps laden</button>
        </div>
        <p className="small muted" style={{ marginTop: 0 }}>Lädt die vollständigen Daten inkl. Platzrunden (Deutschland ca. 60 MB – WLAN empfohlen). Alternativ eine Datei importieren:</p>
        <div className="row">
          <label className="button-like">
            <input type="file" accept=".ofmx,.xml,.zip,application/zip,application/xml,text/xml" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f); }} />
            <span>📂 Datei (.xml / .ofmx / .zip)</span>
          </label>
          {meta && (
            <button style={{ flex: '0 0 auto' }} className="danger" onClick={async () => { if (confirm('openflightmaps-Daten entfernen?')) { await clearOfmx(); location.reload(); } }}>
              Entfernen
            </button>
          )}
        </div>
        </>
      )}
      {msg && <div className={msg.ok ? 'ok-box' : 'err'} style={{ marginTop: 10 }}>{msg.text}</div>}
      {meta?.diag && <Diag diag={meta.diag} />}
    </div>
  );
}

/** Diagnose: zeigt, wie die importierte Datei aufgebaut ist (zum Anpassen des Parsers) */
function Diag({ diag }: { diag: OfmxDiag }) {
  const [copied, setCopied] = useState(false);
  const tags = Object.entries(diag.tags).sort((a, b) => b[1] - a[1]);
  const text = [
    `Pisten: ${diag.runways}, Pistenrichtungen: ${diag.dirs} (zugeordnet ${diag.dirsLinked}, mit Platzrundenrichtung ${diag.dirsWithPattern})`,
    `codeVfrPattern-Werte: ${JSON.stringify(diag.patternValues)}`,
    `Dateien: ${(diag.files ?? []).join(', ')}`,
    `Verfahren (Prc): ${JSON.stringify(diag.procTypes ?? {})}, zugeordnet ${diag.procsAssigned ?? 0}`,
    `Elemente: ${tags.map(([k, v]) => `${k}=${v}`).join(', ')}`,
    `Stichworte: ${JSON.stringify(diag.keywords ?? {})}`,
    `Luftraum-Typen: ${JSON.stringify(diag.aseTypes ?? {})}`,
    ...diag.samples.map((s) => `--- ${s.label} ---\n${s.text}`),
  ].join('\n');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
      alert('Kopieren nicht möglich – bitte Screenshot schicken.');
    }
  };
  return (
    <details className="section" style={{ marginTop: 12, borderBottom: 0 }}>
      <summary className="small">Diagnose der OFMX-Datei</summary>
      <div className="body small">
        <p style={{ margin: '0 0 6px' }}>
          Pisten: <b>{diag.runways}</b> · Richtungen: <b>{diag.dirs}</b> (zugeordnet {diag.dirsLinked}) · mit Platzrundenrichtung: <b>{diag.dirsWithPattern}</b>
        </p>
        <p style={{ margin: '0 0 6px', wordBreak: 'break-word' }}>Elemente: {tags.slice(0, 30).map(([k, v]) => `${k} ${v}`).join(' · ')}</p>
        <button onClick={copy}>{copied ? '✓ Kopiert – jetzt in den Chat einfügen' : 'Diagnose kopieren'}</button>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, maxHeight: 260, overflow: 'auto', background: 'var(--paper-2)', padding: 8, marginTop: 8 }}>{text}</pre>
      </div>
    </details>
  );
}
