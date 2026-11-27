import { useState } from 'react';
import type { AircraftCfg } from '../lib/settings';
import AircraftArt from './AircraftArt';

/** Neues Luftfahrzeug schnell anlegen (z.B. direkt aus dem Hangar auf „Fliegen“) */
export default function AddAircraftSheet({ onClose, onAdd }: { onClose: () => void; onAdd: (a: AircraftCfg) => void }) {
  const [reg, setReg] = useState('');
  const [type, setType] = useState('');
  const ok = reg.trim().length >= 3;
  const save = () => ok && onAdd({ reg: reg.trim().toUpperCase(), type: type.trim() });
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h3>Neues Luftfahrzeug</h3>
          <button className="close-x" onClick={onClose}>✕</button>
        </div>
        <AircraftArt ac={{ reg: reg.trim().toUpperCase() || 'D-M…', type }} />
        <div className="grid2" style={{ marginTop: 12 }}>
          <label>
            Kennzeichen
            <input autoFocus value={reg} placeholder="D-MABC" autoCapitalize="characters" onChange={(e) => setReg(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
          </label>
          <label>
            Muster
            <input value={type} placeholder="z.B. C42, WT9" onChange={(e) => setType(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
          </label>
        </div>
        <p className="small muted" style={{ marginTop: 0 }}>Die Zeichnung wird nach dem Muster gewählt – ändern unter Einstellungen → Luftfahrzeuge.</p>
        <button className="primary big" disabled={!ok} onClick={save}>Anlegen</button>
      </div>
    </div>
  );
}
