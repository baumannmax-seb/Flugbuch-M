import { describe, expect, it } from 'vitest';
import { autoMap, buildEntries, parseCsv, parseDuration, parseDate, parseClock } from '../src/lib/csvImport';

describe('CSV-Import', () => {
  it('liest deutsches Semikolon-CSV mit Kopfzeile nach Titelzeile', () => {
    const csv = `Flugbuch Max Mustermann\nDatum;Kennzeichen;Muster;Von;Nach;Startzeit;Landezeit;Flugzeit;Landungen;Fluglehrer;Bemerkungen\n01.05.2024;D-MABC;C42;EDFE;EDFE;10:05;10:47;0:42;3;Hans Meier;"Platzrunden; Wind 260/10"\n02.05.2024;D-MABC;C42;EDFE;EDFZ;14:00;14:35;;1;;\nSumme;;;;;;;1:17;4;;`;
    const p = parseCsv(csv);
    expect(p.delimiter).toBe(';');
    expect(p.headerRow).toBe(1);
    const m = autoMap(p.headers);
    expect(m.takeoff).toBe(5);
    expect(m.landing).toBe(6);
    expect(m.landings).toBe(8);
    const r = buildEntries(p, m, { durationUnit: 'auto', defaultPic: 'Ich' });
    expect(r.entries).toHaveLength(2);
    expect(r.entries[0].role).toBe('DUAL');
    expect(r.entries[0].instructor).toBe('Hans Meier');
    expect(r.entries[0].remarks).toBe('Platzrunden; Wind 260/10');
    expect(r.entries[1].flightMin).toBe(35); // aus Start/Landung berechnet
    expect(r.entries[1].pic).toBe('Ich');
  });

  it('liest englisches Komma-CSV mit Dezimalstunden und ISO-Datum', () => {
    const csv = `Date,Aircraft ID,Aircraft Type,From,To,Total Time,Day Landings,Night Landings,PIC,Remarks\n2023-08-14,D-EFGH,C172,EDDF,EDFM,1.5,1,1,Me,\n`;
    const p = parseCsv(csv);
    const m = autoMap(p.headers);
    const r = buildEntries(p, m, { durationUnit: 'auto', defaultPic: '' });
    expect(r.entries[0].flightMin).toBe(90);
    expect(r.entries[0].landings).toBe(2);
    expect(r.entries[0].aircraftReg).toBe('D-EFGH');
  });

  it('parst Werte robust', () => {
    expect(parseDuration('1:23')).toBe(83);
    expect(parseDuration('1,25')).toBe(75);
    expect(parseDuration('45', 'min')).toBe(45);
    expect(parseDate('31.12.24')?.getFullYear()).toBe(2024);
    expect(parseDate('2024-02-03')?.getMonth()).toBe(1);
    expect(parseClock('1405')).toBe(845);
    expect(parseClock('09:30 UTC')).toBe(570);
  });
});

describe('Re-Import des eigenen CSV-Exports', () => {
  it('ordnet "Start"/"Landung" mit Uhrzeiten als Zeiten zu und liest Minuten', async () => {
    const csv = `Datum;Kennzeichen;Muster;Von;Nach;Off-Block;Start;Landung;On-Block;Flugzeit (min);Blockzeit (min);Landungen;Touch-and-Go;PIC;Funktion;Fluglehrer;Flugschüler;Bemerkungen\n26.11.2026;D-MXYZ;C42;EDFE;EDFZ;11:05;11:06;11:18;11:20;12;15;2;1;Max;DUAL;Anna;;Test`;
    const p = parseCsv(csv);
    const m = autoMap(p.headers, p.rows);
    expect(m.takeoff).toBe(6);
    expect(m.landing).toBe(7);
    expect(m.from).toBe(3);
    expect(m.landings).toBe(11);
    const e = buildEntries(p, m, { durationUnit: 'auto', defaultPic: '' }).entries[0];
    expect(e.flightMin).toBe(12);
    expect(e.blockMin).toBe(15);
    expect(e.role).toBe('DUAL');
    expect(e.instructor).toBe('Anna');
    expect(e.touchAndGos).toBe(1);
  });
});
