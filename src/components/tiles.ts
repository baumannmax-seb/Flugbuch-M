import L from 'leaflet';
import type { AppSettings } from '../lib/settings';
import { mbtilesLayer, type MbtilesMeta } from '../lib/mbtiles';

/**
 * Kartenquellen:
 *  - Grundkarten online: OpenStreetMap, OpenTopoMap, eigene XYZ-URL (z.B. OpenFlightMaps)
 *  - Offline: importierte MBTiles (als Grundkarte oder transparentes Overlay)
 *  - Overlay: openAIP (Lufträume, Flugplätze, Navaids) – braucht kostenlosen API-Key
 */
export interface MapSource {
  id: string;
  name: string;
  create: () => L.Layer;
}

export const DEFAULT_OPENAIP_URL = 'https://api.tiles.openaip.net/api/data/openaip/{z}/{x}/{y}.png?apiKey={key}';

export function openAipUrl(s: AppSettings) {
  return (s.openAipUrl || DEFAULT_OPENAIP_URL).replace('{key}', encodeURIComponent(s.openAipKey.trim()));
}

export function baseSources(s: AppSettings, mbt: MbtilesMeta[]): MapSource[] {
  const list: MapSource[] = [
    {
      id: 'topo',
      name: 'OpenTopoMap (Gelände)',
      create: () => L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom: 17, attribution: '© OpenStreetMap, SRTM | © OpenTopoMap (CC-BY-SA)', crossOrigin: true }),
    },
    {
      id: 'osm',
      name: 'OpenStreetMap',
      create: () => L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap-Mitwirkende', crossOrigin: true }),
    },
  ];
  if (s.customUrl.trim()) {
    list.push({
      id: 'custom',
      name: s.customName.trim() || 'Eigene Karte',
      create: () => L.tileLayer(s.customUrl.trim(), { maxZoom: 18, attribution: s.customName.trim() || 'Eigene Karte', crossOrigin: true }),
    });
  }
  for (const m of mbt) list.push({ id: `mbt:${m.id}`, name: `📦 ${m.name}`, create: () => mbtilesLayer(m) });
  return list;
}

export function overlaySources(s: AppSettings, mbt: MbtilesMeta[]): MapSource[] {
  const list: MapSource[] = [];
  if (s.openAipKey.trim()) {
    list.push({
      id: 'openaip',
      name: 'openAIP (Lufträume, Plätze)',
      create: () => L.tileLayer(openAipUrl(s), { maxZoom: 18, attribution: '© openAIP (CC BY-NC 4.0)', crossOrigin: true, zIndex: 50 }),
    });
  }
  for (const m of mbt) list.push({ id: `mbt:${m.id}`, name: `📦 ${m.name}`, create: () => mbtilesLayer(m) });
  return list;
}

/** Fügt Grundkarte + Overlays zu einer Karte hinzu; gibt Aufräumfunktion zurück */
export function applyLayers(map: L.Map, s: AppSettings, mbt: MbtilesMeta[], base: string, overlays: string[]): () => void {
  const bases = baseSources(s, mbt);
  const b = bases.find((x) => x.id === base) ?? bases[0];
  const layers: L.Layer[] = [b.create()];
  for (const o of overlaySources(s, mbt)) if (overlays.includes(o.id) && o.id !== base) layers.push(o.create());
  layers.forEach((l) => l.addTo(map));
  return () => layers.forEach((l) => l.remove());
}
