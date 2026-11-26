import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { Track } from '../lib/db';
import { applyLayers } from './tiles';
import { listMbtiles } from '../lib/mbtiles';
import type { AppSettings } from '../lib/settings';

/** Statische Karte eines aufgezeichneten Fluges mit Start/Landungs-Markern */
export default function TrackMap({ track, settings }: { track: Track; settings: AppSettings }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current || track.points.length === 0) return;
    const map = L.map(ref.current, { zoomControl: false, attributionControl: false });
    let alive = true;
    listMbtiles().then((mbt) => alive && applyLayers(map, settings, mbt, settings.mapLayer, settings.overlays)).catch(() => {});
    const line = L.polyline(
      track.points.map((p) => [p.lat, p.lon] as [number, number]),
      { color: '#ff4081', weight: 3 }
    ).addTo(map);
    for (const e of track.events) {
      const color = e.type === 'takeoff' ? '#4caf50' : e.kind === 'touch_and_go' ? '#ffb300' : '#ef5350';
      L.circleMarker([e.lat, e.lon], { radius: 6, color, fillColor: color, fillOpacity: 1 })
        .bindTooltip(e.type === 'takeoff' ? 'Start' : e.kind === 'touch_and_go' ? 'Touch-and-Go' : 'Landung')
        .addTo(map);
    }
    map.fitBounds(line.getBounds(), { padding: [20, 20] });
    return () => {
      alive = false;
      map.remove();
    };
  }, [track, settings]);
  return <div ref={ref} className="mini-map" />;
}
