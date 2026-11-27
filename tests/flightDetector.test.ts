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

describe('Höhenbestätigung beim Start', () => {
  const KT = 1 / 1.943844;
  /** Rollen zum Lernen der Bodenhöhe, dann frei definierbarer Verlauf */
  const make = (profile: (i: number) => { kt: number; altM: number }, n: number, groundAlt = 120) => {
    const pts: GpsPoint[] = [];
    for (let i = 0; i < 60; i++) pts.push({ t: i * 1000, lat: 50 + i * 0.00002, lon: 8.5, alt: groundAlt, speed: 6 * KT, track: 0 });
    for (let i = 0; i < n; i++) {
      const { kt, altM } = profile(i);
      pts.push({ t: (60 + i) * 1000, lat: 50.002 + i * 0.0002, lon: 8.5, alt: altM, speed: kt * KT, track: 0 });
    }
    return pts;
  };

  it('Autofahrt mit 60 kt auf gleicher Höhe zählt nicht als Start', () => {
    const snap = run(make(() => ({ kt: 60, altM: 120 + (Math.random() - 0.5) * 6 }), 900));
    expect(snap.takeoffs).toBe(0);
    expect(snap.landings).toBe(0);
    expect(snap.rejectedTakeoffs).toBeGreaterThan(0);
  });

  it('Autofahrt bergauf (+25 m in 3 min) zählt nicht als Start', () => {
    const snap = run(make((i) => ({ kt: 55, altM: 120 + Math.min(25, i * 0.14) }), 400));
    expect(snap.takeoffs).toBe(0);
  });

  it('Startabbruch (bis 45 kt, dann bremsen) zählt weder als Start noch als Landung', () => {
    const snap = run(make((i) => ({ kt: i < 15 ? 10 + i * 2.5 : Math.max(0, 47 - (i - 15) * 4), altM: 120 }), 120));
    expect(snap.takeoffs).toBe(0);
    expect(snap.landings).toBe(0);
    expect(snap.rejectedTakeoffs).toBe(1);
  });

  it('echter Start wird bestätigt, Startzeit = Beginn des Startlaufs über der Schwelle', () => {
    // beschleunigen auf 50 kt in 15 s, dann Steigflug 600 fpm
    const pts = make((i) => ({ kt: Math.min(50, 10 + i * 2.7) + (i > 15 ? 10 : 0), altM: 120 + Math.max(0, i - 15) * (600 / 3.28084 / 60) }), 120);
    const d = new FlightDetector();
    let pendingSeen = false;
    for (const p of pts) {
      d.push(p);
      if (d.snapshot().takeoffPending) pendingSeen = true;
    }
    const snap = d.snapshot();
    expect(pendingSeen).toBe(true);
    expect(snap.takeoffs).toBe(1);
    const firstFast = pts.find((p) => (p.speed ?? 0) / KT > 35)!.t;
    // Startzeit liegt am Beginn des Startlaufs (nicht erst bei Erreichen von 100 ft)
    expect(snap.events[0].t).toBeGreaterThanOrEqual(firstFast);
    expect(snap.events[0].t - firstFast).toBeLessThanOrEqual(3000);
  });
});
