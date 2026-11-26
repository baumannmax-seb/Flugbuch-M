import { useEffect, useState } from 'react';
import type { AppSettings } from '../lib/settings';
import { deleteMbtiles, importMbtiles, listMbtiles, type MbtilesMeta } from '../lib/mbtiles';
import { baseSources, DEFAULT_OPENAIP_URL, openAipUrl } from './tiles';

const mb = (b: number) => (b / 1048576).toFixed(b > 100 * 1048576 ? 0 : 1) + ' MB';

/** Einstellungen für Karten: Grundkarte, openAIP, eigene Kachel-URL, MBTiles-Import */
export default function MapSettings({ settings, onChange }: { settings: AppSettings; onChange: (s: AppSettings) => void }) {
  const [mbt, setMbt] = useState<MbtilesMeta[]>([]);
  const [progress, setProgress] = useState<{ name: string; done: number; total: number } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [aipTest, setAipTest] = useState<string | null>(null);
  const [showAdv, setShowAdv] = useState(false);

  const reload = () => listMbtiles().then(setMbt).catch(() => setMbt([]));
  useEffect(() => {
    reload();
  }, []);

  const onFile = async (file: File) => {
    setMsg(null);
    setProgress({ name: file.name, done: 0, total: 1 });
    try {
      const m = await importMbtiles(file, (done, total) => setProgress({ name: file.name, done, total }));
      await reload();
      // frisch importierte Karte direkt aktivieren: transparente als Overlay, deckende als Grundkarte
      if (m.transparent) onChange({ ...settings, overlays: [...settings.overlays, `mbt:${m.id}`] });
      else onChange({ ...settings, mapLayer: `mbt:${m.id}` });
      setMsg({ ok: true, text: `„${m.name}“ importiert: ${m.count.toLocaleString('de-DE')} Kacheln, Zoom ${m.minzoom}–${m.maxzoom}, ${mb(m.bytes)}. ${m.transparent ? 'Als Overlay aktiviert.' : 'Als Grundkarte aktiviert.'}` });
    } catch (e) {
      const err = e as Error;
      setMsg({ ok: false, text: `Import fehlgeschlagen: ${err.message || err}. Sehr große Dateien (> ca. 300 MB) können auf dem iPhone zu wenig Arbeitsspeicher haben – dann eine kleinere Region / weniger Zoomstufen exportieren.` });
    } finally {
      setProgress(null);
    }
  };

  const remove = async (m: MbtilesMeta) => {
    if (!confirm(`Offline-Karte „${m.name}“ löschen?`)) return;
    await deleteMbtiles(m.id);
    const key = `mbt:${m.id}`;
    onChange({ ...settings, mapLayer: settings.mapLayer === key ? 'topo' : settings.mapLayer, overlays: settings.overlays.filter((o) => o !== key) });
    reload();
  };

  const testAip = () => {
    setAipTest('teste …');
    const img = new Image();
    const url = openAipUrl(settings).replace('{z}', '8').replace('{x}', '134').replace('{y}', '86').replace('{s}', 'a');
    img.onload = () => setAipTest('✓ Verbindung ok – Kachel geladen');
    img.onerror = () => setAipTest('✗ Kachel konnte nicht geladen werden – API-Key oder URL prüfen (oder keine Internetverbindung)');
    img.src = url;
  };

  const toggleOverlay = (id: string, on: boolean) =>
    onChange({ ...settings, overlays: on ? [...new Set([...settings.overlays, id])] : settings.overlays.filter((x) => x !== id) });

  return (
    <div className="card">
      <h2>Karten</h2>
      <label>
        Grundkarte
        <select value={settings.mapLayer} onChange={(e) => onChange({ ...settings, mapLayer: e.target.value })}>
          {baseSources(settings, mbt).map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </label>

      <h2 style={{ marginTop: 16 }}>openAIP (Lufträume, Flugplätze, Frequenzen)</h2>
      <p className="small muted" style={{ marginTop: 0 }}>
        Kostenlosen API-Key auf <b>openaip.net</b> anlegen (Konto erstellen → im Profil „API Clients“ / API-Key erzeugen) und hier
        einfügen. Der Key bleibt nur auf diesem Gerät.
      </p>
      <label>
        openAIP API-Key
        <input value={settings.openAipKey} placeholder="Key einfügen" autoCapitalize="off" autoCorrect="off" spellCheck={false} onChange={(e) => onChange({ ...settings, openAipKey: e.target.value })} />
      </label>
      {settings.openAipKey.trim() && (
        <>
          <label className="check">
            <input type="checkbox" checked={settings.overlays.includes('openaip')} onChange={(e) => toggleOverlay('openaip', e.target.checked)} /> openAIP-Overlay anzeigen
          </label>
          <div className="row" style={{ marginTop: 8 }}>
            <button onClick={testAip}>Verbindung testen</button>
          </div>
          {aipTest && <p className="small">{aipTest}</p>}
        </>
      )}

      <h2 style={{ marginTop: 16 }}>Offline-Karten (MBTiles)</h2>
      <p className="small muted" style={{ marginTop: 0 }}>
        Raster-MBTiles (PNG/JPG/WebP) z. B. einer ICAO-Karte importieren. Die Karte wird auf dem Gerät gespeichert und funktioniert
        danach ohne Internet. Transparente Karten (z. B. nur Lufträume) werden als Overlay aktiviert, deckende als Grundkarte.
      </p>
      {mbt.map((m) => (
        <div key={m.id} className="row" style={{ marginBottom: 8, alignItems: 'flex-start' }}>
          <div>
            <b>{m.name}</b>
            <div className="small muted">
              {m.format.toUpperCase()} · Zoom {m.minzoom}–{m.maxzoom} · {m.count.toLocaleString('de-DE')} Kacheln · {mb(m.bytes)}
            </div>
            <label className="check" style={{ border: 0, padding: '4px 0', fontSize: 14 }}>
              <input type="checkbox" checked={settings.overlays.includes(`mbt:${m.id}`)} onChange={(e) => toggleOverlay(`mbt:${m.id}`, e.target.checked)} /> als Overlay
            </label>
          </div>
          <button style={{ flex: '0 0 auto' }} className="danger" onClick={() => remove(m)}>✕</button>
        </div>
      ))}
      {progress ? (
        <div>
          <div className="small">Importiere {progress.name} … {Math.round((progress.done / progress.total) * 100)} %</div>
          <div className="progress"><div style={{ width: `${(progress.done / progress.total) * 100}%` }} /></div>
          <div className="small muted">Bitte App geöffnet lassen.</div>
        </div>
      ) : (
        <label className="button-like">
          <input type="file" accept=".mbtiles,application/octet-stream,application/x-sqlite3" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f); }} />
          <span>📂 MBTiles-Datei importieren</span>
        </label>
      )}
      {msg && <div className={msg.ok ? 'ok-box' : 'err'} style={{ marginTop: 10 }}>{msg.text}</div>}

      <button className="ghost small" style={{ marginTop: 12, padding: 4 }} onClick={() => setShowAdv(!showAdv)}>
        {showAdv ? '▾' : '▸'} Erweitert: eigene Kartenquellen
      </button>
      {showAdv && (
        <div style={{ marginTop: 8 }}>
          <label>
            Eigene Online-Karte: Name
            <input value={settings.customName} placeholder="z.B. ICAO-Karte" onChange={(e) => onChange({ ...settings, customName: e.target.value })} />
          </label>
          <label>
            Kachel-URL (XYZ, mit {'{z}/{x}/{y}'})
            <input value={settings.customUrl} placeholder="https://…/{z}/{x}/{y}.png" autoCapitalize="off" autoCorrect="off" spellCheck={false} onChange={(e) => onChange({ ...settings, customUrl: e.target.value })} />
          </label>
          <label>
            openAIP-Kachel-URL ({'{key}'} = API-Key)
            <input value={settings.openAipUrl} placeholder={DEFAULT_OPENAIP_URL} autoCapitalize="off" autoCorrect="off" spellCheck={false} onChange={(e) => onChange({ ...settings, openAipUrl: e.target.value })} />
          </label>
          <p className="small muted">Nur Quellen verwenden, deren Nutzungsbedingungen das erlauben.</p>
        </div>
      )}
    </div>
  );
}
