import { describe, expect, it } from 'vitest';
import { FlightDetector, type GpsPoint } from '../src/lib/flightDetector';
import { buildScenario } from '../src/lib/simulator';

const run = (pts: GpsPoint[], opts = {}) => {
  const d = new FlightDetector(opts);
  for (const p of pts) d.push(p);
  return d.snapshot();
};

describe('FlightDetector', () => {
  it('erkennt Start, Touch-and-Go, Full-Stop und Flugende in der Simulation', () => {
    const snap = run(buildScenario(50.0, 8.5, 400, 250, 0));
    expect(snap.takeoffs).toBe(2);
    expect(snap.landings).toBe(2);
    expect(snap.touchAndGos).toBe(1);
    expect(snap.fullStops).toBe(1);
    expect(snap.finished).toBe(true);
    expect(snap.firstMoveT).not.toBeNull();
    // Flugzeit plausibel: zwei Platzrunden à ~6 min
    expect(snap.airborneMs / 60000).toBeGreaterThan(9);
    expect(snap.airborneMs / 60000).toBeLessThan(15);
  });

  it('erkennt Touch-and-Go auch ohne Höhendaten, wenn GS unter Landeschwelle fällt', () => {
    const pts = buildScenario(50.0, 8.5, 400, 250, 0).map((p) => ({ ...p, alt: null }));
    // ohne Höhe greift nur die Speed-Schwelle: Szenario-T&G (34 kt) wird dann nicht erkannt
    const snap = run(pts, { landingKt: 38 });
    expect(snap.touchAndGos).toBe(1);
    expect(snap.fullStops).toBe(1);
  });

  it('löst beim Rollen keinen Start aus', () => {
    const pts: GpsPoint[] = [];
    for (let i = 0; i < 300; i++) pts.push({ t: i * 1000, lat: 50 + i * 0.00005, lon: 8.5, alt: 120, speed: 7, track: 0 });
    const snap = run(pts);
    expect(snap.takeoffs).toBe(0);
    expect(snap.phase).toBe('GROUND');
  });

  it('ignoriert kurze Speed-Spitzen (GPS-Ausreißer)', () => {
    const pts: GpsPoint[] = [];
    for (let i = 0; i < 60; i++) pts.push({ t: i * 1000, lat: 50, lon: 8.5, alt: 120, speed: i === 30 ? 40 : 2, track: 0 });
    expect(run(pts).takeoffs).toBe(0);
  });
});
