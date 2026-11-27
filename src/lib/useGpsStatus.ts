import { useEffect, useState } from 'react';
import { watchLocation } from './native';

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
    setS({ kind: 'searching' });
    // über die gemeinsame Ortungs-Schicht: nativ = iOS-Ortung (kein „localhost“-Dialog), sonst Browser
    let stop: (() => void) | null = null;
    let alive = true;
    watchLocation(
      (p) => {
        const acc = Math.round(p.acc ?? 999);
        setS(acc <= 25 ? { kind: 'ready', acc } : { kind: 'weak', acc });
      },
      (msg, denied) => setS(denied ? { kind: 'denied' } : msg === 'Kein GPS verfügbar' ? { kind: 'unavailable', msg: 'Kein GPS auf diesem Gerät' } : { kind: 'searching' })
    ).then((f) => (alive ? (stop = f) : f()));
    return () => {
      alive = false;
      stop?.();
    };
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
      return { text: 'Standortzugriff verweigert – in den iOS-Einstellungen erlauben', tone: 'bad' };
    case 'unavailable':
      return { text: s.msg, tone: 'bad' };
    default:
      return { text: 'Suche Satelliten …', tone: 'idle' };
  }
}
