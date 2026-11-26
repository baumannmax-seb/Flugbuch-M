import { db } from './db';
import { DEFAULT_SETTINGS, type DetectorSettings } from './flightDetector';

export interface AppSettings {
  pilotName: string;
  aircraft: { reg: string; type: string }[];
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
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  pilotName: '',
  aircraft: [],
  defaultAircraft: '',
  detector: { ...DEFAULT_SETTINGS },
  mapLayer: 'topo',
  overlays: ['openaip'],
  openAipKey: '',
  openAipUrl: '',
  customUrl: '',
  customName: '',
};

export async function loadSettings(): Promise<AppSettings> {
  const s = await db.get<AppSettings>('settings');
  return { ...DEFAULT_APP_SETTINGS, ...s, detector: { ...DEFAULT_SETTINGS, ...(s?.detector ?? {}) } };
}

export function saveSettings(s: AppSettings) {
  return db.set('settings', s);
}
