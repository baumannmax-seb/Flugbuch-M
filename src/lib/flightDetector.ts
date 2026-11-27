/**
 * Automatische Erkennung von Start, Landung, Touch-and-Go und Flugende
 * ausschließlich anhand von GPS-Daten – ohne dass der Pilot etwas tippen muss.
 *
 * Zustandsautomat:
 *
 *   GROUND ──(GS > takeoffKt für confirmSec)──▶ AIRBORNE
 *   AIRBORNE ──(GS < landingKt für confirmSec)──▶ ROLLOUT      (Landung erkannt)
 *   ROLLOUT ──(GS > takeoffKt für confirmSec)──▶ AIRBORNE      (=> Landung war Touch-and-Go)
 *   ROLLOUT ──(GS < fullStopKt für fullStopSec)──▶ GROUND      (=> Landung war Full-Stop)
 *   GROUND ──(Stillstand für flightEndSec nach Landung)──▶ Flug beendet
 *
 * Hysterese zwischen takeoffKt und landingKt verhindert Flattern im langsamen Flug.
 * Zusätzlich: Landung wird nur erkannt, wenn vorher mindestens minAirborneSec in der Luft.
 *
 * Problem Touch-and-Go: Bei einem schnellen T&G fällt die GS oft gar nicht unter landingKt.
 * Deshalb gilt "am Boden" auch, wenn die GPS-Höhe nahe der Bodenreferenz liegt
 * (< touchdownAglFt) und die Vertikalgeschwindigkeit ~0 ist. Die Bodenreferenz wird
 * beim Rollen selbst gemessen (GPS-Höhe am Boden) und für andere Plätze über die
 * Höhendifferenz laut Flugplatzdatenbank verschoben – so spielt der Geoid-Offset
 * des GPS keine Rolle.
 */
import { distance, FT_PER_M, KT_PER_MS } from './geo';

export interface GpsPoint {
  t: number; // ms epoch
  lat: number;
  lon: number;
  alt: number | null; // m (GPS)
  speed: number | null; // m/s, vom Gerät; null => wird berechnet
  track: number | null; // Grad
  acc?: number | null; // Genauigkeit m
}

export type FlightPhase = 'GROUND' | 'AIRBORNE' | 'ROLLOUT';

export interface FlightEvent {
  type: 'takeoff' | 'landing';
  t: number;
  lat: number;
  lon: number;
  /** nur bei Landungen: endgültige Art, sobald bekannt */
  kind?: 'touch_and_go' | 'full_stop' | 'pending';
}

export interface DetectorSettings {
  takeoffKt: number;
  landingKt: number;
  fullStopKt: number;
  confirmSec: number;
  fullStopSec: number;
  minAirborneSec: number;
  flightEndSec: number;
  movingKt: number;
  maxAccuracyM: number;
  touchdownAglFt: number;
  /** Start erst bestätigen, wenn so hoch über Grund gestiegen (ft) – verhindert Fehlstarts durch Autofahrt / Startabbruch */
  takeoffConfirmAglFt: number;
  /** Zeitfenster für die Bestätigung (s) */
  takeoffConfirmSec: number;
  /** Optional: Platzhöhe (ft) des nächsten Flugplatzes */
  fieldElevationFt?: (lat: number, lon: number) => number | null;
}

export const DEFAULT_SETTINGS: DetectorSettings = {
  takeoffKt: 35, // UL rotiert ca. 35–45 kt
  landingKt: 25,
  fullStopKt: 8, // unter Rollgeschwindigkeit => kein Durchstarten mehr
  confirmSec: 3,
  fullStopSec: 8,
  minAirborneSec: 15,
  flightEndSec: 120, // 2 min Stillstand nach Landung => Flug zu Ende
  movingKt: 3, // Off-/On-Block-Erkennung
  maxAccuracyM: 100,
  touchdownAglFt: 30,
  takeoffConfirmAglFt: 100,
  takeoffConfirmSec: 90,
};

export interface DetectorSnapshot {
  phase: FlightPhase;
  /** Startlauf erkannt, Bestätigung durch Steigen steht noch aus */
  takeoffPending: boolean;
  /** verworfene Starts (z.B. Autofahrt, Startabbruch) */
  rejectedTakeoffs: number;
  events: FlightEvent[];
  firstMoveT: number | null; // "Off-Block"
  lastMoveT: number | null; // "On-Block"
  groundSpeedKt: number;
  vsFpm: number;
  aglFt: number | null;
  finished: boolean;
  landings: number;
  touchAndGos: number;
  fullStops: number;
  takeoffs: number;
  airborneMs: number;
}

export class FlightDetector {
  private s: DetectorSettings;
  phase: FlightPhase = 'GROUND';
  events: FlightEvent[] = [];
  firstMoveT: number | null = null;
  lastMoveT: number | null = null;
  finished = false;
  private last: GpsPoint | null = null;
  private speedHist: number[] = [];
  private candidateSince: number | null = null; // für Übergänge
  private candidatePoint: GpsPoint | null = null;
  private stopCandidate: number | null = null;
  private stillSince: number | null = null;
  private airborneSince: number | null = null;
  private airborneAccum = 0;
  gsKt = 0;
  vsFpm = 0;
  aglFt: number | null = null;
  private refAltM: number | null = null; // GPS-Höhe am Boden
  private refElevFt: number | null = null; // Platzhöhe am Ort der Referenz
  private groundAlts: number[] = [];
  private altHist: { t: number; alt: number }[] = [];
  onEvent?: (e: FlightEvent, d: FlightDetector) => void;

  constructor(settings: Partial<DetectorSettings> = {}) {
    this.s = { ...DEFAULT_SETTINGS, ...settings };
  }

  /** Bodengeschwindigkeit in kt: Gerätewert, sonst aus Positionsdifferenz; geglättet über Median aus 3 */
  private computeSpeed(p: GpsPoint): number {
    let ms = p.speed;
    if ((ms == null || isNaN(ms) || ms < 0) && this.last) {
      const dt = (p.t - this.last.t) / 1000;
      ms = dt > 0 ? distance(this.last.lat, this.last.lon, p.lat, p.lon) / dt : 0;
    }
    const kt = (ms ?? 0) * KT_PER_MS;
    this.speedHist.push(kt);
    if (this.speedHist.length > 3) this.speedHist.shift();
    const sorted = [...this.speedHist].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  push(p: GpsPoint): void {
    if (this.finished) return;
    if (p.acc != null && p.acc > this.s.maxAccuracyM) return; // zu ungenau
    if (this.last && p.t <= this.last.t) return;
    const gs = this.computeSpeed(p);
    this.gsKt = gs;
    const s = this.s;
    this.updateAltitude(p);

    // Off-/On-Block
    if (gs >= s.movingKt) {
      if (this.firstMoveT == null) this.firstMoveT = p.t;
      this.lastMoveT = p.t;
      this.stillSince = null;
    } else if (this.stillSince == null) {
      this.stillSince = p.t;
    }

    switch (this.phase) {
      case 'GROUND':
        if (this.pending) {
          // vorgemerkter Start: bestätigen, sobald wirklich gestiegen wird
          const climbedEnough = this.aglFt != null && this.aglFt > s.takeoffConfirmAglFt;
          if (climbedEnough && this.pendingMaxVs > 300) {
            this.candidatePoint = this.pending.point;
            this.pending = null;
            this.takeoff();
          } else if (gs < s.landingKt || p.t - this.pending.point.t > s.takeoffConfirmSec * 1000) {
            // Startabbruch, langsamer geworden oder kein Steigflug (Autofahrt) → verwerfen
            this.pending = null;
            this.rejected++;
            this.resetCandidate();
          } else this.pendingMaxVs = Math.max(this.pendingMaxVs, this.vsFpm);
        } else if (this.held(gs > s.takeoffKt, p)) {
          // Ohne Höhendaten (oder ohne gelernte Bodenreferenz) wie bisher nur über die Geschwindigkeit
          if (this.aglFt == null) this.takeoff();
          else {
            this.pending = { point: this.candidatePoint! };
            this.pendingMaxVs = this.vsFpm;
            this.resetCandidate();
          }
        } else if (this.landingCount() > 0 && this.stillSince != null && p.t - this.stillSince >= s.flightEndSec * 1000) {
          this.finished = true;
        }
        break;

      case 'AIRBORNE': {
        const airborneLongEnough = this.airborneSince != null && p.t - this.airborneSince >= s.minAirborneSec * 1000;
        const nearGround =
          this.aglFt != null && this.aglFt < s.touchdownAglFt && this.vsFpm > -350 && this.vsFpm < 250 && gs < s.takeoffKt + 20;
        if (airborneLongEnough && this.held(gs < s.landingKt || nearGround, p)) this.landing();
        break;
      }

      case 'ROLLOUT':
        // Durchstarten? Mit Höhendaten zusätzlich: Flugzeug muss wirklich steigen,
        // sonst würde schnelles Ausrollen (> takeoffKt) sofort als neuer Start zählen.
        const climbing = this.aglFt == null || this.aglFt > s.touchdownAglFt || this.vsFpm > 250;
        if (this.held(gs > s.takeoffKt && climbing, p)) {
          this.setLastLandingKind('touch_and_go');
          this.takeoff();
          break;
        }
        // Full-Stop?
        if (gs < s.fullStopKt) {
          if (this.stopCandidate == null) this.stopCandidate = p.t;
          if (p.t - this.stopCandidate >= s.fullStopSec * 1000) {
            this.setLastLandingKind('full_stop');
            this.phase = 'GROUND';
            this.stopCandidate = null;
          }
        } else {
          this.stopCandidate = null;
        }
        break;
    }
    this.last = p;
  }

  private updateAltitude(p: GpsPoint) {
    if (p.alt == null || isNaN(p.alt)) {
      this.aglFt = null;
      return;
    }
    // Vertikalgeschwindigkeit über ~5 s
    this.altHist.push({ t: p.t, alt: p.alt });
    while (this.altHist.length > 2 && p.t - this.altHist[0].t > 5000) this.altHist.shift();
    const a0 = this.altHist[0];
    const dt = (p.t - a0.t) / 60000;
    this.vsFpm = dt > 0 ? ((p.alt - a0.alt) * FT_PER_M) / dt : 0;

    // Bodenreferenz lernen (am Boden, Median der letzten 20 Werte)
    if (this.phase !== 'AIRBORNE' && this.gsKt < this.s.landingKt) {
      this.groundAlts.push(p.alt);
      if (this.groundAlts.length > 20) this.groundAlts.shift();
      const sorted = [...this.groundAlts].sort((a, b) => a - b);
      this.refAltM = sorted[Math.floor(sorted.length / 2)];
      this.refElevFt = this.s.fieldElevationFt?.(p.lat, p.lon) ?? null;
    } else if (this.phase === 'AIRBORNE') {
      this.groundAlts = [];
    }
    if (this.refAltM == null) {
      this.aglFt = null;
      return;
    }
    let groundM = this.refAltM;
    const here = this.s.fieldElevationFt?.(p.lat, p.lon);
    if (here != null && this.refElevFt != null) groundM += (here - this.refElevFt) / FT_PER_M;
    this.aglFt = (p.alt - groundM) * FT_PER_M;
  }

  /** Bedingung muss confirmSec lang ununterbrochen gelten; Ereigniszeit = Beginn */
  private held(cond: boolean, p: GpsPoint): boolean {
    if (!cond) {
      this.candidateSince = null;
      this.candidatePoint = null;
      return false;
    }
    if (this.candidateSince == null) {
      this.candidateSince = p.t;
      this.candidatePoint = p;
    }
    return p.t - this.candidateSince >= this.s.confirmSec * 1000;
  }

  private pending: { point: GpsPoint } | null = null;
  private pendingMaxVs = 0;
  private rejected = 0;

  private takeoff() {
    const p = this.candidatePoint!;
    const e: FlightEvent = { type: 'takeoff', t: p.t, lat: p.lat, lon: p.lon };
    this.events.push(e);
    this.phase = 'AIRBORNE';
    this.airborneSince = p.t;
    this.resetCandidate();
    this.onEvent?.(e, this);
  }

  private landing() {
    const p = this.candidatePoint!;
    const e: FlightEvent = { type: 'landing', t: p.t, lat: p.lat, lon: p.lon, kind: 'pending' };
    this.events.push(e);
    if (this.airborneSince != null) this.airborneAccum += p.t - this.airborneSince;
    this.airborneSince = null;
    this.phase = 'ROLLOUT';
    this.stopCandidate = null;
    this.resetCandidate();
    this.onEvent?.(e, this);
  }

  private resetCandidate() {
    this.candidateSince = null;
    this.candidatePoint = null;
  }

  private setLastLandingKind(kind: 'touch_and_go' | 'full_stop') {
    for (let i = this.events.length - 1; i >= 0; i--) {
      const e = this.events[i];
      if (e.type === 'landing') {
        if (e.kind === 'pending') {
          e.kind = kind;
          this.onEvent?.(e, this);
        }
        return;
      }
    }
  }

  private landingCount() {
    return this.events.filter((e) => e.type === 'landing').length;
  }

  /** Aufzeichnung manuell beenden: offene Landung gilt als Full-Stop */
  finish() {
    this.setLastLandingKind('full_stop');
    if (this.phase === 'AIRBORNE' && this.airborneSince != null && this.last) {
      this.airborneAccum += this.last.t - this.airborneSince;
      this.airborneSince = null;
    }
    this.finished = true;
  }

  snapshot(now?: number): DetectorSnapshot {
    const landings = this.events.filter((e) => e.type === 'landing');
    const t = now ?? this.last?.t ?? 0;
    return {
      phase: this.phase,
      takeoffPending: !!this.pending,
      rejectedTakeoffs: this.rejected,
      events: this.events.map((e) => ({ ...e })),
      firstMoveT: this.firstMoveT,
      lastMoveT: this.lastMoveT,
      groundSpeedKt: this.gsKt,
      vsFpm: this.vsFpm,
      aglFt: this.aglFt,
      finished: this.finished,
      landings: landings.length,
      touchAndGos: landings.filter((e) => e.kind === 'touch_and_go').length,
      fullStops: landings.filter((e) => e.kind === 'full_stop').length,
      takeoffs: this.events.filter((e) => e.type === 'takeoff').length,
      airborneMs: this.airborneAccum + (this.airborneSince != null ? Math.max(0, t - this.airborneSince) : 0),
    };
  }
}
