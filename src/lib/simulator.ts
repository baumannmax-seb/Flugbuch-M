// GPS-Simulator: erzeugt eine realistische Platzrunden-Session (Rollen, Start,
// Platzrunde, Touch-and-Go, Platzrunde, Full-Stop, Abstellen) zum Testen ohne Flugzeug.
import { destination, FT_PER_M, KT_PER_MS } from './geo';
import type { GpsPoint } from './flightDetector';

interface Seg {
  dur: number; // s
  spd: number; // Zielgeschwindigkeit kt am Segmentende (linear)
  vs?: number; // fpm
  turn?: number; // °/s (negativ = links)
  ground?: boolean; // Höhe = Platzhöhe
  flare?: boolean; // Sinkrate so wählen, dass am Segmentende aufgesetzt wird
}

const circuit = (turnDir: number): Seg[] => [
  { dur: 50, spd: 65, vs: 600 }, // Steigflug Abflug
  { dur: 30, spd: 65, vs: 400, turn: 3 * turnDir }, // Querabflug
  { dur: 25, spd: 70, vs: 200 },
  { dur: 30, spd: 75, turn: 3 * turnDir }, // Gegenanflug
  { dur: 70, spd: 75 },
  { dur: 30, spd: 65, vs: -400, turn: 3 * turnDir }, // Queranflug
  { dur: 20, spd: 60, vs: -450 },
  { dur: 30, spd: 55, vs: -450, turn: 3 * turnDir }, // Endanflug
  { dur: 55, spd: 48, flare: true },
];

export function buildScenario(lat: number, lon: number, elevFt: number, rwyHdg = 250, start = Date.now()): GpsPoint[] {
  const segs: Seg[] = [
    { dur: 20, spd: 0, ground: true },
    { dur: 60, spd: 10, ground: true }, // Rollen zum Rollhalt
    { dur: 20, spd: 0, ground: true }, // Checks
    { dur: 15, spd: 50, ground: true }, // Startlauf
    ...circuit(-1),
    { dur: 6, spd: 34, ground: true }, // Aufsetzen, ausrollen (GS bleibt > 25 kt!)
    { dur: 10, spd: 52, ground: true }, // Vollgas: Touch-and-Go
    ...circuit(-1),
    { dur: 25, spd: 10, ground: true }, // Ausrollen
    { dur: 60, spd: 8, ground: true }, // Rollen zum Abstellplatz
    { dur: 10, spd: 0, ground: true }, // Anhalten
    { dur: 150, spd: 0, ground: true }, // Abstellen
  ];

  const pts: GpsPoint[] = [];
  // Startpunkt etwas hinter der Schwelle
  let [la, lo] = destination(lat, lon, (rwyHdg + 180) % 360, 300);
  let hdg = rwyHdg;
  let spd = 0;
  let altFt = elevFt;
  let t = start;
  for (const sg of segs) {
    const v0 = spd;
    for (let i = 0; i < sg.dur; i++) {
      spd = v0 + ((sg.spd - v0) * (i + 1)) / sg.dur;
      if (sg.turn) hdg = (hdg + sg.turn + 360) % 360;
      if (sg.ground) altFt = elevFt;
      else if (sg.flare) altFt = Math.max(elevFt, altFt - (altFt - elevFt) / (sg.dur - i));
      else altFt = Math.max(elevFt, altFt + (sg.vs ?? 0) / 60);
      const ms = spd / KT_PER_MS;
      [la, lo] = destination(la, lo, hdg, ms);
      t += 1000;
      // etwas GPS-Rauschen
      const noise = (Math.random() - 0.5) * 0.6;
      pts.push({
        t,
        lat: la,
        lon: lo,
        alt: altFt / FT_PER_M + noise,
        speed: Math.max(0, ms + noise * 0.3),
        track: spd > 1 ? hdg : null,
        acc: 5,
      });
    }
  }
  return pts;
}
