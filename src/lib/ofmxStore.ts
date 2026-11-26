// Speichert importierte OFMX-Daten lokal und stellt sie der App zur Verfügung
import { db } from './db';
import { getAirfieldsSync, setAirfields, type Airfield } from './airfields';
import type { OfmxAirport, OfmxData } from './ofmx';

let data: OfmxData | null = null;
let byIcao: Map<string, OfmxAirport> = new Map();

function index() {
  byIcao = new Map();
  for (const a of Object.values(data?.airports ?? {})) {
    byIcao.set(a.id, a);
    if (a.icao) byIcao.set(a.icao, a);
  }
}

/** Flugplätze aus OFMX in die Flugplatzliste übernehmen (aktuelle Lage/Höhe, fehlende ergänzen) */
function mergeAirfields() {
  if (!data) return;
  const list = getAirfieldsSync().slice();
  const pos = new Map(list.map((f, i) => [f.icao, i]));
  for (const a of Object.values(data.airports)) {
    const f: Airfield = { icao: a.icao || a.id, name: a.name, lat: a.lat, lon: a.lon, elevFt: a.elevFt ?? list[pos.get(a.icao) ?? -1]?.elevFt ?? 0 };
    const i = pos.get(f.icao);
    if (i != null) list[i] = { ...list[i], lat: f.lat, lon: f.lon, elevFt: f.elevFt };
    else {
      pos.set(f.icao, list.length);
      list.push(f);
    }
  }
  setAirfields(list);
}

export async function loadOfmx() {
  data = (await db.get<OfmxData>('ofmx')) ?? null;
  index();
  mergeAirfields();
  return data;
}

export async function saveOfmx(d: OfmxData) {
  await db.set('ofmx', d);
  data = d;
  index();
  mergeAirfields();
}

export async function clearOfmx() {
  await db.del('ofmx');
  data = null;
  index();
}

export const ofmxMeta = () => data?.meta ?? null;
export const ofmxAirport = (icao: string) => byIcao.get(icao) ?? null;
export const ofmxAirportCount = () => Object.keys(data?.airports ?? {}).length;
export const ofmxExpired = () => !!data?.meta.expiration && new Date(data.meta.expiration).getTime() < Date.now();
