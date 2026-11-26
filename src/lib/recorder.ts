/**
 * Recorder: verbindet GPS-Quelle (echtes GPS oder Simulator) mit dem FlightDetector,
 * speichert den Track laufend (Absturz-/Reload-sicher) und legt bei Flugende
 * automatisch einen Flugbucheintrag an.
 */
import { FlightDetector, type DetectorSnapshot, type GpsPoint } from './flightDetector';
import { db, uid, type LogEntry } from './db';
import { nearestAirfield } from './airfields';
import type { AppSettings } from './settings';
import { buildScenario } from './simulator';

export interface RecorderState {
  active: boolean;
  source: 'gps' | 'sim' | null;
  startedAt: number | null;
  last: GpsPoint | null;
  points: GpsPoint[];
  snap: DetectorSnapshot | null;
  error: string | null;
  savedEntryId: string | null;
}

type Listener = (s: RecorderState) => void;

interface PersistedSession {
  id: string;
  source: 'gps' | 'sim';
  startedAt: number;
  points: GpsPoint[];
  aircraftReg: string;
}

const fieldElev = (lat: number, lon: number) => nearestAirfield(lat, lon, 3000)?.field.elevFt ?? null;

export class Recorder {
  private listeners = new Set<Listener>();
  private detector: FlightDetector | null = null;
  private watchId: number | null = null;
  private simTimer: number | null = null;
  private sessionId = '';
  private lastPersist = 0;
  private stopping = false;
  aircraftReg = '';
  state: RecorderState = { active: false, source: null, startedAt: null, last: null, points: [], snap: null, error: null, savedEntryId: null };

  constructor(private getSettings: () => AppSettings, private onEntrySaved: (e: LogEntry) => void) {}

  subscribe(l: Listener) {
    this.listeners.add(l);
    l(this.state);
    return () => this.listeners.delete(l);
  }

  private emit(patch: Partial<RecorderState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l(this.state));
  }

  private newDetector() {
    const d = new FlightDetector({ ...this.getSettings().detector, fieldElevationFt: fieldElev });
    return d;
  }

  /** Nach Reload: laufende Aufzeichnung wiederherstellen */
  async restore() {
    const s = await db.get<PersistedSession>('activeSession');
    if (!s || s.source !== 'gps') {
      if (s) await db.del('activeSession');
      return;
    }
    this.sessionId = s.id;
    this.aircraftReg = s.aircraftReg;
    this.detector = this.newDetector();
    for (const p of s.points) this.detector.push(p);
    this.emit({ active: true, source: 'gps', startedAt: s.startedAt, points: s.points, last: s.points[s.points.length - 1] ?? null, snap: this.detector.snapshot(), savedEntryId: null });
    this.startGps();
  }

  start(source: 'gps' | 'sim', simOpts?: { lat: number; lon: number; elevFt: number; speedup: number }) {
    if (this.state.active) return;
    this.sessionId = uid();
    this.detector = this.newDetector();
    this.aircraftReg = this.aircraftReg || this.getSettings().defaultAircraft;
    this.emit({ active: true, source, startedAt: Date.now(), points: [], last: null, snap: this.detector.snapshot(), error: null, savedEntryId: null });
    if (source === 'gps') this.startGps();
    else this.startSim(simOpts!);
  }

  private startGps() {
    if (!('geolocation' in navigator)) {
      this.emit({ error: 'Kein GPS verfügbar' });
      return;
    }
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const c = pos.coords;
        this.onPoint({
          t: pos.timestamp,
          lat: c.latitude,
          lon: c.longitude,
          alt: c.altitude,
          speed: c.speed,
          track: c.heading != null && !isNaN(c.heading) ? c.heading : null,
          acc: c.accuracy,
        });
      },
      (err) => this.emit({ error: err.code === 1 ? 'Standortzugriff verweigert – bitte in den Einstellungen erlauben.' : `GPS-Fehler: ${err.message}` }),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 }
    );
  }

  private startSim(o: { lat: number; lon: number; elevFt: number; speedup: number }) {
    const pts = buildScenario(o.lat, o.lon, o.elevFt, 250, Date.now());
    let i = 0;
    const step = () => {
      // pro Tick so viele Punkte wie die Zeitraffer-Stufe verlangt
      for (let k = 0; k < o.speedup && i < pts.length && !this.stopping; k++) this.onPoint(pts[i++], k < o.speedup - 1);
      if (i >= pts.length) this.stop();
    };
    this.simTimer = window.setInterval(step, 1000);
  }

  private onPoint(p: GpsPoint, silent = false) {
    if (!this.detector || !this.state.active || this.stopping) return;
    this.detector.push(p);
    const points = this.state.points;
    points.push(p);
    if (!silent) this.emit({ points, last: p, snap: this.detector.snapshot(p.t), error: null });
    if (this.state.source === 'gps' && p.t - this.lastPersist > 10000) {
      this.lastPersist = p.t;
      db.set('activeSession', { id: this.sessionId, source: 'gps', startedAt: this.state.startedAt, points, aircraftReg: this.aircraftReg } as PersistedSession);
    }
    if (this.detector.finished) this.stop();
  }

  /** Aufzeichnung beenden; wenn ein Flug stattfand, Eintrag anlegen */
  async stop() {
    if (!this.state.active || this.stopping) return;
    this.stopping = true; // synchron sperren: stop() darf nur einmal pro Session laufen
    if (this.watchId != null) navigator.geolocation.clearWatch(this.watchId);
    if (this.simTimer != null) clearInterval(this.simTimer);
    this.watchId = this.simTimer = null;
    const d = this.detector!;
    d.finish();
    const snap = d.snapshot();
    let savedEntryId: string | null = null;
    if (snap.takeoffs > 0) {
      const entry = buildEntry(snap, this.state.points, this.sessionId, this.aircraftReg, this.getSettings());
      if (this.state.source === 'sim') entry.remarks = `SIMULATION${entry.remarks ? ' – ' + entry.remarks : ''}`;
      await db.putTrack({ id: this.sessionId, points: this.state.points, events: snap.events });
      await db.putEntry(entry);
      savedEntryId = entry.id;
      this.onEntrySaved(entry);
    }
    await db.del('activeSession');
    this.stopping = false;
    this.emit({ active: false, snap, savedEntryId });
  }
}

export function buildEntry(snap: DetectorSnapshot, points: GpsPoint[], trackId: string, reg: string, settings: AppSettings): LogEntry {
  const takeoffs = snap.events.filter((e) => e.type === 'takeoff');
  const landings = snap.events.filter((e) => e.type === 'landing');
  const firstTo = takeoffs[0];
  const lastLdg = landings[landings.length - 1];
  const name = (lat: number, lon: number) => {
    const n = nearestAirfield(lat, lon, 4000);
    return n ? n.field.icao : `${lat.toFixed(3)},${lon.toFixed(3)}`;
  };
  const endPt = points[points.length - 1];
  const to = lastLdg ? name(lastLdg.lat, lastLdg.lon) : endPt ? name(endPt.lat, endPt.lon) : '';
  const takeoff = firstTo?.t ?? null;
  const landing = lastLdg?.t ?? endPt?.t ?? null;
  const offBlock = snap.firstMoveT ?? takeoff;
  const onBlock = snap.lastMoveT ?? landing;
  const ac = settings.aircraft.find((a) => a.reg === reg);
  return {
    id: uid(),
    date: takeoff ?? Date.now(),
    aircraftReg: reg,
    aircraftType: ac?.type ?? '',
    from: firstTo ? name(firstTo.lat, firstTo.lon) : '',
    to,
    offBlock,
    takeoff,
    landing,
    onBlock,
    flightMin: takeoff && landing ? Math.round((landing - takeoff) / 60000) : 0,
    blockMin: offBlock && onBlock ? Math.round((onBlock - offBlock) / 60000) : 0,
    landings: landings.length,
    touchAndGos: snap.touchAndGos,
    pic: settings.pilotName,
    role: 'PIC',
    remarks: snap.touchAndGos ? `${snap.touchAndGos}× Touch-and-Go (automatisch erkannt)` : '',
    trackId,
    createdAt: Date.now(),
    source: 'gps',
  };
}
