/**
 * Brücke zwischen Web-App und nativer iOS-App (Capacitor).
 *
 * - Ortung: In der nativen App über das Plugin „BackgroundGeolocation“ – läuft auch bei
 *   gesperrtem Bildschirm weiter (UIBackgroundModes: location). Im Browser: navigator.geolocation.
 * - Bildschirm anlassen: nativ über KeepAwake, im Browser über die Wake-Lock-API.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import type { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation';
import { KeepAwake } from '@capacitor-community/keep-awake';
import type { GpsPoint } from './flightDetector';

export const isNative = () => Capacitor.isNativePlatform();

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

/** Startet die Ortung; gibt eine Funktion zum Beenden zurück */
export async function watchLocation(onPoint: (p: GpsPoint) => void, onError: (msg: string, denied: boolean) => void, background = false): Promise<() => void> {
  if (isNative()) {
    const id = await BackgroundGeolocation.addWatcher(
      {
        // mit backgroundMessage liefert iOS auch im Hintergrund / bei gesperrtem Bildschirm Positionen
        backgroundMessage: background ? 'Flug wird aufgezeichnet' : undefined,
        backgroundTitle: 'Platzrunde',
        requestPermissions: true,
        stale: false,
        distanceFilter: 0,
      },
      (loc, err) => {
        if (err) {
          onError(err.code === 'NOT_AUTHORIZED' ? 'Standortzugriff verweigert – in den iOS-Einstellungen für Platzrunde „Immer“ erlauben.' : `GPS-Fehler: ${err.message}`, err.code === 'NOT_AUTHORIZED');
          return;
        }
        if (!loc) return;
        onPoint({
          t: loc.time ?? Date.now(),
          lat: loc.latitude,
          lon: loc.longitude,
          alt: loc.altitude,
          speed: loc.speed != null && loc.speed >= 0 ? loc.speed : null,
          track: loc.bearing != null && loc.bearing >= 0 ? loc.bearing : null,
          acc: loc.accuracy,
        });
      }
    );
    return () => {
      BackgroundGeolocation.removeWatcher({ id }).catch(() => {});
    };
  }
  if (!('geolocation' in navigator)) {
    onError('Kein GPS verfügbar', false);
    return () => {};
  }
  const toPoint = (pos: GeolocationPosition): GpsPoint => {
    const c = pos.coords;
    return { t: pos.timestamp, lat: c.latitude, lon: c.longitude, alt: c.altitude, speed: c.speed, track: c.heading != null && !isNaN(c.heading) ? c.heading : null, acc: c.accuracy };
  };
  // sofort die letzte bekannte Position liefern (Anzeige startet nicht leer), danach laufende Updates
  let gotWatch = false;
  navigator.geolocation.getCurrentPosition((pos) => !gotWatch && onPoint(toPoint(pos)), () => {}, { enableHighAccuracy: true, maximumAge: 15000, timeout: 10000 });
  const id = navigator.geolocation.watchPosition(
    (pos) => {
      gotWatch = true;
      onPoint(toPoint(pos));
    },
    (err) => onError(err.code === 1 ? 'Standortzugriff verweigert – bitte in den Einstellungen erlauben.' : `GPS-Fehler: ${err.message}`, err.code === 1),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 }
  );
  return () => navigator.geolocation.clearWatch(id);
}

/** Bildschirm anlassen (Navi); gibt Funktion zum Freigeben zurück */
export async function keepScreenOn(): Promise<() => void> {
  if (isNative()) {
    await KeepAwake.keepAwake().catch(() => {});
    return () => {
      KeepAwake.allowSleep().catch(() => {});
    };
  }
  let lock: { release: () => Promise<void> } | null = null;
  const req = async () => {
    try {
      lock = (await (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen')) ?? null;
    } catch {
      /* nicht unterstützt */
    }
  };
  await req();
  const onVis = () => document.visibilityState === 'visible' && req();
  document.addEventListener('visibilitychange', onVis);
  return () => {
    document.removeEventListener('visibilitychange', onVis);
    lock?.release().catch(() => {});
  };
}
