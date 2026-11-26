// Flugplatz-Datenbank (Quelle: OurAirports, Public Domain) – DE + Nachbarländer, inkl. UL-Plätze
import { distance } from './geo';

export interface Airfield {
  icao: string;
  name: string;
  lat: number;
  lon: number;
  elevFt: number;
}

let cache: Airfield[] | null = null;
let loading: Promise<Airfield[]> | null = null;

export function loadAirfields(): Promise<Airfield[]> {
  if (cache) return Promise.resolve(cache);
  if (!loading) {
    loading = fetch('./airfields.json')
      .then((r) => r.json())
      .then((rows: [string, string, number, number, number][]) => {
        cache = rows.map(([icao, name, lat, lon, elevFt]) => ({ icao, name, lat, lon, elevFt }));
        return cache;
      })
      .catch(() => (cache = []));
  }
  return loading;
}

export function setAirfields(list: Airfield[]) {
  cache = list;
}

export function getAirfieldsSync(): Airfield[] {
  return cache ?? [];
}

/** Nächster Flugplatz innerhalb maxDist (m) */
export function nearestAirfield(lat: number, lon: number, maxDist = Infinity): { field: Airfield; dist: number } | null {
  let best: Airfield | null = null;
  let bestD = Infinity;
  for (const f of getAirfieldsSync()) {
    // grober Vorfilter
    if (Math.abs(f.lat - lat) > 1.5 || Math.abs(f.lon - lon) > 2.5) continue;
    const d = distance(lat, lon, f.lat, f.lon);
    if (d < bestD) {
      bestD = d;
      best = f;
    }
  }
  if (!best || bestD > maxDist) return null;
  return { field: best, dist: bestD };
}

export function searchAirfields(q: string, limit = 20): Airfield[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  const list = getAirfieldsSync();
  const exact = list.filter((f) => f.icao.toLowerCase().startsWith(s));
  const byName = list.filter((f) => !f.icao.toLowerCase().startsWith(s) && f.name.toLowerCase().includes(s));
  return [...exact, ...byName].slice(0, limit);
}
