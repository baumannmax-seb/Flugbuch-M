// Lokale Datenhaltung in IndexedDB (bleibt auf dem Gerät, funktioniert offline)
import type { GpsPoint, FlightEvent } from './flightDetector';

export interface LogEntry {
  id: string;
  date: number; // ms, Tag des Fluges
  aircraftReg: string;
  aircraftType: string;
  from: string;
  to: string;
  offBlock: number | null;
  takeoff: number | null;
  landing: number | null;
  onBlock: number | null;
  flightMin: number; // Flugzeit in Minuten
  blockMin: number;
  landings: number;
  touchAndGos: number;
  pic: string;
  role: 'PIC' | 'DUAL' | 'FI' | 'PAX';
  remarks: string;
  trackId?: string;
  createdAt: number;
  source: 'gps' | 'manual';
}

export interface Track {
  id: string;
  points: GpsPoint[];
  events: FlightEvent[];
}

export interface Aircraft {
  reg: string;
  type: string;
}

const DB_NAME = 'flugbuch-m';
const VERSION = 2;

let dbp: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('entries')) db.createObjectStore('entries', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('tracks')) db.createObjectStore('tracks', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        // v2: Offline-Karten (MBTiles) – Metadaten + einzelne Kacheln als Blob
        if (!db.objectStoreNames.contains('mbtiles')) db.createObjectStore('mbtiles', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('tiles')) db.createObjectStore('tiles');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbp;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

export const db = {
  listEntries: () => tx<LogEntry[]>('entries', 'readonly', (s) => s.getAll() as IDBRequest<LogEntry[]>).then((l) => l.sort((a, b) => (b.takeoff ?? b.date) - (a.takeoff ?? a.date))),
  putEntry: (e: LogEntry) => tx('entries', 'readwrite', (s) => s.put(e)),
  deleteEntry: (id: string) => tx('entries', 'readwrite', (s) => s.delete(id)),
  getTrack: (id: string) => tx<Track | undefined>('tracks', 'readonly', (s) => s.get(id) as IDBRequest<Track | undefined>),
  putTrack: (t: Track) => tx('tracks', 'readwrite', (s) => s.put(t)),
  deleteTrack: (id: string) => tx('tracks', 'readwrite', (s) => s.delete(id)),
  get: <T>(key: string) => tx<T | undefined>('kv', 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>),
  set: (key: string, value: unknown) => tx('kv', 'readwrite', (s) => s.put(value, key)),
  del: (key: string) => tx('kv', 'readwrite', (s) => s.delete(key)),
};

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
