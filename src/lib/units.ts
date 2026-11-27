/** Anzeige-Einheiten (umschaltbar): Geschwindigkeit kt/km/h, Höhe ft/m. Intern rechnet die App in kt/ft/m. */
export interface Units {
  speed: 'kt' | 'kmh';
  alt: 'ft' | 'm';
}
export const DEFAULT_UNITS: Units = { speed: 'kt', alt: 'ft' };

export const speedVal = (kt: number, u: Units) => (u.speed === 'kmh' ? kt * 1.852 : kt);
export const speedUnit = (u: Units) => (u.speed === 'kmh' ? 'km/h' : 'kt');
export const altVal = (ft: number, u: Units) => (u.alt === 'm' ? ft * 0.3048 : ft);
export const altUnit = (u: Units) => (u.alt === 'm' ? 'm' : 'ft');
/** Vario: fpm bzw. m/s */
export const vsText = (fpm: number, u: Units) =>
  u.alt === 'm' ? { v: `${fpm > 0 ? '+' : ''}${((fpm * 0.3048) / 60).toFixed(1)}`, unit: 'm/s' } : { v: `${fpm > 0 ? '+' : ''}${Math.round(fpm / 50) * 50}`, unit: 'fpm' };
/** Distanz: NM bzw. km (folgt der Geschwindigkeits-Einheit) */
export const distText = (m: number, u: Units) => (u.speed === 'kmh' ? `${(m / 1000).toFixed(1)} km` : `${(m / 1852).toFixed(1)} NM`);
/** Höhenangabe als Text, z.B. aus Verfahren "1300 ft MSL" → "396 m MSL" */
export function altLabel(text: string, u: Units): string {
  if (u.alt !== 'm') return text;
  return text.replace(/(\d+(?:\.\d+)?)\s*ft/gi, (_, n: string) => `${Math.round(Number(n) * 0.3048)} m`);
}
export const elevText = (ft: number, u: Units) => `${Math.round(altVal(ft, u))} ${altUnit(u)}`;
