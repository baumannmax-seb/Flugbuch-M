import { useEffect, useState } from 'react';

export type GpsState =
  | { kind: 'searching' }
  | { kind: 'ready'; acc: number }
  | { kind: 'weak'; acc: number }
  | { kind: 'denied' }
  | { kind: 'unavailable'; msg: string };

/** Beobachtet das GPS, solange die Komponente sichtbar ist (z.B. auf „Fliegen“ vor dem Start) */
export function useGpsStatus(enabled: boolean): GpsState {
  const [s, setS] = useState<GpsState>({ kind: 'searching' });
  useEffect(() => {
    if (!enabled) return;
    if (!('geolocation' in navigator)) {
      setS({ kind: 'unavailable', msg: 'Kein GPS auf diesem Gerät' });
      return;
    }
    setS({ kind: 'searching' });
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const acc = Math.round(p.coords.accuracy);
        setS(acc <= 25 ? { kind: 'ready', acc } : { kind: 'weak', acc });
      },
      (e) => setS(e.code === 1 ? { kind: 'denied' } : { kind: 'searching' }),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled]);
  return s;
}

export function GpsStatusText(s: GpsState): { text: string; tone: 'ok' | 'warn' | 'bad' | 'idle' } {
  switch (s.kind) {
    case 'ready':
      return { text: `GPS bereit · ±${s.acc} m`, tone: 'ok' };
    case 'weak':
      return { text: `GPS ungenau · ±${s.acc} m`, tone: 'warn' };
    case 'denied':
      return { text: 'Standortzugriff verweigert – in den iOS-Einstellungen für Safari erlauben', tone: 'bad' };
    case 'unavailable':
      return { text: s.msg, tone: 'bad' };
    default:
      return { text: 'Suche Satelliten …', tone: 'idle' };
  }
}
