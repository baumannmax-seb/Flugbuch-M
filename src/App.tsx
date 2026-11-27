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
import RecIcon from './components/RecIcon';
import Home from './components/Home';
import EntryForm from './components/EntryForm';
import { BrandMark, IconHome, IconBook, IconPlane, IconSliders, IconStats } from './components/Icons';

type Tab = 'home' | 'log' | 'fly' | 'stats' | 'settings';

export default function App() {
  const [tab, setTab] = useState<Tab>('home');
  const [editEntry, setEditEntry] = useState<LogEntry | null>(null);
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

  // Darstellung: hell / dunkel / automatisch (System)
  useEffect(() => {
    const t = settings.theme ?? 'auto';
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
    const dark = t === 'dark' || (t === 'auto' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0f2a22' : '#f6efe4');
  }, [settings.theme]);

  const updateSettings = (s: AppSettings) => {
    setSettings(s);
    saveSettings(s);
  };

  if (!ready) return <div className="content muted center">Lade …</div>;

  return (
    <div className="app">
      {/* Marke nur in der Seitenleiste breiter Bildschirme; auf dem iPhone trägt der Startbildschirm das Zeichen */}
      <div className="brand brand-optional">
        <BrandMark size={34} />
        Platzrunde
      </div>
      <div className="header">
        <h1 className={tab === 'home' ? 'home-title' : ''}>
          {tab === 'home' && (
            <>
              <BrandMark size={46} />
              Platzrunde
            </>
          )}
          {tab === 'log' && 'Flugbuch'}
          {tab === 'fly' && 'Fliegen'}
          {tab === 'stats' && 'Auswertung'}
          {tab === 'settings' && 'Einstellungen'}
        </h1>
        <div className="header-actions">
          {rec.active && (
            <button className="rec-pill" onClick={() => setNavOpen(true)}>
              <RecIcon size={18} spinning /> Flug läuft
            </button>
          )}
          {tab === 'log' && (
            <button className="menu-btn" aria-label="Menü" onClick={() => setLogMenu(true)}>⋮</button>
          )}
        </div>
      </div>
      <div className="content">
        {tab === 'home' && (
          <Home
            entries={entries}
            settings={settings}
            rec={rec}
            onStartFlight={() => setTab('fly')}
            onOpenLog={() => setTab('log')}
            onOpenEntry={setEditEntry}
            onOpenMap={() => setNavOpen(true)}
            onOpenNav={() => setNavOpen(true)}
          />
        )}
        {tab === 'log' && (
          <Logbook entries={entries} settings={settings} onChange={reloadEntries} menuOpen={logMenu} onMenuClose={() => setLogMenu(false)} onRecord={() => setTab('fly')} />
        )}
        {tab === 'fly' && <FlyView recorder={recorder} rec={rec} settings={settings} onSettings={updateSettings} onOpenNav={() => setNavOpen(true)} onShowLog={() => setTab('log')} />}
        {tab === 'stats' && <Stats entries={entries} settings={settings} />}
        {tab === 'settings' && <SettingsView settings={settings} onChange={updateSettings} onDataChanged={reloadEntries} recorder={recorder} onOpenNav={() => setNavOpen(true)} />}
      </div>
      <nav className="tabbar">
        {(
          [
            ['home', <IconHome key="h" />, 'Start'],
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
      {editEntry && (
        <EntryForm
          initial={editEntry}
          settings={settings}
          onClose={(changed) => {
            setEditEntry(null);
            if (changed) reloadEntries();
          }}
        />
      )}
      {navOpen && <NavMap recorder={recorder} rec={rec} settings={settings} onSettings={updateSettings} onClose={() => setNavOpen(false)} />}
    </div>
  );
}
