import { useState } from 'react';
import type { Instructor } from '../lib/settings';

/** Auswahl aus hinterlegten Fluglehrern, mit „Anderer …“ als Freitext */
export default function InstructorPicker({ value, instructors, onChange, label = 'Fluglehrer' }: { value: string; instructors: Instructor[]; onChange: (v: string) => void; label?: string }) {
  const known = instructors.some((i) => i.name === value);
  const [other, setOther] = useState(!known && !!value);
  if (!instructors.length || other) {
    return (
      <label>
        {label}
        <input value={value} placeholder="Name" list="fi-list" onChange={(e) => onChange(e.target.value)} />
        <datalist id="fi-list">{instructors.map((i) => <option key={i.name} value={i.name} />)}</datalist>
        {instructors.length > 0 && (
          <button type="button" className="link small" style={{ marginTop: 4 }} onClick={() => { setOther(false); onChange(instructors[0].name); }}>
            aus Liste wählen
          </button>
        )}
      </label>
    );
  }
  return (
    <label>
      {label}
      <select
        value={known ? value : ''}
        onChange={(e) => {
          if (e.target.value === '__other') {
            setOther(true);
            onChange('');
          } else onChange(e.target.value);
        }}
      >
        {!known && <option value="">– wählen –</option>}
        {instructors.map((i) => (
          <option key={i.name} value={i.name}>{i.name}</option>
        ))}
        <option value="__other">Anderer …</option>
      </select>
    </label>
  );
}
