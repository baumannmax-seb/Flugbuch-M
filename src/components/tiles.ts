import L from 'leaflet';

/**
 * Kartenkacheln. Für den Draft: OpenStreetMap / OpenTopoMap.
 * Für echte VFR-Navigation später: OpenFlightMaps (ICAO-Karte für Europa) oder
 * openAIP-Overlay (Lufträume, benötigt API-Key) – siehe README.
 */
export function tileLayer(kind: 'osm' | 'topo') {
  if (kind === 'topo') {
    return L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      maxZoom: 17,
      attribution: '© OpenStreetMap, SRTM | © OpenTopoMap (CC-BY-SA)',
      crossOrigin: true,
    });
  }
  return L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap-Mitwirkende',
    crossOrigin: true,
  });
}
