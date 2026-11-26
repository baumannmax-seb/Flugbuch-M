/**
 * Offline-Karten aus MBTiles-Dateien (SQLite mit Kartenkacheln).
 *
 * Import: Die Datei wird einmalig mit sql.js (SQLite als WebAssembly) gelesen und jede
 * Kachel als Blob in IndexedDB abgelegt. Danach wird die Datei nicht mehr gebraucht,
 * die Karte funktioniert komplett offline (auch nach Neustart der App).
 *
 * Unterstützt: Raster-MBTiles (png / jpg / webp). Vektor-MBTiles (pbf) werden abgelehnt.
 * MBTiles speichert Zeilen im TMS-Schema (y von unten) → Umrechnung auf XYZ beim Import.
 */
import L from 'leaflet';
import { openDb, uid } from './db';

export interface MbtilesMeta {
  id: string;
  name: string;
  format: 'png' | 'jpg' | 'webp';
  minzoom: number;
  maxzoom: number;
  bounds: [number, number, number, number] | null; // W,S,E,N
  attribution: string;
  count: number;
  bytes: number;
  /** Kacheln haben transparente Bereiche → eignet sich als Overlay */
  transparent: boolean;
  importedAt: number;
}

const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' } as const;

function idbReq<T>(r: IDBRequest<T>) {
  return new Promise<T>((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export async function listMbtiles(): Promise<MbtilesMeta[]> {
  const db = await openDb();
  return idbReq(db.transaction('mbtiles').objectStore('mbtiles').getAll() as IDBRequest<MbtilesMeta[]>);
}

export async function deleteMbtiles(id: string) {
  const db = await openDb();
  await new Promise<void>((res, rej) => {
    const t = db.transaction(['mbtiles', 'tiles'], 'readwrite');
    t.objectStore('mbtiles').delete(id);
    t.objectStore('tiles').delete(IDBKeyRange.bound(`${id}/`, `${id}/￿`));
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });
}

export async function getTile(id: string, z: number, x: number, y: number): Promise<Blob | undefined> {
  const db = await openDb();
  return idbReq(db.transaction('tiles').objectStore('tiles').get(`${id}/${z}/${x}/${y}`) as IDBRequest<Blob | undefined>);
}

function sniffFormat(data: Uint8Array): MbtilesMeta['format'] | 'pbf' | null {
  if (data[0] === 0x89 && data[1] === 0x50) return 'png';
  if (data[0] === 0xff && data[1] === 0xd8) return 'jpg';
  if (data[0] === 0x52 && data[1] === 0x49 && data[8] === 0x57) return 'webp';
  if (data[0] === 0x1f && data[1] === 0x8b) return 'pbf'; // gzip → Vektor
  return null;
}

export async function importMbtiles(file: File, onProgress: (done: number, total: number) => void): Promise<MbtilesMeta> {
  // sql.js erst bei Bedarf laden (ca. 1 MB WebAssembly)
  const [{ default: initSqlJs }, { default: wasmUrl }] = await Promise.all([import('sql.js'), import('sql.js/dist/sql-wasm.wasm?url')]);
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const sdb = new SQL.Database(new Uint8Array(await file.arrayBuffer()));
  try {
    const meta: Record<string, string> = {};
    try {
      const r = sdb.exec('SELECT name, value FROM metadata');
      for (const [k, v] of r[0]?.values ?? []) meta[String(k)] = String(v);
    } catch {
      /* metadata optional */
    }
    const total = Number(sdb.exec('SELECT COUNT(*) FROM tiles')[0].values[0][0]);
    if (!total) throw new Error('Die Datei enthält keine Kacheln.');

    let format = (meta.format?.toLowerCase().replace('jpeg', 'jpg') as MbtilesMeta['format'] | 'pbf' | undefined) ?? undefined;
    if (!format || !(format in MIME)) {
      const first = sdb.exec('SELECT tile_data FROM tiles LIMIT 1')[0].values[0][0] as Uint8Array;
      format = sniffFormat(first) ?? undefined;
    }
    if (format === 'pbf') throw new Error('Vektor-MBTiles (pbf) werden noch nicht unterstützt – bitte eine Raster-Datei (PNG/JPG) verwenden.');
    if (!format || !(format in MIME)) throw new Error('Unbekanntes Kachelformat.');
    const mime = MIME[format];

    const id = uid();
    const db = await openDb();
    const stmt = sdb.prepare('SELECT zoom_level, tile_column, tile_row, tile_data FROM tiles');
    let done = 0;
    let bytes = 0;
    let minz = 99;
    let maxz = 0;
    const samples: Blob[] = [];
    const BATCH = 400;
    try {
      let more = true;
      while (more) {
        const batch: [string, Blob][] = [];
        while (batch.length < BATCH && (more = stmt.step())) {
          const [z, x, tmsY, data] = stmt.get() as [number, number, number, Uint8Array];
          const y = (1 << z) - 1 - tmsY; // TMS → XYZ
          batch.push([`${id}/${z}/${x}/${y}`, new Blob([data], { type: mime })]);
          bytes += data.byteLength;
          if (samples.length < 5 && (done + batch.length) % 7 === 0) samples.push(batch[batch.length - 1][1]);
          if (z < minz) minz = z;
          if (z > maxz) maxz = z;
        }
        if (batch.length) {
          await new Promise<void>((res, rej) => {
            const t = db.transaction('tiles', 'readwrite');
            const s = t.objectStore('tiles');
            for (const [k, v] of batch) s.put(v, k);
            t.oncomplete = () => res();
            t.onerror = () => rej(t.error ?? new Error('Speichern fehlgeschlagen (Speicher voll?)'));
            t.onabort = () => rej(t.error ?? new Error('Speichern abgebrochen (Speicher voll?)'));
          });
          done += batch.length;
          onProgress(done, total);
        }
      }
    } catch (e) {
      stmt.free();
      await deleteMbtiles(id).catch(() => {});
      throw e;
    }
    stmt.free();

    let bounds: MbtilesMeta['bounds'] = null;
    if (meta.bounds) {
      const b = meta.bounds.split(',').map(Number);
      if (b.length === 4 && b.every((n) => isFinite(n))) bounds = b as [number, number, number, number];
    }
    const m: MbtilesMeta = {
      id,
      name: meta.name || file.name.replace(/\.mbtiles$/i, ''),
      format,
      minzoom: Number.isFinite(Number(meta.minzoom)) && meta.minzoom ? Number(meta.minzoom) : minz,
      maxzoom: Number.isFinite(Number(meta.maxzoom)) && meta.maxzoom ? Number(meta.maxzoom) : maxz,
      bounds,
      attribution: meta.attribution ?? '',
      count: done,
      bytes,
      transparent: format !== 'jpg' && (await anyTransparent(samples)),
      importedAt: Date.now(),
    };
    await idbReq(db.transaction('mbtiles', 'readwrite').objectStore('mbtiles').put(m));
    // Browser bitten, die Daten nicht bei Speicherknappheit zu löschen
    navigator.storage?.persist?.().catch(() => {});
    return m;
  } finally {
    sdb.close();
  }
}

/** Prüft an einigen Beispielkacheln, ob sie (teilweise) transparent sind */
async function anyTransparent(blobs: Blob[]): Promise<boolean> {
  for (const b of blobs) {
    try {
      const bmp = await createImageBitmap(b);
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 64;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(bmp, 0, 0, 64, 64);
      const d = ctx.getImageData(0, 0, 64, 64).data;
      for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return true;
    } catch {
      /* Bild nicht dekodierbar → ignorieren */
    }
  }
  return false;
}

/** Leaflet-Layer, der Kacheln aus IndexedDB liefert; über maxzoom hinaus wird hochskaliert */
export function mbtilesLayer(m: MbtilesMeta, opts: { opacity?: number } = {}) {
  const Layer = L.GridLayer.extend({
    createTile(coords: L.Coords, done: L.DoneCallback) {
      const img = document.createElement('img');
      img.alt = '';
      getTile(m.id, coords.z, coords.x, coords.y)
        .then((blob) => {
          if (!blob) return done(undefined, img); // keine Kachel → leer lassen
          const url = URL.createObjectURL(blob);
          img.onload = () => {
            URL.revokeObjectURL(url);
            done(undefined, img);
          };
          img.onerror = () => {
            URL.revokeObjectURL(url);
            done(new Error('tile'), img);
          };
          img.src = url;
        })
        .catch((e) => done(e, img));
      return img;
    },
  });
  const b = m.bounds;
  return new (Layer as unknown as new (o: L.GridLayerOptions) => L.GridLayer)({
    minZoom: Math.max(0, m.minzoom - 2),
    maxZoom: 18,
    minNativeZoom: m.minzoom,
    maxNativeZoom: m.maxzoom,
    bounds: b ? L.latLngBounds([b[1], b[0]], [b[3], b[2]]) : undefined,
    attribution: m.attribution || m.name,
    opacity: opts.opacity ?? 1,
  });
}
