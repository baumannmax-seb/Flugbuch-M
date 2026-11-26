import { useEffect, useMemo, useRef, useState } from 'react';
import { db, type LogEntry } from './lib/db';
import { loadAirfields } from './lib/airfields';
import { DEFAULT_APP_SETTINGS, loadSettings, saveSettings, type AppSettings } from './lib/settings';
import { Recorder, type RecorderState } from './lib/recorder';
import Logbook from './components/Logbook';
import FlyView from './components/FlyView';
import Stats from './components/Stats';
import SettingsView from './components/SettingsView';
import NavMap from './components/NavMap';

type Tab = 'log' | 'fly' | 'stats' | 'settings';

export default function App() {
  const [tab, setTab] = useState<Tab>('log');
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [ready, setReady] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const reloadEntries = () => db.listEntries().then(setEntries);

  const recorder = useMemo(() => new Recorder(() => settingsRef.current, () => reloadEntries()), []);
  const [rec, setRec] = useState<RecorderState>(recorder.state);

  useEffect(() => {
    let done = false;
    (async () => {
      const [s] = await Promise.all([loadSettings(), loadAirfields()]);
      if (done) return;
      setSettings(s);
      settingsRef.current = s;
      await reloadEntries();
      if (!recorder.state.active) await recorder.restore();
      if (recorder.state.active) {
        setTab('fly');
        setNavOpen(true);
      }
      setReady(true);
    })();
    const unsub = recorder.subscribe(setRec);
    return () => {
      done = true;
      unsub();
    };
  }, [recorder]);

  const updateSettings = (s: AppSettings) => {
    setSettings(s);
    saveSettings(s);
  };

  if (!ready) return <div className="content muted">Lade …</div>;

  return (
    <div className="app">
      <div className="header">
        <h1>
          {tab === 'log' && 'Flugbuch'}
          {tab === 'fly' && 'Fliegen'}
          {tab === 'stats' && 'Auswertung'}
          {tab === 'settings' && 'Einstellungen'}
        </h1>
        {rec.active && (
          <button className="primary" onClick={() => setNavOpen(true)}>
            ● Aufzeichnung läuft
          </button>
        )}
      </div>
      <div className="content">
        {tab === 'log' && <Logbook entries={entries} settings={settings} onChange={reloadEntries} />}
        {tab === 'fly' && <FlyView recorder={recorder} rec={rec} settings={settings} onOpenNav={() => setNavOpen(true)} onShowLog={() => setTab('log')} />}
        {tab === 'stats' && <Stats entries={entries} />}
        {tab === 'settings' && <SettingsView settings={settings} onChange={updateSettings} onDataChanged={reloadEntries} />}
      </div>
      <nav className="tabbar">
        {(
          [
            ['log', '📒', 'Flugbuch'],
            ['fly', '✈️', 'Fliegen'],
            ['stats', '📊', 'Auswertung'],
            ['settings', '⚙️', 'Einstellungen'],
          ] as [Tab, string, string][]
        ).map(([k, ico, label]) => (
          <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
            <span className="ico">{ico}</span>
            {label}
          </button>
        ))}
      </nav>
      {navOpen && <NavMap recorder={recorder} rec={rec} settings={settings} onClose={() => setNavOpen(false)} />}
    </div>
  );
}
