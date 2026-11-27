import { describe, expect, it } from 'vitest';
import { buildScenario } from '../src/lib/simulator';
import { analyzeTrack, parseTrackFile } from '../src/lib/trackImport';
import { DEFAULT_APP_SETTINGS } from '../src/lib/settings';

// Testdaten: simulierte Platzrunde mit Touch-and-Go, in verschiedene Formate geschrieben
const start = Date.UTC(2026, 5, 1, 9, 0, 0);
const pts = buildScenario(49.96, 8.64, 384, 250, start).filter((_, i) => i % 2 === 0); // 2 s Abstand
const iso = (t: number) => new Date(t).toISOString();

const gpx = `<?xml version="1.0"?><gpx version="1.1"><trk><trkseg>${pts
  .map((p) => `<trkpt lat="${p.lat}" lon="${p.lon}"><ele>${p.alt}</ele><time>${iso(p.t)}</time></trkpt>`)
  .join('')}</trkseg></trk></gpx>`;

const kmlGx = `<kml xmlns:gx="http://www.google.com/kml/ext/2.2"><Document><Placemark><gx:Track>${pts.map((p) => `<when>${iso(p.t)}</when>`).join('')}${pts
  .map((p) => `<gx:coord>${p.lon} ${p.lat} ${p.alt}</gx:coord>`)
  .join('')}</gx:Track></Placemark></Document></kml>`;

const kmlFr24 = `<kml><Document><Folder><name>Route</name>${pts
  .map((p) => `<Placemark><name>x</name><description><![CDATA[<b>Speed:</b> ${Math.round((p.speed ?? 0) * 1.943844)} kt]]></description><TimeStamp><when>${iso(p.t)}</when></TimeStamp><Point><coordinates>${p.lon},${p.lat},${p.alt}</coordinates></Point></Placemark>`)
  .join('')}</Folder></Document></kml>`;

const fr24csv = `Timestamp,UTC,Callsign,Position,Altitude,Speed,Direction\n${pts
  .map((p) => `${p.t / 1000},${iso(p.t)},DMCJD,"${p.lat},${p.lon}",${Math.round(((p.alt ?? 0) - 117) * 3.28084)},${Math.round((p.speed ?? 0) * 1.943844)},250`)
  .join('\n')}`;

const ddmm = (v: number, degDigits: number) => {
  const a = Math.abs(v);
  const deg = Math.floor(a);
  const min = Math.round((a - deg) * 60 * 1000);
  return String(deg).padStart(degDigits, '0') + String(min).padStart(5, '0');
};
const igc = `AXXX001\nHFDTE010626\n${pts
  .map((p) => {
    const d = new Date(p.t);
    const hhmmss = [d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()].map((x) => String(x).padStart(2, '0')).join('');
    const alt = String(Math.round(p.alt ?? 0)).padStart(5, '0');
    return `B${hhmmss}${ddmm(p.lat, 2)}N${ddmm(p.lon, 3)}EA${alt}${alt}`;
  })
  .join('\n')}`;

describe('GPS-Track-Import', () => {
  for (const [name, text, fmt] of [
    ['flug.gpx', gpx, 'GPX'],
    ['flug.kml', kmlGx, 'KML'],
    ['fr24.kml', kmlFr24, 'KML'],
    ['fr24.csv', fr24csv, 'Flightradar24-CSV'],
    ['logger.igc', igc, 'IGC'],
  ] as const) {
    it(`${name}: erkennt Format, Start, Touch-and-Go und Landung`, () => {
      const p = parseTrackFile(text, name);
      expect(p.format).toBe(fmt);
      expect(p.points.length).toBeGreaterThan(100);
      const a = analyzeTrack(p, DEFAULT_APP_SETTINGS, 'D-MCJD', undefined, name);
      expect(a.snap.takeoffs).toBe(2);
      expect(a.snap.landings).toBe(2);
      expect(a.entry.touchAndGos).toBe(1);
      expect(a.entry.flightMin).toBeGreaterThan(9);
      expect(a.entry.offBlock).not.toBeNull();
      expect(new Date(a.entry.date).getUTCDate()).toBe(1);
    });
  }
});
