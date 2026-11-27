import type { LogEntry } from '../lib/db';
import type { AppSettings } from '../lib/settings';
import { fmtDate, fmtDuration, fmtTime } from '../lib/geo';
import type { RecorderState } from '../lib/recorder';
import AircraftArt, { defaultAircraft } from './AircraftArt';
import RecIcon from './RecIcon';

const DAY = 86400000;

/**
 * Startbildschirm: Flugzeug, wichtigste Kennzahlen, Passagier-Gültigkeit,
 * die letzten Flüge und unten „Flug starten“ (Daumenbereich).
 */
export default function Home({
  entries,
  settings,
  rec,
  onStartFlight,
  onOpenLog,
  onOpenEntry,
  onOpenMap,
  onOpenNav,
}: {
  entries: LogEntry[];
  settings: AppSettings;
  rec: RecorderState;
  onStartFlight: () => void;
  onOpenLog: () => void;
  onOpenEntry: (e: LogEntry) => void;
  onOpenMap: () => void;
  onOpenNav: () => void;
}) {
  const now = Date.now();
  const ac = defaultAircraft(settings);
  const totalMin = entries.reduce((s, e) => s + e.flightMin, 0);
  const totalLdg = entries.reduce((s, e) => s + e.landings, 0);
  const yearMin = entries.filter((e) => new Date(e.date).getFullYear() === new Date().getFullYear()).reduce((s, e) => s + e.flightMin, 0);

  // Passagiermitnahme: 3 Landungen in 90 Tagen; gültig bis = Datum der drittletzten Landung + 90 Tage
  const ldg90 = entries.filter((e) => now - e.date <= 90 * DAY).reduce((s, e) => s + e.landings, 0);
  let acc = 0;
  let third: number | null = null;
  for (const e of [...entries].sort((a, b) => b.date - a.date)) {
    acc += e.landings;
    if (acc >= 3) {
      third = e.date;
      break;
    }
  }
  const paxUntil = third ? third + 90 * DAY : null;
  const paxOk = ldg90 >= 3 && !!paxUntil;
  const paxSoon = paxOk && paxUntil! - now < 14 * DAY;
  const lastFlight = entries[0];
  const recent = entries.slice(0, 3);

  return (
    <div className="fly-page home">
      <div className="home-art">
        <AircraftArt ac={ac ?? { reg: '', type: '' }} />
      </div>

      {entries.length > 0 ? (
        <>
          <div className="kpis">
            <div className="kpi"><div className="v">{fmtDuration(totalMin * 60000)}</div><div className="l">Flugstunden</div></div>
            <div className="kpi"><div className="v">{entries.length}</div><div className="l">Flüge</div></div>
            <div className="kpi"><div className="v">{totalLdg}</div><div className="l">Landungen</div></div>
          </div>

          <div className="home-facts">
            <div className={`fact ${paxOk ? (paxSoon ? 'warn' : 'ok') : 'bad'}`}>
              <span className="dot" />
              <div>
                <b>Passagiere</b>
                <span>{paxOk ? `gültig bis ${fmtDate(paxUntil!)}` : `${ldg90}/3 Landungen in 90 Tagen`}</span>
              </div>
            </div>
            <div className="fact">
              <div>
                <b>{fmtDuration(yearMin * 60000)} h</b>
                <span>in {new Date().getFullYear()}</span>
              </div>
            </div>
            {lastFlight && (
              <div className="fact">
                <div>
                  <b>{Math.max(0, Math.floor((now - lastFlight.date) / DAY))} Tage</b>
                  <span>seit dem letzten Flug</span>
                </div>
              </div>
            )}
          </div>

          <p className="eyebrow" style={{ marginTop: 18 }}>Letzte Flüge</p>
          {recent.map((e) => (
            <div key={e.id} className="entry compact" onClick={() => onOpenEntry(e)}>
              <div className="route">{e.from || '?'} → {e.to || '?'}</div>
              <div className="time">{fmtDuration(e.flightMin * 60000)}</div>
              <div className="meta">{fmtDate(e.date)} · {fmtTime(e.takeoff)} · {e.aircraftReg || '—'}</div>
              <div className="meta" style={{ textAlign: 'right' }}>{e.landings} Ldg</div>
            </div>
          ))}
          <button className="link" style={{ marginTop: 10 }} onClick={onOpenLog}>Ganzes Flugbuch</button>
        </>
      ) : (
        <div className="hero" style={{ display: 'block', paddingTop: 0 }}>
          <h2>Dein erster Flug</h2>
          <p>Starte vor dem Rollen – Start, Landungen, Touch-and-Gos sowie Off- und On-Block werden automatisch erkannt und eingetragen.</p>
        </div>
      )}

      <div className="fly-spacer" />
      <div className="fly-action">
        {rec.active ? (
          <button className="primary action-btn" onClick={onOpenNav}>
            <RecIcon size={34} spinning />
            Flug läuft – Navi öffnen
          </button>
        ) : (
          <button className="primary action-btn" onClick={onStartFlight}>
            <RecIcon size={34} />
            Flug starten
          </button>
        )}
        {!rec.active && (
          <button className="link map-only" onClick={onOpenMap}>Nur Karte ansehen – ohne Aufzeichnung</button>
        )}
      </div>
    </div>
  );
}
