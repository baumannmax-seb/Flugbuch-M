/**
 * CSV-Import aus anderen Flugbüchern (b4takeoff, mein-flugbuch, UL-Flugbuch, Excel, eigener Export …).
 *
 * Da jedes Programm andere Spalten benutzt, wird:
 *  1. Trennzeichen (; , Tab |) und Zeichensatz (UTF-8 / Windows-1252) erkannt,
 *  2. die Kopfzeile gesucht (Zeile mit den meisten bekannten Spaltennamen),
 *  3. jede Spalte per Synonymliste einem Flugbuchfeld zugeordnet.
 * Die Zuordnung kann der Nutzer vor dem Import in der Oberfläche korrigieren.
 */
import { uid, type LogEntry } from './db';

export type FieldKey =
  | 'date'
  | 'aircraftReg'
  | 'aircraftType'
  | 'from'
  | 'to'
  | 'offBlock'
  | 'takeoff'
  | 'landing'
  | 'onBlock'
  | 'flightTime'
  | 'blockTime'
  | 'landings'
  | 'landingsNight'
  | 'touchAndGos'
  | 'pic'
  | 'instructor'
  | 'dualTime'
  | 'role'
  | 'remarks';

export const FIELD_LABELS: Record<FieldKey, string> = {
  date: 'Datum *',
  aircraftReg: 'Kennzeichen',
  aircraftType: 'Muster',
  from: 'Von (Startplatz)',
  to: 'Nach (Zielplatz)',
  offBlock: 'Off-Block-Zeit',
  takeoff: 'Startzeit',
  landing: 'Landezeit',
  onBlock: 'On-Block-Zeit',
  flightTime: 'Flugzeit (Dauer)',
  blockTime: 'Blockzeit (Dauer)',
  landings: 'Landungen (Tag / gesamt)',
  landingsNight: 'Landungen Nacht',
  touchAndGos: 'Touch-and-Go',
  pic: 'PIC / Pilot',
  instructor: 'Fluglehrer',
  dualTime: 'Schulungszeit (Dual)',
  role: 'Funktion',
  remarks: 'Bemerkungen',
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '');

// Reihenfolge wichtig: spezifische Begriffe zuerst (z.B. "landezeit" vor "landungen")
const SYNONYMS: [FieldKey, string[]][] = [
  ['offBlock', ['offblock', 'blockoff', 'abblock', 'offblockzeit', 'blockaus', 'out', 'outtime', 'startblock']],
  ['onBlock', ['onblock', 'blockon', 'anblock', 'onblockzeit', 'blockan', 'in', 'intime', 'endblock']],
  ['takeoff', ['startzeit', 'takeoff', 'takeofftime', 'takeoffzeit', 'departuretime', 'deptime', 'abflugzeit', 'zeitstart', 'startuhrzeit', 'offtime', 'tkof']],
  ['landing', ['landezeit', 'landingtime', 'arrivaltime', 'arrtime', 'ankunftszeit', 'zeitlandung', 'landeuhrzeit', 'ontime', 'ldgtime']],
  ['dualTime', ['dual', 'dualtime', 'schulung', 'schulungszeit', 'doppelsteuer', 'ausbildung', 'zeitschulung']],
  ['flightTime', ['flugzeit', 'flighttime', 'airtime', 'totaltime', 'totalflighttime', 'gesamtflugzeit', 'gesamtzeit', 'dauer', 'duration', 'flugdauer', 'total', 'zeit', 'time', 'flightduration', 'totaltimeofflight']],
  ['blockTime', ['blockzeit', 'blocktime', 'blockdauer']],
  ['landingsNight', ['landungennacht', 'nachtlandungen', 'landingsnight', 'nightlandings', 'ldgnight']],
  ['touchAndGos', ['touchandgo', 'touchandgos', 'tg', 'touchgo', 'aufsetzer', 'durchstarts']],
  ['landings', ['landungen', 'landings', 'landungentag', 'tageslandungen', 'landingsday', 'daylandings', 'ldg', 'ldgs', 'anzahllandungen', 'landung', 'landingcount', 'starts', 'startslandungen']],
  ['date', ['datum', 'date', 'flugdatum', 'tag', 'day', 'flightdate']],
  ['aircraftReg', ['kennzeichen', 'registration', 'reg', 'registrierung', 'lfz', 'luftfahrzeug', 'lfzkennzeichen', 'kennung', 'aircraft', 'aircraftid', 'aircraftregistration', 'callsign', 'tail']],
  ['aircraftType', ['muster', 'typ', 'type', 'aircrafttype', 'model', 'modell', 'flugzeugtyp', 'lfzmuster', 'lfztyp', 'luftfahrzeugmuster', 'make', 'makemodel']],
  ['from', ['von', 'from', 'startort', 'startflugplatz', 'abflugort', 'departure', 'dep', 'origin', 'abflug', 'startplatz', 'startflughafen', 'departureplace', 'start']],
  ['to', ['nach', 'to', 'zielort', 'zielflugplatz', 'landeort', 'destination', 'dest', 'arrival', 'arr', 'ziel', 'landeplatz', 'zielflughafen', 'arrivalplace']],
  ['instructor', ['fluglehrer', 'instructor', 'fi', 'lehrer', 'fluglehrername', 'instructorname']],
  ['pic', ['pic', 'pilot', 'pilotname', 'namepic', 'kommandant', 'pilotincommand', 'verantwortlicherpilot', 'pf', 'namedespic']],
  ['role', ['funktion', 'function', 'role', 'rolle', 'pilotfunction']],
  ['remarks', ['bemerkungen', 'bemerkung', 'remarks', 'notes', 'notiz', 'notizen', 'kommentar', 'comment', 'comments', 'info']],
];

export interface ParsedCsv {
  delimiter: string;
  headerRow: number;
  headers: string[];
  rows: string[][];
  encoding: string;
}

export function decodeFile(buf: ArrayBuffer): { text: string; encoding: string } {
  const utf8 = new TextDecoder('utf-8').decode(buf);
  if (!utf8.includes('�')) return { text: utf8.replace(/^﻿/, ''), encoding: 'UTF-8' };
  return { text: new TextDecoder('windows-1252').decode(buf), encoding: 'Windows-1252' };
}

/** CSV mit Anführungszeichen, Zeilenumbrüchen in Feldern und beliebigem Trennzeichen */
export function parseRows(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += c;
    } else if (c === '"' && cell === '') q = true;
    else if (c === delim) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((x) => x.trim() !== '')) rows.push(row.map((x) => x.trim()));
      row = [];
      cell = '';
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row.map((x) => x.trim()));
  return rows;
}

function guessField(h: string): FieldKey | null {
  const n = norm(h);
  if (!n) return null;
  for (const [k, syns] of SYNONYMS) if (syns.includes(n)) return k;
  // Teiltreffer (z.B. "Flugzeit (h:mm)", "Datum des Fluges")
  for (const [k, syns] of SYNONYMS) if (syns.some((s) => s.length >= 4 && n.startsWith(s))) return k;
  for (const [k, syns] of SYNONYMS) if (syns.some((s) => s.length >= 5 && n.includes(s))) return k;
  return null;
}

export function parseCsv(text: string, encoding = 'UTF-8'): ParsedCsv {
  const sample = text.split(/\r?\n/).slice(0, 20).join('\n');
  const delims = [';', ',', '\t', '|'];
  const delimiter = delims
    .map((d) => {
      const counts = sample.split('\n').filter(Boolean).map((l) => l.split(d).length - 1);
      const max = Math.max(0, ...counts);
      return { d, score: max > 0 ? counts.filter((c) => c === max).length * max : 0 };
    })
    .sort((a, b) => b.score - a.score)[0].d;
  const all = parseRows(text, delimiter);
  // Kopfzeile = Zeile (unter den ersten 15) mit den meisten erkannten Spalten
  let headerRow = 0;
  let best = -1;
  all.slice(0, 15).forEach((r, i) => {
    const score = r.filter((c) => guessField(c)).length;
    if (score > best) {
      best = score;
      headerRow = i;
    }
  });
  return { delimiter, headerRow, headers: all[headerRow] ?? [], rows: all.slice(headerRow + 1), encoding };
}

export type Mapping = Partial<Record<FieldKey, number>>; // Feld → Spaltenindex

export function autoMap(headers: string[], rows: string[][] = []): Mapping {
  const m: Mapping = {};
  const sample = (i: number) => rows.slice(0, 30).map((r) => r[i] ?? '').filter(Boolean);
  const looksClock = (i: number) => {
    const v = sample(i);
    return v.length > 0 && v.filter((x) => /^\d{1,2}:\d{2}/.test(x) && parseClock(x) != null).length >= v.length * 0.8;
  };
  headers.forEach((h, i) => {
    let k = guessField(h);
    // Mehrdeutige Spaltennamen anhand des Inhalts klären: "Start"/"Landung" mit Uhrzeiten = Zeiten
    if (k === 'from' && looksClock(i)) k = 'takeoff';
    if (k === 'to' && looksClock(i)) k = 'landing';
    if (k === 'landings' && looksClock(i)) k = 'landing';
    if (k && m[k] === undefined) m[k] = i;
  });
  return m;
}

/** Dauer-Einheit aus Spaltenname ableiten, z.B. "Flugzeit (min)" */
const unitFromHeader = (h: string | undefined, fallback: 'auto' | 'h' | 'min') => (h && /min/i.test(h) && !/h:?mm/i.test(h) ? 'min' : fallback);

// ---------- Werte parsen ----------

/** Datum: 31.12.2024, 31.12.24, 2024-12-31, 31/12/2024, 12/31/2024 (US, wenn Tag > 12 an 2. Stelle) */
export function parseDate(s: string): Date | null {
  s = s.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], 12);
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (m) {
    let [d, mo] = [+m[1], +m[2]];
    let y = +m[3];
    if (y < 100) y += y < 70 ? 2000 : 1900;
    if (mo > 12 && d <= 12) [d, mo] = [mo, d]; // US-Format
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return new Date(y, mo - 1, d, 12);
  }
  // Excel-Seriennummer
  if (/^\d{5}$/.test(s)) {
    const d = new Date(Date.UTC(1899, 11, 30) + +s * 86400000);
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12);
  }
  return null;
}

/** Uhrzeit: 14:05, 14:05:30, 1405, 14.05, 2024-05-01T14:05 → Minuten seit Mitternacht */
export function parseClock(s: string): number | null {
  s = s.trim();
  if (!s) return null;
  const iso = s.match(/T(\d{1,2}):(\d{2})/) ?? s.match(/\s(\d{1,2}):(\d{2})/);
  if (iso) return +iso[1] * 60 + +iso[2];
  let m = s.match(/^(\d{1,2})[:.h](\d{2})(?::\d{2})?\s*(UTC|Z|LT)?$/i);
  if (m && +m[1] < 24 && +m[2] < 60) return +m[1] * 60 + +m[2];
  m = s.match(/^(\d{2})(\d{2})$/);
  if (m && +m[1] < 24 && +m[2] < 60) return +m[1] * 60 + +m[2];
  return null;
}

/** Dauer: 1:23 (h:mm), 1,5 / 1.5 (Stunden dezimal), "83 min", oder Minuten wenn unit='min' */
export function parseDuration(s: string, unit: 'auto' | 'h' | 'min' = 'auto'): number | null {
  s = s.trim().toLowerCase();
  if (!s) return null;
  let m = s.match(/^(\d+):(\d{1,2})(?::\d{2})?$/);
  if (m) return +m[1] * 60 + +m[2];
  m = s.match(/^(\d+)\s*h\s*(\d+)\s*m/);
  if (m) return +m[1] * 60 + +m[2];
  m = s.match(/^(\d+)\s*min/);
  if (m) return +m[1];
  const n = Number(s.replace(',', '.'));
  if (!isFinite(n)) return null;
  if (unit === 'min') return Math.round(n);
  if (unit === 'h') return Math.round(n * 60);
  return Math.round(n * 60); // auto: Zahl ohne Doppelpunkt = Dezimalstunden
}

const int = (s: string | undefined) => {
  const n = parseInt((s ?? '').replace(/[^\d-]/g, ''), 10);
  return isFinite(n) ? n : 0;
};

function parseRole(s: string, hasInstructor: boolean): LogEntry['role'] {
  const n = norm(s);
  if (/dual|schul|ausbild|stud/.test(n)) return 'DUAL';
  if (/^fi|lehrer|instructor|^cri|^fe$/.test(n)) return 'FI';
  if (/pax|passag|mitflug/.test(n)) return 'PAX';
  return hasInstructor ? 'DUAL' : 'PIC';
}

export interface ImportResult {
  entries: LogEntry[];
  skipped: { row: number; reason: string }[];
}

export function buildEntries(p: ParsedCsv, map: Mapping, opts: { durationUnit: 'auto' | 'h' | 'min'; defaultPic: string }): ImportResult {
  const entries: LogEntry[] = [];
  const skipped: ImportResult['skipped'] = [];
  const get = (r: string[], k: FieldKey) => (map[k] !== undefined ? r[map[k]!] ?? '' : '');

  p.rows.forEach((r, i) => {
    const rowNo = p.headerRow + 2 + i;
    const date = parseDate(get(r, 'date'));
    if (!date) {
      // Summenzeilen / leere Zeilen still überspringen
      if (r.filter(Boolean).length > 2) skipped.push({ row: rowNo, reason: `kein gültiges Datum („${get(r, 'date')}“)` });
      return;
    }
    const at = (k: FieldKey) => {
      const min = parseClock(get(r, k));
      if (min == null) return null;
      const d = new Date(date);
      d.setHours(Math.floor(min / 60), min % 60, 0, 0);
      return d.getTime();
    };
    const offBlock = at('offBlock');
    const takeoff = at('takeoff');
    let landing = at('landing');
    let onBlock = at('onBlock');
    // über Mitternacht
    if (takeoff && landing && landing < takeoff) landing += 86400000;
    if (offBlock && onBlock && onBlock < offBlock) onBlock += 86400000;

    const unitOf = (k: FieldKey) => unitFromHeader(map[k] !== undefined ? p.headers[map[k]!] : undefined, opts.durationUnit);
    let flightMin = parseDuration(get(r, 'flightTime'), unitOf('flightTime'));
    if (flightMin == null && takeoff && landing) flightMin = Math.round((landing - takeoff) / 60000);
    let blockMin = parseDuration(get(r, 'blockTime'), unitOf('blockTime'));
    if (blockMin == null && offBlock && onBlock) blockMin = Math.round((onBlock - offBlock) / 60000);
    if (flightMin == null && blockMin != null) flightMin = blockMin;
    if (blockMin == null && flightMin != null) blockMin = flightMin;
    if (flightMin == null) {
      skipped.push({ row: rowNo, reason: 'keine Flugzeit und keine Start-/Landezeit' });
      return;
    }
    const instructor = get(r, 'instructor');
    const dual = parseDuration(get(r, 'dualTime'), unitOf('dualTime'));
    const roleRaw = get(r, 'role');
    const role = roleRaw ? parseRole(roleRaw, !!instructor) : instructor || (dual && dual > 0) ? 'DUAL' : 'PIC';
    const landings = int(get(r, 'landings')) + int(get(r, 'landingsNight'));

    entries.push({
      id: uid(),
      date: date.getTime(),
      aircraftReg: get(r, 'aircraftReg').toUpperCase(),
      aircraftType: get(r, 'aircraftType'),
      from: get(r, 'from').toUpperCase(),
      to: get(r, 'to').toUpperCase(),
      offBlock,
      takeoff,
      landing,
      onBlock,
      flightMin,
      blockMin: blockMin ?? flightMin,
      landings: map.landings !== undefined || map.landingsNight !== undefined ? landings : 1,
      touchAndGos: int(get(r, 'touchAndGos')),
      pic: get(r, 'pic') || (role === 'DUAL' ? instructor : opts.defaultPic),
      role,
      instructor: instructor || undefined,
      remarks: get(r, 'remarks'),
      createdAt: Date.now(),
      source: 'manual',
    });
  });
  return { entries, skipped };
}

/** Schlüssel zum Erkennen doppelter Flüge */
export const dupKey = (e: LogEntry) => {
  const d = new Date(e.date);
  return [d.getFullYear(), d.getMonth(), d.getDate(), e.aircraftReg, e.from, e.to, e.flightMin, e.takeoff ? new Date(e.takeoff).getHours() * 60 + new Date(e.takeoff).getMinutes() : ''].join('|');
};
