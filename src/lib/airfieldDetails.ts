/**
 * Flugplatz-Details (Pisten, Frequenzen, Links) aus OurAirports (Public Domain)
 * und eigene Platz-Notizen / Platzrunden-Einstellungen / Anflugkarten des Nutzers.
 *
 * Achtung: Veröffentlichte Platzrunden (AIP VFR, DFS) sind nicht frei verfügbar.
 * Die App zeichnet deshalb eine SCHEMATISCHE Platzrunde aus der Pistengeometrie,
 * deren Richtung (links/rechts), Abstand und Höhe der Pilot pro Piste einstellen kann.
 */
import { db } from './db';
import { destination, distance, bearing } from './geo';
import type { Airfield } from './airfields';
import { ofmxAirport, ofmxMeta } from './ofmxStore';
import type { OfmxReportingPoint } from './ofmx';

export interface Runway {
  le: string; // z.B. "08"
  he: string; // z.B. "26"
  lengthFt: number;
  widthFt: number;
  surface: string;
  lighted: boolean;
  leLat: number | null;
  leLon: number | null;
  heLat: number | null;
  heLon: number | null;
  leHdg: number | null;
}

export interface AirfieldDetails {
  city?: string;
  web?: string;
  wiki?: string;
  type?: string;
  runways: Runway[];
  freqs: { type: string; desc: string; mhz: string }[];
  /** Platzrundenrichtung je Landerichtung laut openflightmaps (L/R/E) */
  patterns?: Record<string, 'L' | 'R' | 'E'>;
  /** VFR-Meldepunkte (openflightmaps) */
  rps?: OfmxReportingPoint[];
  rmk?: string;
  addresses?: { type: string; value: string; rmk?: string }[];
  source: 'ofm' | 'ourairports';
}

type Raw = Record<string, { city?: string; web?: string; wiki?: string; type?: string; rw?: (string | number | null)[][]; fq?: string[][] }>;
let raw: Raw | null = null;
let loading: Promise<Raw> | null = null;

export function loadDetails(): Promise<Raw> {
  if (raw) return Promise.resolve(raw);
  if (!loading)
    loading = fetch('./airfield-details.json')
      .then((r) => r.json())
      .then((d: Raw) => (raw = d))
      .catch(() => (raw = {}));
  return loading;
}

/** Details aus openflightmaps (falls importiert), sonst OurAirports */
export function getDetailsSync(icao: string): AirfieldDetails | null {
  const o = ofmxAirport(icao);
  const d = raw?.[icao];
  if (o) {
    const patterns: Record<string, 'L' | 'R' | 'E'> = {};
    const runways: Runway[] = o.runways.map((r) => {
      const [a, b] = r.dirs;
      for (const x of r.dirs) if (x.pattern) patterns[x.desig] = x.pattern;
      const [le, he] = r.desig.split('/');
      return {
        le: a?.desig ?? le ?? r.desig,
        he: b?.desig ?? he ?? '',
        lengthFt: Math.round((r.lenM ?? 0) / 0.3048),
        widthFt: Math.round((r.widM ?? 0) / 0.3048),
        surface: r.surface,
        lighted: false,
        leLat: a?.lat ?? null,
        leLon: a?.lon ?? null,
        heLat: b?.lat ?? null,
        heLon: b?.lon ?? null,
        leHdg: a?.trueBrg ?? null,
      };
    });
    return {
      city: o.city || d?.city,
      web: o.addresses.find((x) => x.type === 'URL')?.value ?? d?.web,
      wiki: d?.wiki,
      type: o.type,
      runways: runways.length ? runways : getDetailsSyncOA(icao)?.runways ?? [],
      freqs: o.freqs.length ? o.freqs.map((f) => ({ type: f.service, desc: f.callsign, mhz: f.mhz })) : getDetailsSyncOA(icao)?.freqs ?? [],
      patterns,
      rps: o.rps,
      rmk: o.rmk,
      addresses: o.addresses,
      source: 'ofm',
    };
  }
  return getDetailsSyncOA(icao);
}

export const ofmSourceLabel = () => {
  const m = ofmxMeta();
  return m ? `openflightmaps${m.effective ? ', gültig ab ' + new Date(m.effective).toLocaleDateString('de-DE') : ''}` : '';
};

function getDetailsSyncOA(icao: string): AirfieldDetails | null {
  const d = raw?.[icao];
  if (!d) return null;
  return {
    source: 'ourairports',
    city: d.city,
    web: d.web,
    wiki: d.wiki,
    type: d.type,
    runways: (d.rw ?? []).map((r) => ({
      le: String(r[0] ?? ''),
      he: String(r[1] ?? ''),
      lengthFt: Number(r[2]) || 0,
      widthFt: Number(r[3]) || 0,
      surface: String(r[4] ?? ''),
      lighted: !!r[5],
      leLat: r[6] as number | null,
      leLon: r[7] as number | null,
      heLat: r[8] as number | null,
      heLon: r[9] as number | null,
      leHdg: r[10] as number | null,
    })),
    freqs: (d.fq ?? []).map((f) => ({ type: f[0], desc: f[1], mhz: f[2] })),
  };
}

const SURFACE: Record<string, string> = {
  ASP: 'Asphalt', ASPH: 'Asphalt', CON: 'Beton', CONC: 'Beton', GRS: 'Gras', GRASS: 'Gras', TURF: 'Gras', GRE: 'Gras', GRV: 'Schotter', GRAVEL: 'Schotter', PEM: 'Asphalt', BIT: 'Bitumen', DIRT: 'Erde', SAND: 'Sand', WATER: 'Wasser',
};
export const surfaceName = (s: string) => SURFACE[s.toUpperCase()] ?? SURFACE[s.toUpperCase().split(/[-/ ]/)[0]] ?? s;

/** Pistengeometrie: echte Schwellen wenn vorhanden, sonst aus Bezugspunkt + Kennung (z.B. 08 → 080°) geschätzt */
export function runwayEnds(f: Airfield, r: Runway): { a: [number, number]; b: [number, number]; hdg: number; approx: boolean } | null {
  if (r.leLat != null && r.leLon != null && r.heLat != null && r.heLon != null) {
    return { a: [r.leLat, r.leLon], b: [r.heLat, r.heLon], hdg: bearing(r.leLat, r.leLon, r.heLat, r.heLon), approx: false };
  }
  const num = parseInt(r.le, 10);
  const hdg = r.leHdg ?? (num >= 1 && num <= 36 ? num * 10 : null);
  if (hdg == null) return null;
  const len = (r.lengthFt || 2000) * 0.3048;
  const a = destination(f.lat, f.lon, (hdg + 180) % 360, len / 2);
  const b = destination(f.lat, f.lon, hdg, len / 2);
  return { a, b, hdg, approx: true };
}

// ---------- Nutzereinstellungen pro Platz ----------

export interface CircuitCfg {
  dir: 'L' | 'R';
  offsetM: number; // Abstand Gegenanflug zur Piste
  altFt: string; // Freitext, z.B. "1000 ft MSL"
}
export interface FieldUserData {
  circuits: Record<string, Partial<CircuitCfg>>; // Key: Landerichtung, z.B. "26" (nur geänderte Werte)
  active: string | null; // Landerichtung, deren Platzrunde auf der Karte gezeigt wird
  notes: string;
  docs: { id: string; name: string; type: string }[]; // eigene Anflugkarten
}

export const DEFAULT_CIRCUIT: CircuitCfg = { dir: 'L', offsetM: 1200, altFt: '' };

/** Wirksame Platzrunden-Einstellung: Standard ← openflightmaps-Richtung ← eigene Einstellung */
export function effectiveCircuit(icao: string, rwyDir: string, user?: Partial<CircuitCfg>): CircuitCfg & { dirSource: 'ofm' | 'user' | 'default' } {
  const p = getDetailsSync(icao)?.patterns?.[rwyDir];
  const ofmDir = p === 'L' || p === 'R' ? p : undefined;
  return {
    ...DEFAULT_CIRCUIT,
    ...(ofmDir ? { dir: ofmDir } : {}),
    ...user,
    dirSource: user?.dir ? 'user' : ofmDir ? 'ofm' : 'default',
  };
}

export async function getFieldData(icao: string): Promise<FieldUserData> {
  const d = await db.get<FieldUserData>(`field:${icao}`);
  return { circuits: {}, active: null, notes: '', docs: [], ...d };
}
export function saveFieldData(icao: string, d: FieldUserData) {
  return db.set(`field:${icao}`, d);
}
export async function listFieldsWithCircuits(): Promise<string[]> {
  return (await db.get<string[]>('fieldsShown')) ?? [];
}
export async function setFieldShown(icao: string, on: boolean) {
  const l = new Set(await listFieldsWithCircuits());
  if (on) l.add(icao);
  else l.delete(icao);
  await db.set('fieldsShown', [...l]);
}

export async function addFieldDoc(icao: string, file: File) {
  const data = await getFieldData(icao);
  const id = `${Date.now().toString(36)}`;
  await db.set(`doc:${icao}:${id}`, file);
  data.docs.push({ id, name: file.name, type: file.type });
  await saveFieldData(icao, data);
  return data;
}
export async function getFieldDoc(icao: string, id: string) {
  return db.get<Blob>(`doc:${icao}:${id}`);
}
export async function removeFieldDoc(icao: string, id: string) {
  const data = await getFieldData(icao);
  data.docs = data.docs.filter((d) => d.id !== id);
  await db.del(`doc:${icao}:${id}`);
  await saveFieldData(icao, data);
  return data;
}

/**
 * Schematische Platzrunde für Landung auf Pistenrichtung `toward` (Schwelle → Pistenende):
 * Abflug → Querabflug → Gegenanflug → Queranflug → Endanflug.
 */
export function circuitPath(thr: [number, number], end: [number, number], cfg: CircuitCfg): [number, number][] {
  const hdg = bearing(thr[0], thr[1], end[0], end[1]);
  const side = cfg.dir === 'L' ? (hdg + 270) % 360 : (hdg + 90) % 360;
  const ext = Math.max(900, cfg.offsetM); // Verlängerung über die Pistenenden hinaus
  const up = destination(end[0], end[1], hdg, ext);
  const fin = destination(thr[0], thr[1], (hdg + 180) % 360, ext);
  const upSide = destination(up[0], up[1], side, cfg.offsetM);
  const finSide = destination(fin[0], fin[1], side, cfg.offsetM);
  return [thr, end, up, upSide, finSide, fin, thr];
}

export const runwayLengthM = (a: [number, number], b: [number, number]) => distance(a[0], a[1], b[0], b[1]);
