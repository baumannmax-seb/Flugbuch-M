// Geo-Hilfsfunktionen und Einheiten

export const KT_PER_MS = 1.943844;
export const FT_PER_M = 3.28084;
export const NM_IN_M = 1852;

const R = 6371000; // Erdradius in m
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

/** Entfernung in Metern (Haversine) */
export function distance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Rechtweisender Kurs von Punkt 1 nach Punkt 2 in Grad (0..360) */
export function bearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Zielpunkt ausgehend von Start, Kurs (Grad) und Distanz (m) */
export function destination(lat: number, lon: number, brg: number, dist: number): [number, number] {
  const d = dist / R;
  const b = toRad(brg);
  const la1 = toRad(lat);
  const lo1 = toRad(lon);
  const la2 = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(b));
  const lo2 = lo1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la1), Math.cos(d) - Math.sin(la1) * Math.sin(la2));
  return [toDeg(la2), ((toDeg(lo2) + 540) % 360) - 180];
}

export function fmtDuration(ms: number): string {
  if (!isFinite(ms) || ms < 0) ms = 0;
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

export function fmtTime(t: number | undefined | null): string {
  if (!t) return '–';
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function fmtDate(t: number): string {
  const d = new Date(t);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

export function pad3(deg: number): string {
  return String(Math.round(deg) % 360).padStart(3, '0');
}
