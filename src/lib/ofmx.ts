/**
 * Import von openflightmaps-Daten im OFMX-Format (https://gitlab.com/openflightmaps/ofmx/-/wikis).
 *
 * Genutzt werden:
 *  - Ahp  Flugplatz (Name, Lage, Höhe, Bemerkungen)
 *  - Aha  Kontakte (Website, Telefon, Funk …)
 *  - Rwy  Piste (Maße, Belag)
 *  - Rdn  Pistenrichtung: exakte Schwelle, rechtweisender Kurs, Aufsetzzonenhöhe und
 *         codeVfrPattern = Richtung der Platzrunde (L / R / E)
 *  - Dpn  VFR-Meldepunkte (VFR-RP / VFR-MRP) mit Zuordnung zum Flugplatz
 *  - Uni + Fqy  Funkstellen und Frequenzen mit Rufzeichen
 *
 * Die Geometrie der Platzrunde selbst ist in OFMX nicht enthalten – die App zeichnet sie
 * schematisch, aber mit Richtung und Pistenlage aus diesen Daten.
 *
 * Die Datei (oft > 50 MB) wird in Stücken dekodiert; aus dem Text werden nur die benötigten
 * Elemente per Muster herausgeschnitten, ein vollständiger XML-DOM wird nie aufgebaut.
 */
import { unzip } from 'fflate';

export interface OfmxRunwayDir {
  desig: string;
  lat: number | null;
  lon: number | null;
  trueBrg: number | null;
  tdzFt: number | null;
  pattern: 'L' | 'R' | 'E' | null;
  rmk?: string;
}
export interface OfmxRunway {
  desig: string;
  lenM: number | null;
  widM: number | null;
  surface: string;
  dirs: OfmxRunwayDir[];
}
export interface OfmxReportingPoint {
  id: string;
  name: string;
  mandatory: boolean;
  lat: number;
  lon: number;
}
export interface OfmxAirport {
  id: string;
  icao: string;
  name: string;
  type: string;
  lat: number;
  lon: number;
  elevFt: number | null;
  city: string;
  rmk: string;
  addresses: { type: string; value: string; rmk?: string }[];
  runways: OfmxRunway[];
  freqs: { service: string; callsign: string; mhz: string }[];
  rps: OfmxReportingPoint[];
}
export interface OfmxDiag {
  tags: Record<string, number>; // Anzahl je Feature-Element (z.B. Ahp, Rwy, Rdn, Ase …)
  runways: number;
  dirs: number;
  dirsLinked: number;
  dirsWithPattern: number;
  patternValues: Record<string, number>;
  samples: { label: string; text: string }[];
}
export interface OfmxData {
  meta: { regions: string; created: string; effective: string; expiration: string; importedAt: number; fileName: string; diag?: OfmxDiag };
  airports: Record<string, OfmxAirport>;
}

// ---------- kleine Text-Helfer (bewusst ohne DOM) ----------
const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s: string) => s.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (_, e: string) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e.toLowerCase()]));

/** Text des ersten <name>…</name> */
export function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([^<]*)</${name}>`));
  return m ? decode(m[1].trim()) : '';
}
/** Inhalt des ersten <name …>…</name> */
function inner(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return m ? m[1] : '';
}
/** Inhalt nach dem schließenden Tag (für Felder, die nach einer Uid folgen) */
function after(block: string, name: string): string {
  const i = block.indexOf(`</${name}>`);
  return i >= 0 ? block.slice(i + name.length + 3) : block;
}
/** Text-Schlüssel einer Uid: alle Textwerte hintereinander (unabhängig von mid-Attributen) */
const uidKey = (s: string) => (s.match(/>([^<]+)</g) ?? []).map((x) => x.slice(1, -1).trim()).filter(Boolean).join('|');

/** "51.18945833N" / "004.46039722E" → Dezimalgrad */
export function coord(s: string): number | null {
  const m = s.trim().match(/^(-?\d+(?:\.\d+)?)([NSEW])?$/i);
  if (!m) return null;
  const v = parseFloat(m[1]);
  return m[2] && /[SW]/i.test(m[2]) ? -v : v;
}
const num = (s: string) => (s === '' ? null : Number(s));
const toFt = (v: number | null, uom: string) => (v == null ? null : uom === 'M' ? Math.round(v * 3.28084) : v);
const toM = (v: number | null, uom: string) => (v == null ? null : uom === 'FT' ? Math.round(v * 0.3048) : v);

const FEATURE_RE = /<(Ahp|Aha|Rwy|Rdn|Dpn|Uni|Fqy)(?=[\s>])[^>]*>[\s\S]*?<\/\1>/g;
const FEATURE_START_RE = /<(Ahp|Aha|Rwy|Rdn|Dpn|Uni|Fqy)(?=[\s>])/g;

/** Zustand während des Parsens */
class Collector {
  airports: Record<string, OfmxAirport> = {};
  runways: Record<string, OfmxRunway & { ahp: string }> = {};
  dirs: { ahp: string; rwy: string; dir: OfmxRunwayDir }[] = [];
  addresses: { ahp: string; a: OfmxAirport['addresses'][number] }[] = [];
  units: Record<string, string> = {}; // UniUid-Schlüssel → Flugplatz-ID
  freqs: { uni: string; f: OfmxAirport['freqs'][number] }[] = [];
  rps: { ahp: string; p: OfmxReportingPoint }[] = [];
  header = '';
  tags: Record<string, number> = {};
  patternValues: Record<string, number> = {};
  samples: { label: string; text: string }[] = [];
  sample(label: string, text: string) {
    if (this.samples.filter((s) => s.label === label).length < 2) this.samples.push({ label, text: text.slice(0, 1500) });
  }
  /** Rohtext beobachten: Element-Statistik und Stichworte (z.B. Platzrunden) für die Diagnose */
  observe(chunk: string) {
    for (const m of chunk.matchAll(/<([A-Z][a-z]{2})[\s>]/g)) this.tags[m[1]] = (this.tags[m[1]] ?? 0) + 1;
    for (const m of chunk.matchAll(/circuit|vfrpattern|platzrunde|<Prc[\s>]|TRAFFIC/gi)) {
      if (this.samples.filter((s) => s.label.startsWith('Stichwort')).length >= 4) break;
      const i = m.index ?? 0;
      this.sample(`Stichwort „${m[0]}“`, chunk.slice(Math.max(0, i - 500), i + 700));
    }
  }

  feature(kind: string, b: string) {
    switch (kind) {
      case 'Ahp': {
        const id = tag(inner(b, 'AhpUid'), 'codeId');
        const rest = after(b, 'OrgUid');
        const lat = coord(tag(rest, 'geoLat'));
        const lon = coord(tag(rest, 'geoLong'));
        if (!id || lat == null || lon == null) return;
        this.airports[id] = {
          id,
          icao: tag(rest, 'codeIcao') || id,
          name: tag(rest, 'txtName'),
          type: tag(rest, 'codeType'),
          lat,
          lon,
          elevFt: toFt(num(tag(rest, 'valElev')), tag(rest, 'uomDistVer')),
          city: tag(rest, 'txtNameCitySer'),
          rmk: tag(rest, 'txtRmk'),
          addresses: [],
          runways: [],
          freqs: [],
          rps: [],
        };
        break;
      }
      case 'Aha': {
        const uid = inner(b, 'AhaUid');
        const ahp = tag(inner(uid, 'AhpUid'), 'codeId');
        const rest = after(b, 'AhaUid');
        const value = tag(rest, 'txtAddress');
        if (ahp && value) this.addresses.push({ ahp, a: { type: tag(after(uid, 'AhpUid'), 'codeType'), value, rmk: tag(rest, 'txtRmk') || undefined } });
        break;
      }
      case 'Rwy': {
        this.sample('Rwy (Piste)', b);
        const uid = inner(b, 'RwyUid');
        const ahp = tag(inner(uid, 'AhpUid'), 'codeId');
        const desig = tag(after(uid, 'AhpUid'), 'txtDesig');
        const rest = after(b, 'RwyUid');
        const uom = tag(rest, 'uomDimRwy');
        if (!ahp || !desig) return;
        this.runways[`${ahp}|${desig}`] = {
          ahp,
          desig,
          lenM: toM(num(tag(rest, 'valLen')), uom),
          widM: toM(num(tag(rest, 'valWid')), uom),
          surface: tag(rest, 'codeComposition') || tag(rest, 'codePreparation'),
          dirs: [],
        };
        break;
      }
      case 'Rdn': {
        this.sample('Rdn (Pistenrichtung)', b);
        const uid = inner(b, 'RdnUid');
        const rwyUid = inner(uid, 'RwyUid');
        const ahp = tag(inner(rwyUid, 'AhpUid'), 'codeId');
        const rwy = tag(after(rwyUid, 'AhpUid'), 'txtDesig');
        const desig = tag(after(uid, 'RwyUid'), 'txtDesig');
        const rest = after(b, 'RdnUid');
        const p = tag(rest, 'codeVfrPattern').toUpperCase();
        this.patternValues[p || '(leer)'] = (this.patternValues[p || '(leer)'] ?? 0) + 1;
        if (!ahp || !desig) return;
        this.dirs.push({
          ahp,
          rwy,
          dir: {
            desig,
            lat: coord(tag(rest, 'geoLat')),
            lon: coord(tag(rest, 'geoLong')),
            trueBrg: num(tag(rest, 'valTrueBrg')),
            tdzFt: toFt(num(tag(rest, 'valElevTdz')), tag(rest, 'uomElevTdz')),
            pattern: p === 'L' || p === 'R' || p === 'E' ? p : null,
            rmk: tag(rest, 'txtRmk') || undefined,
          },
        });
        break;
      }
      case 'Dpn': {
        const type = tag(after(b, 'DpnUid'), 'codeType');
        if (type !== 'VFR-RP' && type !== 'VFR-MRP') return;
        const uid = inner(b, 'DpnUid');
        const ahp = tag(inner(b, 'AhpUidAssoc'), 'codeId');
        const lat = coord(tag(uid, 'geoLat'));
        const lon = coord(tag(uid, 'geoLong'));
        if (!ahp || lat == null || lon == null) return;
        const id = tag(uid, 'codeId');
        this.rps.push({ ahp, p: { id, name: tag(after(b, 'DpnUid'), 'txtName') || id, mandatory: type === 'VFR-MRP', lat, lon } });
        break;
      }
      case 'Uni': {
        const ahp = tag(inner(b, 'AhpUid'), 'codeId');
        if (ahp) this.units[uidKey(inner(b, 'UniUid'))] = ahp;
        break;
      }
      case 'Fqy': {
        const fuid = inner(b, 'FqyUid');
        const suid = inner(fuid, 'SerUid');
        const uni = uidKey(inner(suid, 'UniUid'));
        const mhz = tag(after(fuid, 'SerUid'), 'valFreqTrans');
        if (!mhz) return;
        this.freqs.push({ uni, f: { service: tag(after(suid, 'UniUid'), 'codeType'), callsign: tag(b, 'txtCallSign') || tag(inner(suid, 'UniUid'), 'txtName'), mhz } });
        break;
      }
    }
  }

  finish(fileName: string): OfmxData {
    for (const r of Object.values(this.runways)) {
      const { ahp, ...rwy } = r;
      this.airports[ahp]?.runways.push(rwy);
    }
    let dirsLinked = 0;
    for (const { ahp, rwy, dir } of this.dirs) {
      const r = this.runways[`${ahp}|${rwy}`];
      if (r) {
        r.dirs.push(dir);
        dirsLinked++;
      }
    }
    for (const { ahp, a } of this.addresses) this.airports[ahp]?.addresses.push(a);
    for (const { ahp, p } of this.rps) this.airports[ahp]?.rps.push(p);
    for (const { uni, f } of this.freqs) {
      const ap = this.airports[this.units[uni]];
      if (ap && !ap.freqs.some((x) => x.mhz === f.mhz && x.callsign === f.callsign)) ap.freqs.push(f);
    }
    const attr = (n: string) => this.header.match(new RegExp(`${n}="([^"]*)"`))?.[1] ?? '';
    return {
      meta: {
        regions: attr('regions'),
        created: attr('created'),
        effective: attr('effective'),
        expiration: attr('expiration'),
        importedAt: Date.now(),
        fileName,
        diag: {
          tags: this.tags,
          runways: Object.keys(this.runways).length,
          dirs: this.dirs.length,
          dirsLinked,
          dirsWithPattern: this.dirs.filter((d) => d.dir.pattern).length,
          patternValues: this.patternValues,
          samples: [{ label: 'Kopfzeile', text: this.header }, ...this.samples],
        },
      },
      airports: this.airports,
    };
  }
}

/** Parst OFMX-Text, der in beliebig geschnittenen Stücken ankommt */
export function createOfmxParser() {
  const c = new Collector();
  let buf = '';
  return {
    push(chunk: string) {
      c.observe(chunk);
      buf += chunk;
      if (!c.header) {
        const h = buf.match(/<OFMX-Snapshot[^>]*>/);
        if (h) c.header = h[0];
      }
      FEATURE_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      let end = 0;
      while ((m = FEATURE_RE.exec(buf))) {
        c.feature(m[1], m[0]);
        end = FEATURE_RE.lastIndex;
      }
      // Rest behalten: ab dem ersten noch nicht abgeschlossenen interessanten Element
      FEATURE_START_RE.lastIndex = end;
      const open = FEATURE_START_RE.exec(buf);
      buf = open ? buf.slice(open.index) : buf.slice(Math.max(end, buf.length - 64));
    },
    finish: (fileName: string) => c.finish(fileName),
  };
}

export function parseOfmxText(text: string, fileName = 'ofmx'): OfmxData {
  const p = createOfmxParser();
  // auch hier in Stücken, um das Verhalten beim Streaming zu testen
  const N = 1 << 20;
  for (let i = 0; i < text.length; i += N) p.push(text.slice(i, i + N));
  return p.finish(fileName);
}

/** Datei (.ofmx / .xml oder .zip mit OFMX darin) einlesen */
export async function parseOfmxFile(file: File, onProgress: (frac: number) => void): Promise<OfmxData> {
  let bytes = new Uint8Array(await file.arrayBuffer());
  let name = file.name;
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    // ZIP: größte .ofmx/.xml-Datei nehmen
    const files = await new Promise<Record<string, Uint8Array>>((res, rej) =>
      unzip(bytes, { filter: (f) => /\.(ofmx|xml)$/i.test(f.name) && !/__MACOSX/.test(f.name) }, (err, out) => (err ? rej(err) : res(out)))
    );
    const best = Object.entries(files).sort((a, b) => b[1].length - a[1].length)[0];
    if (!best) throw new Error('Im ZIP wurde keine .ofmx- oder .xml-Datei gefunden.');
    [name, bytes] = best;
  }
  const dec = new TextDecoder('utf-8');
  const p = createOfmxParser();
  const N = 4 << 20;
  for (let i = 0; i < bytes.length; i += N) {
    p.push(dec.decode(bytes.subarray(i, i + N), { stream: i + N < bytes.length }));
    onProgress(Math.min(1, (i + N) / bytes.length));
    await new Promise((r) => setTimeout(r, 0)); // Oberfläche nicht einfrieren
  }
  const data = p.finish(name.split('/').pop() ?? name);
  if (!Object.keys(data.airports).length) throw new Error('Keine Flugplätze gefunden – ist das eine OFMX-Datei von openflightmaps?');
  return data;
}
