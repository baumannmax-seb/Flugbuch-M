/**
 * openAIP Core API: Platzrundenrichtung je Pistenrichtung.
 *
 * Feld `runways[].turnDirection` (laut openAIP-Schema): 0 = rechts, 1 = links, 2 = beides.
 * API: https://api.core.openaip.net/api, Key im Header `x-openaip-api-key`.
 * Ergebnisse werden lokal zwischengespeichert (offline nutzbar, max. 30 Tage).
 */
import { db } from './db';

const BASE = 'https://api.core.openaip.net/api';
const MAX_AGE = 30 * 86400000;

export interface OaipAirportInfo {
  t: number;
  dirs: Record<string, 'L' | 'R' | 'E'>;
}

const mem = new Map<string, OaipAirportInfo>();

export function oaipCached(icao: string): OaipAirportInfo | null {
  return mem.get(icao) ?? null;
}

const TURN: Record<number, 'R' | 'L' | 'E'> = { 0: 'R', 1: 'L', 2: 'E' };

interface OaipRunway {
  designator?: string;
  turnDirection?: number;
}
interface OaipAirport {
  icaoCode?: string;
  name?: string;
  runways?: OaipRunway[];
}

/** Aus Cache laden und – falls alt/fehlend und Key vorhanden – neu abfragen */
export async function loadOaipAirport(icao: string, key: string): Promise<OaipAirportInfo | null> {
  if (!mem.has(icao)) {
    const c = await db.get<OaipAirportInfo>(`oaip:${icao}`);
    if (c) mem.set(icao, c);
  }
  const cached = mem.get(icao) ?? null;
  if (!key.trim() || (cached && Date.now() - cached.t < MAX_AGE)) return cached;
  try {
    const res = await fetch(`${BASE}/airports?search=${encodeURIComponent(icao)}&limit=10`, { headers: { 'x-openaip-api-key': key.trim(), Accept: 'application/json' } });
    if (!res.ok) return cached;
    const json = (await res.json()) as { items?: OaipAirport[] };
    const ap = json.items?.find((a) => a.icaoCode?.toUpperCase() === icao.toUpperCase());
    if (!ap) return cached;
    const dirs: OaipAirportInfo['dirs'] = {};
    for (const r of ap.runways ?? []) {
      const t = TURN[r.turnDirection ?? -1];
      if (r.designator && t) dirs[r.designator.trim()] = t;
    }
    const info = { t: Date.now(), dirs };
    mem.set(icao, info);
    await db.set(`oaip:${icao}`, info);
    return info;
  } catch {
    return cached; // offline oder CORS-Problem: Cache verwenden
  }
}
