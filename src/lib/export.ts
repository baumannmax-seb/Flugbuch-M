import type { LogEntry, Track } from './db';
import { fmtDate, fmtTime } from './geo';

function download(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

const COLS: [string, (e: LogEntry) => string | number][] = [
  ['Datum', (e) => fmtDate(e.date)],
  ['Kennzeichen', (e) => e.aircraftReg],
  ['Muster', (e) => e.aircraftType],
  ['Von', (e) => e.from],
  ['Nach', (e) => e.to],
  ['Off-Block', (e) => fmtTime(e.offBlock)],
  ['Start', (e) => fmtTime(e.takeoff)],
  ['Landung', (e) => fmtTime(e.landing)],
  ['On-Block', (e) => fmtTime(e.onBlock)],
  ['Flugzeit (min)', (e) => e.flightMin],
  ['Blockzeit (min)', (e) => e.blockMin],
  ['Landungen', (e) => e.landings],
  ['Touch-and-Go', (e) => e.touchAndGos],
  ['PIC', (e) => e.pic],
  ['Funktion', (e) => e.role],
  ['Bemerkungen', (e) => e.remarks],
];

export function exportCsv(entries: LogEntry[]) {
  const esc = (v: string | number) => {
    const s = String(v ?? '');
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [COLS.map((c) => c[0]).join(';'), ...[...entries].reverse().map((e) => COLS.map((c) => esc(c[1](e))).join(';'))];
  // BOM, damit Excel Umlaute korrekt liest
  download(`flugbuch-${new Date().toISOString().slice(0, 10)}.csv`, '﻿' + rows.join('\n'), 'text/csv;charset=utf-8');
}

export function exportGpx(entry: LogEntry, track: Track) {
  const pts = track.points
    .map((p) => `<trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}">${p.alt != null ? `<ele>${p.alt.toFixed(1)}</ele>` : ''}<time>${new Date(p.t).toISOString()}</time></trkpt>`)
    .join('\n');
  const wpts = track.events
    .map((e) => `<wpt lat="${e.lat.toFixed(6)}" lon="${e.lon.toFixed(6)}"><time>${new Date(e.t).toISOString()}</time><name>${e.type === 'takeoff' ? 'Start' : e.kind === 'touch_and_go' ? 'Touch-and-Go' : 'Landung'}</name></wpt>`)
    .join('\n');
  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Flugbuch M" xmlns="http://www.topografix.com/GPX/1/1">
${wpts}
<trk><name>${entry.from}-${entry.to} ${fmtDate(entry.date)}</name><trkseg>
${pts}
</trkseg></trk>
</gpx>`;
  download(`flug-${entry.from}-${entry.to}-${new Date(entry.date).toISOString().slice(0, 10)}.gpx`, gpx, 'application/gpx+xml');
}

export function exportBackup(data: unknown) {
  download(`flugbuch-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data), 'application/json');
}
