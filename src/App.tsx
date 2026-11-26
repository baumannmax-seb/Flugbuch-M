import { useEffect, useMemo, useRef, useState } from 'react';
import { db, type LogEntry } from './lib/db';
import { loadAirfields } from './lib/airfields';
import { loadOfmx } from './lib/ofmxStore';
import { DEFAULT_APP_SETTINGS, loadSettings, saveSettings, type AppSettings } from './lib/settings';
import { Recorder, type RecorderState } from './lib/recorder';
import Logbook from './components/Logbook';
import FlyView from './components/FlyView';
import Stats from './components/Stats';
import SettingsView from './components/SettingsView';
import NavMap from './components/NavMap';
import { BrandMark, IconBook, IconPlane, IconSliders, IconStats } from './components/Icons';

type Tab = 'log' | 'fly' | 'stats' | 'settings';

export default function App() {
  const [tab, setTab] = useState<Tab>('log');
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [ready, setReady] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [logMenu, setLogMenu] = useState(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const reloadEntries = () => db.listEntries().then(setEntries);

  const recorder = useMemo(() => new Recorder(() => settingsRef.current, () => reloadEntries()), []);
  const [rec, setRec] = useState<RecorderState>(recorder.state);

  useEffect(() => {
    let done = false;
    (async () => {
      const [s] = await Promise.all([loadSettings(), loadAirfields()]);
      await loadOfmx().catch(() => null); // openflightmaps-Daten (falls importiert) einmischen
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

  if (!ready) return <div className="content muted center">Lade …</div>;

  return (
    <div className="app">
      <div className="brand">
        <BrandMark />
        Platzrunde
        {rec.active && (
          <button className="rec-pill" onClick={() => setNavOpen(true)}>
            ● Aufzeichnung
          </button>
        )}
      </div>
      <div className="header">
        <h1>
          {tab === 'log' && 'Flugbuch'}
          {tab === 'fly' && 'Fliegen'}
          {tab === 'stats' && 'Auswertung'}
          {tab === 'settings' && 'Einstellungen'}
        </h1>
        {tab === 'log' && (
          <button className="menu-btn" aria-label="Menü" onClick={() => setLogMenu(true)}>⋮</button>
        )}
      </div>
      <div className="content">
        {tab === 'log' && (
          <Logbook entries={entries} settings={settings} onChange={reloadEntries} menuOpen={logMenu} onMenuClose={() => setLogMenu(false)} onRecord={() => setTab('fly')} />
        )}
        {tab === 'fly' && <FlyView recorder={recorder} rec={rec} settings={settings} onOpenNav={() => setNavOpen(true)} onShowLog={() => setTab('log')} />}
        {tab === 'stats' && <Stats entries={entries} />}
        {tab === 'settings' && <SettingsView settings={settings} onChange={updateSettings} onDataChanged={reloadEntries} />}
      </div>
      <nav className="tabbar">
        {(
          [
            ['log', <IconBook key="b" />, 'Flugbuch'],
            ['fly', <IconPlane key="p" />, 'Fliegen'],
            ['stats', <IconStats key="s" />, 'Auswertung'],
            ['settings', <IconSliders key="e" />, 'Einstellungen'],
          ] as [Tab, JSX.Element, string][]
        ).map(([k, ico, label]) => (
          <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
            {ico}
            <span>{label}</span>
          </button>
        ))}
      </nav>
      {navOpen && <NavMap recorder={recorder} rec={rec} settings={settings} onSettings={updateSettings} onClose={() => setNavOpen(false)} />}
    </div>
  );
}
