/**
 * Import von GPS-Tracks aus anderen Quellen und Erzeugen eines Flugbucheintrags.
 *
 * Formate:
 *  - GPX (Garmin, SkyDemon, ForeFlight, Strava …): <trkpt lat lon><ele><time>
 *  - KML (u.a. Flightradar24): <gx:Track> mit <when>/<gx:coord> oder Placemarks mit <when> + <Point>
 *  - IGC (Segelflug-/UL-Logger): B-Datensätze + Datum aus HFDTE
 *  - CSV (Flightradar24: Timestamp,UTC,Callsign,Position,Altitude,Speed,Direction; sonst lat/lon/time-Spalten)
 *
 * Der Track wird anschließend durch dieselbe Erkennung wie eine Live-Aufzeichnung geschickt.
 */
import { FlightDetector, type DetectorSnapshot, type GpsPoint } from './flightDetector';
import { nearestAirfield } from './airfields';
import { buildEntry, type Crew } from './recorder';
import { uid, type LogEntry, type Track } from './db';
import type { AppSettings } from './settings';
import { KT_PER_MS } from './geo';

export interface ParsedTrack {
  format: string;
  points: GpsPoint[];
}

const num = (s: string | undefined | null) => (s == null || s.trim() === '' ? null : Number(s));
const FT = 0.3048;

function finalize(format: string, pts: GpsPoint[]): ParsedTrack {
  const points = pts
    .filter((p) => isFinite(p.lat) && isFinite(p.lon) && isFinite(p.t) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180)
    .sort((a, b) => a.t - b.t)
    .filter((p, i, a) => i === 0 || p.t > a[i - 1].t);
  if (points.length < 5) throw new Error('Zu wenige Punkte mit Zeitstempel im Track gefunden.');
  return { format, points };
}

export function parseGpx(text: string): ParsedTrack {
  const pts: GpsPoint[] = [];
  for (const m of text.matchAll(/<(?:trkpt|rtept)\b([^>]*)>([\s\S]*?)<\/(?:trkpt|rtept)>/g)) {
    const lat = Number(m[1].match(/lat="([^"]+)"/)?.[1]);
    const lon = Number(m[1].match(/lon="([^"]+)"/)?.[1]);
    const time = m[2].match(/<time>([^<]+)<\/time>/)?.[1];
    if (!time) continue;
    const ele = num(m[2].match(/<ele>([^<]+)<\/ele>/)?.[1]);
    const spd = num(m[2].match(/<(?:\w+:)?speed>([^<]+)<\/(?:\w+:)?speed>/)?.[1]);
    pts.push({ t: Date.parse(time), lat, lon, alt: ele, speed: spd, track: null });
  }
  return finalize('GPX', pts);
}

export function parseKml(text: string): ParsedTrack {
  const pts: GpsPoint[] = [];
  // gx:Track: Liste von <when> und passenden <gx:coord>
  for (const tr of text.matchAll(/<gx:Track>([\s\S]*?)<\/gx:Track>/g)) {
    const whens = [...tr[1].matchAll(/<when>([^<]+)<\/when>/g)].map((m) => Date.parse(m[1]));
    const coords = [...tr[1].matchAll(/<gx:coord>([^<]+)<\/gx:coord>/g)].map((m) => m[1].trim().split(/\s+/).map(Number));
    coords.forEach((c, i) => whens[i] && pts.push({ t: whens[i], lat: c[1], lon: c[0], alt: c[2] ?? null, speed: null, track: null }));
  }
  // Placemarks mit Zeitstempel und Punkt (Flightradar24)
  if (!pts.length) {
    for (const pm of text.matchAll(/<Placemark>([\s\S]*?)<\/Placemark>/g)) {
      const when = pm[1].match(/<when>([^<]+)<\/when>/)?.[1];
      const coord = pm[1].match(/<Point>[\s\S]*?<coordinates>([^<]+)<\/coordinates>/)?.[1];
      if (!when || !coord) continue;
      const [lon, lat, alt] = coord.trim().split(',').map(Number);
      // Flightradar24 schreibt Geschwindigkeit/Kurs in die Beschreibung
      const desc = pm[1].match(/<description>([\s\S]*?)<\/description>/)?.[1] ?? '';
      const kt = num(desc.match(/Speed:?\s*(?:<[^>]*>)*\s*([\d.]+)\s*kt/i)?.[1]);
      pts.push({ t: Date.parse(when), lat, lon, alt: isFinite(alt) ? alt : null, speed: kt != null ? kt / KT_PER_MS : null, track: null });
    }
  }
  if (!pts.length && /<LineString>/.test(text)) throw new Error('Die KML enthält nur eine Linie ohne Zeitstempel – Zeiten lassen sich daraus nicht ermitteln.');
  return finalize('KML', pts);
}

export function parseIgc(text: string): ParsedTrack {
  const d = text.match(/HFDTE(?:DATE:)?(\d{2})(\d{2})(\d{2})/);
  if (!d) throw new Error('IGC-Datei ohne Datum (HFDTE).');
  const base = Date.UTC(2000 + Number(d[3]), Number(d[2]) - 1, Number(d[1]));
  const pts: GpsPoint[] = [];
  let lastSec = -1;
  let dayOffset = 0;
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^B(\d{2})(\d{2})(\d{2})(\d{2})(\d{5})([NS])(\d{3})(\d{5})([EW])([AV])(-?\d{5})(-?\d{5})/);
    if (!m) continue;
    const sec = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
    if (sec < lastSec) dayOffset += 86400; // über Mitternacht (UTC)
    lastSec = sec;
    const lat = (Number(m[4]) + Number(m[5]) / 1000 / 60) * (m[6] === 'S' ? -1 : 1);
    const lon = (Number(m[7]) + Number(m[8]) / 1000 / 60) * (m[9] === 'W' ? -1 : 1);
    const gps = Number(m[12]);
    const pressure = Number(m[11]);
    pts.push({ t: base + (sec + dayOffset) * 1000, lat, lon, alt: gps !== 0 ? gps : pressure, speed: null, track: null });
  }
  return finalize('IGC', pts);
}

/** CSV-Zeile mit Anführungszeichen trennen */
const splitCsv = (line: string, d: string) => {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (const c of line) {
    if (c === '"') q = !q;
    else if (c === d && !q) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim());
};

export function parseCsvTrack(text: string): ParsedTrack {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const d = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  const head = splitCsv(lines[0], d).map((h) => h.toLowerCase());
  const col = (...names: string[]) => head.findIndex((h) => names.some((n) => h === n || h.startsWith(n)));
  const iTs = col('timestamp', 'unix');
  const iUtc = col('utc', 'time', 'zeit', 'datetime', 'date');
  const iPos = col('position');
  const iLat = col('lat', 'latitude', 'breite');
  const iLon = col('lon', 'lng', 'longitude', 'länge', 'laenge');
  const iAlt = col('altitude', 'alt', 'höhe', 'hoehe', 'ele');
  const iSpd = col('speed', 'gs', 'groundspeed', 'geschwindigkeit');
  const iDir = col('direction', 'track', 'heading', 'kurs');
  const fr24 = iPos >= 0 && iTs >= 0; // Flightradar24: Höhe in ft, Geschwindigkeit in kt
  const altFt = fr24 || /ft|feet/.test(head[iAlt] ?? '');
  const spdKt = fr24 || /kt|knot/.test(head[iSpd] ?? '');
  const pts: GpsPoint[] = [];
  for (const l of lines.slice(1)) {
    const c = splitCsv(l, d);
    let lat: number, lon: number;
    if (iPos >= 0) [lat, lon] = c[iPos].split(',').map(Number);
    else {
      lat = Number(c[iLat]?.replace(',', '.'));
      lon = Number(c[iLon]?.replace(',', '.'));
    }
    const ts = iTs >= 0 && c[iTs] ? Number(c[iTs]) * (Number(c[iTs]) < 1e11 ? 1000 : 1) : Date.parse(c[iUtc] ?? '');
    const alt = num(c[iAlt]);
    const spd = num(c[iSpd]);
    pts.push({
      t: ts,
      lat,
      lon,
      alt: alt == null ? null : altFt ? alt * FT : alt,
      speed: spd == null ? null : spdKt ? spd / KT_PER_MS : spd,
      track: num(c[iDir]),
    });
  }
  if (iLat < 0 && iPos < 0) throw new Error('CSV ohne Positions-Spalten (lat/lon bzw. Position).');
  return finalize(fr24 ? 'Flightradar24-CSV' : 'CSV', pts);
}

export function parseTrackFile(text: string, name: string): ParsedTrack {
  const n = name.toLowerCase();
  if (n.endsWith('.gpx') || /<gpx[\s>]/.test(text)) return parseGpx(text);
  if (n.endsWith('.kml') || /<kml[\s>]/.test(text)) return parseKml(text);
  if (n.endsWith('.igc') || /^A\w{3}/.test(text) && /\nB\d{6}/.test(text)) return parseIgc(text);
  if (n.endsWith('.csv') || n.endsWith('.txt')) return parseCsvTrack(text);
  throw new Error('Unbekanntes Format – unterstützt: GPX, KML, IGC, CSV (Flightradar24).');
}

export interface TrackAnalysis {
  snap: DetectorSnapshot;
  entry: LogEntry;
  track: Track;
}

/** Track durch die Flugerkennung schicken und Eintrag erzeugen */
export function analyzeTrack(parsed: ParsedTrack, settings: AppSettings, reg: string, crew: Crew | undefined, fileName: string): TrackAnalysis {
  const d = new FlightDetector({ ...settings.detector, fieldElevationFt: (lat, lon) => nearestAirfield(lat, lon, 3000)?.field.elevFt ?? null });
  for (const p of parsed.points) d.push(p);
  d.finish();
  const snap = d.snapshot();
  const trackId = uid();
  const entry = buildEntry(snap, parsed.points, trackId, reg, settings, crew);
  entry.remarks = [`Importiert aus ${fileName} (${parsed.format})`, entry.remarks].filter(Boolean).join(' · ');
  return { snap, entry, track: { id: trackId, points: parsed.points, events: snap.events } };
}
