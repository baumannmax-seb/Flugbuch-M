import { useState } from 'react';
import { searchAirfields, type Airfield } from '../lib/airfields';

export default function AirfieldSearch({ onPick, placeholder = 'Flugplatz suchen (ICAO oder Name)', autoFocus = true }: { onPick: (a: Airfield) => void; placeholder?: string; autoFocus?: boolean }) {
  const [q, setQ] = useState('');
  const res = searchAirfields(q);
  return (
    <div>
      <input autoFocus={autoFocus} value={q} placeholder={placeholder} onChange={(e) => setQ(e.target.value)} />
      <div className="search-list">
        {res.map((a) => (
          <div key={a.icao + a.lat} onClick={() => onPick(a)}>
            <b>{a.icao}</b> {a.name} <span className="muted small">· {a.elevFt} ft</span>
          </div>
        ))}
      </div>
    </div>
  );
}
