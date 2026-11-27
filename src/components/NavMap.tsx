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
import { applyLayers, baseSources, overlaySources } from './tiles';
import { listMbtiles, type MbtilesMeta } from '../lib/mbtiles';
import AirfieldSearch from './AirfieldSearch';
import AirfieldSheet from './AirfieldSheet';
import { keepScreenOn, watchLocation } from '../lib/native';
import { altLabel, altUnit, altVal, distText, speedUnit, speedVal, vsText } from '../lib/units';
import { circuitPath, effectiveCircuit, getDetailsSync, getFieldData, listFieldsWithCircuits, loadDetails, runwayEnds } from '../lib/airfieldDetails';

const PHASE_TXT = { GROUND: 'AM BODEN', AIRBORNE: 'IN DER LUFT', ROLLOUT: 'AUSROLLEN' } as const;

const planeSvg = (color: string) =>
  `<svg viewBox="0 0 64 64" width="44" height="44"><path d="M32 4c2.4 0 4 2.4 4 5.6V24l22 12v6l-22-6.4V50l7 5.4V60l-11-3-11 3v-4.6l7-5.4V35.6L6 42v-6l22-12V9.6C28 6.4 29.6 4 32 4z" fill="${color}" stroke="#000" stroke-width="2"/></svg>`;

export default function NavMap({ recorder, rec, settings, onSettings, onClose }: { recorder: Recorder; rec: RecorderState; settings: AppSettings; onSettings: (s: AppSettings) => void; onClose: () => void }) {
  const mapDiv = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const planeRef = useRef<L.Marker | null>(null);
  const trackLineRef = useRef<L.Polyline | null>(null);
  const dtoLineRef = useRef<L.Polyline | null>(null);
  const fieldLayerRef = useRef<L.LayerGroup | null>(null);
  const circuitLayerRef = useRef<L.LayerGroup | null>(null);
  const drawnPts = useRef(0);

  const [follow, setFollow] = useState(true);
  const [trackUp, setTrackUp] = useState(false);
  const [mbt, setMbt] = useState<MbtilesMeta[] | null>(null);
  const [pickLayer, setPickLayer] = useState(false);
  const [dto, setDto] = useState<Airfield | null>(null);
  const [pickDto, setPickDto] = useState(false);
  const [selField, setSelField] = useState<Airfield | null>(null);
  const [fieldsVer, setFieldsVer] = useState(0);
  const [toast, setToast] = useState<{ text: string; key: number } | null>(null);
  const [ownPos, setOwnPos] = useState<GpsPoint | null>(null);
  const [gpsErr, setGpsErr] = useState<string | null>(null);
  const lastTrack = useRef(0);
  const u = settings.units;
  const unitsRef = useRef(u);
  unitsRef.current = u;
  const showRef = useRef(settings.mapShow);
  showRef.current = settings.mapShow;
  // Beschriftungen der Karte bei Einheitenwechsel neu zeichnen
  useEffect(() => {
    mapRef.current?.fire('moveend');
  }, [u.alt, u.speed, settings.mapShow.circuits, settings.mapShow.routes, settings.mapShow.rps]);
  const firstFix = useRef(false);

  // Position: aus laufender Aufzeichnung oder eigener GPS-Abfrage (Navi ohne Aufzeichnung)
  useEffect(() => {
    if (rec.active) return;
    let stop: (() => void) | null = null;
    let alive = true;
    watchLocation(
      (p) => {
        setGpsErr(null);
        setOwnPos(p);
      },
      (_msg, denied) => setGpsErr(denied ? 'Standortzugriff verweigert' : 'Kein GPS-Signal')
    ).then((f) => (alive ? (stop = f) : f()));
    return () => {
      alive = false;
      stop?.();
    };
  }, [rec.active]);

  const pos = rec.active ? rec.last : ownPos ?? rec.last;
  const gsKt = rec.active && rec.snap ? rec.snap.groundSpeedKt : pos?.speed != null ? pos.speed * KT_PER_MS : 0;
  if (pos?.track != null && gsKt > 3) lastTrack.current = pos.track;
  const trk = lastTrack.current;
  const altFt = pos?.alt != null ? pos.alt * FT_PER_M : null;
  const vs = rec.active && rec.snap ? rec.snap.vsFpm : 0;

  // Bildschirm anlassen (nativ: KeepAwake, Browser: Wake Lock)
  useEffect(() => {
    let release: (() => void) | null = null;
    let alive = true;
    keepScreenOn().then((r) => (alive ? (release = r) : r()));
    return () => {
      alive = false;
      release?.();
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
    circuitLayerRef.current = L.layerGroup().addTo(map);
    fieldLayerRef.current = L.layerGroup().addTo(map);
    map.on('dragstart', () => setFollow(false));
    const drawFields = () => {
      const g = fieldLayerRef.current!;
      g.clearLayers();
      if (map.getZoom() < 8) return;
      const b = map.getBounds().pad(0.2);
      const z = map.getZoom();
      for (const f of getAirfieldsSync()) {
        if (!b.contains([f.lat, f.lon])) continue;
        // Pisten ab Zoom 11 (aus Flugplatzdetails)
        if (z >= 11) {
          for (const r of getDetailsSync(f.icao)?.runways ?? []) {
            const e = runwayEnds(f, r);
            if (!e) continue;
            const w = Math.max(4, Math.min(14, (r.widthFt * 0.3048 * 2 ** (z - 12)) / 9));
            L.polyline([e.a, e.b], { color: /GR|TURF/i.test(r.surface) ? '#66bb6a' : '#eceff1', weight: w, opacity: 0.9, interactive: false, dashArray: e.approx ? '6 4' : undefined }).addTo(g);
          }
        }
        // Veröffentlichte Platzrunden und An-/Abflugrouten (openflightmaps) ab Zoom 10
        if (z >= 10) {
          for (const p of getDetailsSync(f.icao)?.procs ?? []) {
            if (p.usage === 'HELICOPTER') continue;
            const circ = p.kind === 'circuit';
            if (circ ? !showRef.current.circuits : !showRef.current.routes) continue;
            const style: L.PolylineOptions =
              p.kind === 'circuit'
                ? { color: '#ffab00', weight: 3 }
                : p.kind === 'transit'
                  ? { color: '#b388ff', weight: 2, dashArray: '4 6' }
                  : p.kind === 'hold'
                    ? { color: '#e040fb', weight: 2, dashArray: '2 5' }
                    : { color: '#e040fb', weight: 2.5, dashArray: '8 6' };
            L.polyline(p.coords, { ...style, opacity: 0.95, interactive: false }).addTo(g);
            if ((circ && z >= 11) || z >= 13) {
              const mid = p.coords[Math.floor(p.coords.length / 2)];
              const alt = p.alt ? ' · ' + altLabel(p.alt, unitsRef.current) : '';
              const label = circ ? `${f.icao} ${p.name}${p.rwys?.length ? ' (' + p.rwys.join('/') + ')' : ''}${alt}` : `${p.name}${alt}`;
              L.marker(mid, {
                interactive: false,
                icon: L.divIcon({ className: circ ? 'circuit-label' : 'circuit-label route', html: label, iconSize: [200, 20], iconAnchor: [100, 10] }),
              }).addTo(g);
            }
          }
        }
        // VFR-Meldepunkte (openflightmaps) ab Zoom 10
        if (z >= 10) {
          for (const p of showRef.current.rps ? getDetailsSync(f.icao)?.rps ?? [] : []) {
            L.marker([p.lat, p.lon], {
              interactive: false,
              icon: L.divIcon({
                className: 'rp-icon',
                html: `<span class="rp-tri ${p.mandatory ? 'mrp' : ''}"></span>${z >= 11 ? `<span class="rp-label">${p.id}</span>` : ''}`,
                iconSize: [14, 14],
                iconAnchor: [7, 9],
              }),
            }).addTo(g);
          }
        }
        // großes, unsichtbares Tippziel + sichtbarer Kreis
        L.circleMarker([f.lat, f.lon], { radius: 18, stroke: false, fillOpacity: 0, bubblingMouseEvents: false })
          .on('click', () => setSelField(f))
          .addTo(g);
        L.circleMarker([f.lat, f.lon], { radius: 6, color: '#00e5ff', weight: 2, fillColor: '#0b1d33', fillOpacity: 0.9, interactive: false })
          .bindTooltip(f.icao, { permanent: z >= 10, direction: 'right', className: 'af-label' })
          .addTo(g);
      }
    };
    loadDetails().then(drawFields);
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

  // Kartenlayer (Grundkarte + Overlays, inkl. Offline-MBTiles)
  useEffect(() => {
    listMbtiles().then(setMbt).catch(() => setMbt([]));
  }, []);
  useEffect(() => {
    if (!mapRef.current || !mbt) return;
    return applyLayers(mapRef.current, settings, mbt, settings.mapLayer, settings.overlays);
  }, [mbt, settings]);

  // Schematische Platzrunden: für Plätze mit gewählter Landerichtung
  useEffect(() => {
    let alive = true;
    (async () => {
      await loadDetails();
      const icaos = settings.mapShow.circuits ? await listFieldsWithCircuits() : [];
      const g = circuitLayerRef.current;
      if (!alive || !g) return;
      g.clearLayers();
      for (const icao of icaos) {
        const f = getAirfieldsSync().find((a) => a.icao === icao);
        const fd = await getFieldData(icao);
        if (!f || !fd.active) continue;
        const r = getDetailsSync(icao)?.runways.find((x) => x.le === fd.active || x.he === fd.active);
        const e = r && runwayEnds(f, r);
        if (!r || !e) continue;
        const [thr, end] = r.le === fd.active ? [e.a, e.b] : [e.b, e.a];
        const cfg = effectiveCircuit(icao, fd.active, fd.circuits[fd.active]);
        const path = circuitPath(thr, end, cfg);
        L.polyline(path, { color: '#ffab00', weight: 3, dashArray: '10 6', interactive: false }).addTo(g);
        const mid: [number, number] = [(path[3][0] + path[4][0]) / 2, (path[3][1] + path[4][1]) / 2];
        L.marker(mid, {
          interactive: false,
          icon: L.divIcon({ className: 'circuit-label', html: `${icao} ${fd.active} ${cfg.dir === 'L' ? 'links' : 'rechts'}${cfg.altFt ? ' · ' + cfg.altFt : ''}`, iconSize: [160, 20], iconAnchor: [80, 10] }),
        }).addTo(g);
      }
    })();
    return () => {
      alive = false;
    };
  }, [fieldsVer, settings.mapShow.circuits]);

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
    if (!firstFix.current) {
      // erster GPS-Fix: auf Position zoomen
      firstFix.current = true;
      if (map.getZoom() < 10) map.setView(ll, 11, { animate: false });
    } else if (follow) map.panTo(ll, { animate: true, duration: 0.5 });
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
        {/* Antippen schaltet die Einheit um (kt ↔ km/h, ft ↔ m) */}
        <button className="inst" onClick={() => onSettings({ ...settings, units: { ...u, speed: u.speed === 'kt' ? 'kmh' : 'kt' } })}>
          <div className="l">GS</div>
          <div className="v">{Math.round(speedVal(gsKt, u))}<span className="u">{speedUnit(u)}</span></div>
        </button>
        <button className="inst" onClick={() => onSettings({ ...settings, units: { ...u, alt: u.alt === 'ft' ? 'm' : 'ft' } })}>
          <div className="l">ALT (GPS)</div>
          <div className="v">{altFt != null ? (u.alt === 'm' ? Math.round(altVal(altFt, u)) : Math.round(altFt / 10) * 10) : '–'}<span className="u">{altUnit(u)}</span></div>
        </button>
        <div className="inst"><div className="l">VS</div><div className="v">{rec.active ? vsText(vs, u).v : '–'}<span className="u">{vsText(vs, u).unit}</span></div></div>
        <div className="inst"><div className="l">TRK</div><div className="v">{gsKt > 3 ? pad3(trk) : '–'}<span className="u">°</span></div></div>
      </div>

      {dtoInfo && dto && (
        <div className="dto-panel">
          <b>→ {dto.icao}</b> {pad3(dtoInfo.b)}° · {distText(dtoInfo.d, u)}{dtoInfo.ete != null && <> · ETE {fmtDuration(dtoInfo.ete)}</>}
        </div>
      )}

      <div className="side-btns">
        <button className={follow ? 'on' : ''} onClick={() => setFollow(true)} title="Zentrieren">◎</button>
        <button className={trackUp ? 'on' : ''} onClick={() => setTrackUp(!trackUp)} title="Track-Up / North-Up">{trackUp ? '⬆︎' : 'N'}</button>
        <button onClick={() => mapRef.current?.zoomIn()}>＋</button>
        <button onClick={() => mapRef.current?.zoomOut()}>－</button>
        <button
          className={settings.mapShow.circuits || settings.mapShow.routes ? 'on' : ''}
          onClick={() => {
            const on = !(settings.mapShow.circuits || settings.mapShow.routes);
            onSettings({ ...settings, mapShow: { ...settings.mapShow, circuits: on, routes: on } });
          }}
          title="Platzrunden ein/aus"
          aria-label="Platzrunden ein/aus"
        >
          <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden>
            <rect x="5" y="9" width="22" height="14" rx="5" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray={settings.mapShow.circuits || settings.mapShow.routes ? undefined : '3 3'} />
            <path d="M9 16h14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
        </button>
        <button onClick={() => setPickLayer(true)} title="Karten">🗺</button>
      </div>

      {toast && <div key={toast.key} className="toast">{toast.text}</div>}

      <div className="inst-bottom">
        {rec.active && snap ? (
          <span className={`phase ${snap.takeoffPending ? 'ROLLOUT' : snap.phase}`}>{snap.takeoffPending ? 'STARTLAUF' : PHASE_TXT[snap.phase]}{rec.source === 'sim' && ' · SIM'}</span>
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
              Nächster: <b style={{ color: 'var(--text)' }}>{near.field.icao}</b> {pad3(bearing(pos!.lat, pos!.lon, near.field.lat, near.field.lon))}° {distText(near.dist, u)}
            </div>
          )}
        </div>
        <div className="nav-btns">
          <button onClick={() => (dto ? setDto(null) : setPickDto(true))}>{dto ? 'D→ aus' : 'D→'}</button>
          {near && !dto && <button onClick={() => setDto(near.field)} title="Direct-To nächster Platz">NRST</button>}
          {rec.active && <button onClick={() => confirm('Aufzeichnung beenden und Flug speichern?') && recorder.stop()}>■</button>}
          <button className="close-big" onClick={onClose} aria-label="Navi schließen">✕</button>
        </div>
      </div>

      {pickLayer && mbt && (
        <div className="sheet-backdrop" onClick={() => setPickLayer(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <h3>Karte</h3>
              <button className="ghost close-x" onClick={() => setPickLayer(false)}>✕</button>
            </div>
            <h2 className="small muted">GRUNDKARTE</h2>
            {baseSources(settings, mbt).map((b) => (
              <label key={b.id} className="check">
                <input type="radio" checked={settings.mapLayer === b.id} onChange={() => onSettings({ ...settings, mapLayer: b.id })} /> {b.name}
              </label>
            ))}
            <h2 className="small muted">ANZEIGE</h2>
            {(
              [
                ['circuits', 'Platzrunden'],
                ['routes', 'An-/Abflug- und Transitrouten'],
                ['rps', 'VFR-Meldepunkte'],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="check">
                <input type="checkbox" checked={settings.mapShow[k]} onChange={(e) => onSettings({ ...settings, mapShow: { ...settings.mapShow, [k]: e.target.checked } })} /> {label}
              </label>
            ))}
            <h2 className="small muted">OVERLAYS</h2>
            {overlaySources(settings, mbt).map((o) => (
              <label key={o.id} className="check">
                <input
                  type="checkbox"
                  checked={settings.overlays.includes(o.id)}
                  onChange={(e) => onSettings({ ...settings, overlays: e.target.checked ? [...settings.overlays, o.id] : settings.overlays.filter((x) => x !== o.id) })}
                />{' '}
                {o.name}
              </label>
            ))}
            {!settings.openAipKey && <p className="small muted">openAIP-Overlay: API-Key unter Einstellungen → Karten eintragen.</p>}
          </div>
        </div>
      )}
      {selField && (
        <AirfieldSheet
          field={selField}
          openAipKey={settings.openAipKey}
          units={u}
          pos={pos}
          onClose={() => setSelField(null)}
          onDirectTo={(f) => {
            setDto(f);
            setSelField(null);
          }}
          onChanged={() => setFieldsVer((v) => v + 1)}
        />
      )}
      {pickDto && (
        <div className="sheet-backdrop" onClick={() => setPickDto(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <h3>Direct-To</h3>
              <button className="ghost close-x" onClick={() => setPickDto(false)}>✕</button>
            </div>
            <AirfieldSearch onPick={(a) => { setDto(a); setPickDto(false); }} />
          </div>
        </div>
      )}
    </div>
  );
}
