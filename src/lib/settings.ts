import { db } from './db';
import { DEFAULT_SETTINGS, type DetectorSettings } from './flightDetector';
import { DEFAULT_UNITS, type Units } from './units';

export interface AircraftCfg {
  reg: string;
  type: string;
  /** Zeichnung (z.B. 'wt9'), 'custom:<id>' für eigenes Foto, 'none' oder leer = automatisch */
  image?: string;
}

export interface Instructor {
  name: string;
  license?: string;
}

export interface AppSettings {
  pilotName: string;
  aircraft: AircraftCfg[];
  instructors: Instructor[];
  defaultInstructor: string;
  defaultAircraft: string; // reg
  detector: Omit<DetectorSettings, 'fieldElevationFt'>;
  /** Grundkarte: 'topo' | 'osm' | 'custom' | 'mbt:<id>' */
  mapLayer: string;
  /** aktive Overlays: 'openaip' | 'mbt:<id>' */
  overlays: string[];
  openAipKey: string;
  openAipUrl: string; // leer = Standard
  customUrl: string; // eigene XYZ-Kachel-URL
  customName: string;
  /** Darstellung: 'auto' folgt dem System */
  theme: 'auto' | 'light' | 'dark';
  /** Anzeige-Einheiten */
  units: Units;
  /** Was die Karte zeigt (im Navi über 🗺 umschaltbar) */
  mapShow: MapShow;
}

export interface MapShow {
  circuits: boolean; // Platzrunden (veröffentlicht + eigene schematische)
  routes: boolean; // An-/Abflug-, Transit- und Warteverfahren
  rps: boolean; // VFR-Meldepunkte
}
export const DEFAULT_MAP_SHOW: MapShow = { circuits: true, routes: true, rps: true };

export const DEFAULT_APP_SETTINGS: AppSettings = {
  pilotName: '',
  aircraft: [],
  instructors: [],
  defaultInstructor: '',
  defaultAircraft: '',
  detector: { ...DEFAULT_SETTINGS },
  mapLayer: 'topo',
  overlays: ['openaip'],
  openAipKey: '',
  openAipUrl: '',
  customUrl: '',
  customName: '',
  theme: 'auto',
  units: { ...DEFAULT_UNITS },
  mapShow: { circuits: true, routes: true, rps: true },
};

export async function loadSettings(): Promise<AppSettings> {
  const s = await db.get<AppSettings>('settings');
  return { ...DEFAULT_APP_SETTINGS, ...s, detector: { ...DEFAULT_SETTINGS, ...(s?.detector ?? {}) }, units: { ...DEFAULT_UNITS, ...(s?.units ?? {}) }, mapShow: { ...DEFAULT_MAP_SHOW, ...(s?.mapShow ?? {}) } };
}

export function saveSettings(s: AppSettings) {
  return db.set('settings', s);
}
