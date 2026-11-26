/**
 * Vollbild-Flugmodus: Moving Map mit Instrumenten (GS, Höhe, Vario, Track),
 * Direct-To, nächster Flugplatz, Ereignis-Meldungen (Start / Landung / T&G).
 */
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import type { Recorder, RecorderState } from '../lib/recorder';
import type { AppSettings } from '../lib/settings';
import type { GpsPoint } from '../lib/flightDetector';
import { bearing, distance, fmtDuration, FT_PER_M, KT_PER_MS, NM_IN_M, pad3 } from '../lib/geo';
import { getAirfieldsSync, nearestAirfield, type Airfield } from '../lib/airfields';
import { tileLayer } from './tiles';
import AirfieldSearch from './AirfieldSearch';

const PHASE_TXT = { GROUND: 'AM BODEN', AIRBORNE: 'IN DER LUFT', ROLLOUT: 'AUSROLLEN' } as const;

const planeSvg = (color: string) =>
  `<svg viewBox="0 0 64 64" width="44" height="44"><path d="M32 4c2.4 0 4 2.4 4 5.6V24l22 12v6l-22-6.4V50l7 5.4V60l-11-3-11 3v-4.6l7-5.4V35.6L6 42v-6l22-12V9.6C28 6.4 29.6 4 32 4z" fill="${color}" stroke="#000" stroke-width="2"/></svg>`;

export default function NavMap({ recorder, rec, settings, onClose }: { recorder: Recorder; rec: RecorderState; settings: AppSettings; onClose: () => void }) {
  const mapDiv = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const planeRef = useRef<L.Marker | null>(null);
  const trackLineRef = useRef<L.Polyline | null>(null);
  const dtoLineRef = useRef<L.Polyline | null>(null);
  const fieldLayerRef = useRef<L.LayerGroup | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const drawnPts = useRef(0);

  const [follow, setFollow] = useState(true);
  const [trackUp, setTrackUp] = useState(false);
  const [layer, setLayer] = useState<'osm' | 'topo'>(settings.mapLayer);
  const [dto, setDto] = useState<Airfield | null>(null);
  const [pickDto, setPickDto] = useState(false);
  const [toast, setToast] = useState<{ text: string; key: number } | null>(null);
  const [ownPos, setOwnPos] = useState<GpsPoint | null>(null);
  const [gpsErr, setGpsErr] = useState<string | null>(null);
  const lastTrack = useRef(0);

  // Position: aus laufender Aufzeichnung oder eigener GPS-Abfrage (Navi ohne Aufzeichnung)
  useEffect(() => {
    if (rec.active || !('geolocation' in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setGpsErr(null);
        setOwnPos({ t: p.timestamp, lat: p.coords.latitude, lon: p.coords.longitude, alt: p.coords.altitude, speed: p.coords.speed, track: p.coords.heading, acc: p.coords.accuracy });
      },
      (e) => setGpsErr(e.code === 1 ? 'Standortzugriff verweigert' : 'Kein GPS-Signal'),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [rec.active]);

  const pos = rec.active ? rec.last : ownPos ?? rec.last;
  const gsKt = rec.active && rec.snap ? rec.snap.groundSpeedKt : pos?.speed != null ? pos.speed * KT_PER_MS : 0;
  if (pos?.track != null && gsKt > 3) lastTrack.current = pos.track;
  const trk = lastTrack.current;
  const altFt = pos?.alt != null ? pos.alt * FT_PER_M : null;
  const vs = rec.active && rec.snap ? rec.snap.vsFpm : 0;

  // Bildschirm anlassen
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const req = async () => {
      try {
        lock = await (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen') ?? null;
      } catch {
        /* nicht unterstützt */
      }
    };
    req();
    const onVis = () => document.visibilityState === 'visible' && req();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      lock?.release().catch(() => {});
    };
  }, []);

  // Karte initialisieren
  useEffect(() => {
    const map = L.map(mapDiv.current!, { zoomControl: false, attributionControl: true, zoomSnap: 0.5 });
    map.attributionControl.setPrefix('');
    const start = rec.last ?? { lat: 51.1, lon: 10.4 };
    map.setView([start.lat, start.lon], rec.last ? 12 : 6);
    planeRef.current = L.marker([start.lat, start.lon], {
      icon: L.divIcon({ className: '', html: `<div class="ac-icon">${planeSvg('#ffeb3b')}</div>`, iconSize: [44, 44], iconAnchor: [22, 22] }),
      interactive: false,
      zIndexOffset: 1000,
    }).addTo(map);
    trackLineRef.current = L.polyline([], { color: '#ff4081', weight: 3, opacity: 0.9 }).addTo(map);
    dtoLineRef.current = L.polyline([], { color: '#e040fb', weight: 3, dashArray: '8 6' }).addTo(map);
    fieldLayerRef.current = L.layerGroup().addTo(map);
    map.on('dragstart', () => setFollow(false));
    const drawFields = () => {
      const g = fieldLayerRef.current!;
      g.clearLayers();
      if (map.getZoom() < 8) return;
      const b = map.getBounds().pad(0.2);
      for (const f of getAirfieldsSync()) {
        if (!b.contains([f.lat, f.lon])) continue;
        L.circleMarker([f.lat, f.lon], { radius: 6, color: '#00e5ff', weight: 2, fillColor: '#0b1d33', fillOpacity: 0.9 })
          .bindTooltip(f.icao, { permanent: map.getZoom() >= 10, direction: 'right', className: 'af-label' })
          .addTo(g);
      }
    };
    map.on('moveend zoomend', drawFields);
    drawFields();
    mapRef.current = map;
    drawnPts.current = 0;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Kartenlayer
  useEffect(() => {
    const map = mapRef.current!;
    tileRef.current?.remove();
    tileRef.current = tileLayer(layer).addTo(map);
  }, [layer]);

  // Position / Track / Direct-To aktualisieren
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !pos) return;
    const ll: [number, number] = [pos.lat, pos.lon];
    planeRef.current!.setLatLng(ll);
    const el = planeRef.current!.getElement()?.querySelector('.ac-icon') as HTMLElement | null;
    if (el) el.style.transform = `rotate(${trackUp ? 0 : trk}deg)`;

    // Track inkrementell zeichnen
    const pts = rec.points;
    if (pts.length < drawnPts.current) {
      trackLineRef.current!.setLatLngs([]);
      drawnPts.current = 0;
    }
    for (let i = drawnPts.current; i < pts.length; i++) trackLineRef.current!.addLatLng([pts[i].lat, pts[i].lon]);
    drawnPts.current = pts.length;

    dtoLineRef.current!.setLatLngs(dto ? [ll, [dto.lat, dto.lon]] : []);
    if (follow) map.panTo(ll, { animate: true, duration: 0.5 });
  }, [pos, follow, dto, trackUp, trk, rec.points]);

  // Bei Track-Up wird die Karte gedreht → Ziehen deaktivieren
  useEffect(() => {
    const map = mapRef.current!;
    if (trackUp) {
      map.dragging.disable();
      setFollow(true);
    } else map.dragging.enable();
    setTimeout(() => map.invalidateSize(), 50);
  }, [trackUp]);

  // Ereignis-Meldungen
  const evCount = useRef<string>('');
  useEffect(() => {
    const evs = rec.snap?.events ?? [];
    const sig = evs.map((e) => e.type + (e.kind ?? '')).join(',');
    if (evCount.current && sig !== evCount.current && evs.length) {
      const last = evs[evs.length - 1];
      const prev = evs[evs.length - 2];
      let text = '';
      if (last.type === 'takeoff') text = prev?.kind === 'touch_and_go' ? '🔁 Touch-and-Go erkannt' : '🛫 Start erkannt';
      else if (last.kind === 'pending') text = '🛬 Landung erkannt';
      else if (last.kind === 'full_stop') text = '✋ Full-Stop';
      if (text) setToast({ text, key: Date.now() });
    }
    evCount.current = sig || 'none';
  }, [rec.snap]);

  // Nächster Flugplatz
  const near = pos ? nearestAirfield(pos.lat, pos.lon) : null;
  const dtoInfo =
    pos && dto
      ? (() => {
          const d = distance(pos.lat, pos.lon, dto.lat, dto.lon);
          const b = bearing(pos.lat, pos.lon, dto.lat, dto.lon);
          const ete = gsKt > 20 ? (d / NM_IN_M / gsKt) * 3600000 : null;
          return { d, b, ete };
        })()
      : null;

  const snap = rec.snap;
  const rotateWrap = trackUp ? { transform: `rotate(${-trk}deg)`, transition: 'transform .5s linear' } : {};

  return (
    <div className="nav">
      <div style={{ position: 'absolute', inset: trackUp ? '-50%' : 0, ...rotateWrap }}>
        <div ref={mapDiv} className="map" />
      </div>

      <div className="inst-top">
        <div className="inst"><div className="l">GS</div><div className="v">{Math.round(gsKt)}<span className="u">kt</span></div></div>
        <div className="inst"><div className="l">ALT (GPS)</div><div className="v">{altFt != null ? Math.round(altFt / 10) * 10 : '–'}<span className="u">ft</span></div></div>
        <div className="inst"><div className="l">VS</div><div className="v">{rec.active ? (vs > 0 ? '+' : '') + Math.round(vs / 50) * 50 : '–'}<span className="u">fpm</span></div></div>
        <div className="inst"><div className="l">TRK</div><div className="v">{gsKt > 3 ? pad3(trk) : '–'}<span className="u">°</span></div></div>
      </div>

      {dtoInfo && dto && (
        <div className="dto-panel">
          <b>→ {dto.icao}</b> {pad3(dtoInfo.b)}° · {(dtoInfo.d / NM_IN_M).toFixed(1)} NM{dtoInfo.ete != null && <> · ETE {fmtDuration(dtoInfo.ete)}</>}
        </div>
      )}

      <div className="side-btns">
        <button className={follow ? 'on' : ''} onClick={() => setFollow(true)} title="Zentrieren">◎</button>
        <button className={trackUp ? 'on' : ''} onClick={() => setTrackUp(!trackUp)} title="Track-Up / North-Up">{trackUp ? '⬆︎' : 'N'}</button>
        <button onClick={() => mapRef.current?.zoomIn()}>＋</button>
        <button onClick={() => mapRef.current?.zoomOut()}>－</button>
        <button onClick={() => setLayer(layer === 'topo' ? 'osm' : 'topo')} title="Kartenlayer">🗺</button>
      </div>

      {toast && <div key={toast.key} className="toast">{toast.text}</div>}

      <div className="inst-bottom">
        {rec.active && snap ? (
          <span className={`phase ${snap.phase}`}>{PHASE_TXT[snap.phase]}{rec.source === 'sim' && ' · SIM'}</span>
        ) : (
          <span className="phase">{gpsErr ?? 'KEINE AUFZEICHNUNG'}</span>
        )}
        <div className="nav-info">
          {rec.active && snap && (
            <div>
              ⏱ {fmtDuration(snap.airborneMs)} · 🛬 {snap.landings}
              {snap.touchAndGos > 0 && ` (${snap.touchAndGos} T&G)`}
            </div>
          )}
          {near && (
            <div className="muted">
              Nächster: <b style={{ color: 'var(--text)' }}>{near.field.icao}</b> {pad3(bearing(pos!.lat, pos!.lon, near.field.lat, near.field.lon))}° {(near.dist / NM_IN_M).toFixed(1)} NM
            </div>
          )}
        </div>
        <div className="nav-btns">
          <button onClick={() => (dto ? setDto(null) : setPickDto(true))}>{dto ? 'D→ aus' : 'D→'}</button>
          {near && !dto && <button onClick={() => setDto(near.field)} title="Direct-To nächster Platz">NRST</button>}
          {rec.active && <button onClick={() => confirm('Aufzeichnung beenden und Flug speichern?') && recorder.stop()}>■</button>}
          <button onClick={onClose}>✕</button>
        </div>
      </div>

      {pickDto && (
        <div className="sheet-backdrop" onClick={() => setPickDto(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <h3>Direct-To</h3>
              <button className="ghost" onClick={() => setPickDto(false)}>✕</button>
            </div>
            <AirfieldSearch onPick={(a) => { setDto(a); setPickDto(false); }} />
          </div>
        </div>
      )}
    </div>
  );
}
