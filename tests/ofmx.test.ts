import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { coord, createOfmxParser, parseOfmxText } from '../src/lib/ofmx';

const fx = (n: string) => readFileSync(new URL(`./fixtures/ofmx/${n}`, import.meta.url), 'utf8');

describe('OFMX-Import', () => {
  it('liest Koordinaten', () => {
    expect(coord('51.18945833N')).toBeCloseTo(51.18945833);
    expect(coord('004.46039722E')).toBeCloseTo(4.46039722);
    expect(coord('012.5W')).toBeCloseTo(-12.5);
  });

  it('liest Flugplatz, Pisten, Richtungen mit Platzrundenrichtung und Kontakte', () => {
    const d = parseOfmxText(fx('airport.ofmx'));
    const ap = d.airports['EBAW'];
    expect(ap.name).toBe('ANTWERPEN/DEURNE');
    expect(ap.elevFt).toBe(39);
    expect(ap.lat).toBeCloseTo(51.1894, 3);
    const rwy = ap.runways.find((r) => r.desig === '11/29')!;
    expect(rwy.lenM).toBe(1510);
    expect(rwy.dirs.map((x) => x.desig).sort()).toEqual(['11', '29']);
    expect(rwy.dirs[0].pattern).toBe('E');
    expect(rwy.dirs[0].lat).not.toBeNull();
    expect(ap.addresses.some((a) => a.type === 'URL')).toBe(true);
    expect(d.meta.effective).toContain('2018');
  });

  it('liefert gleiches Ergebnis unabhängig von der Stückelung', () => {
    const text = fx('airport.ofmx');
    const a = parseOfmxText(text);
    // sehr kleine Stücke erzwingen Elemente über Stückgrenzen hinweg
    const p = createOfmxParser();
    for (let i = 0; i < text.length; i += 37) p.push(text.slice(i, i + 37));
    const b = p.finish('ofmx');
    expect(JSON.stringify(b.airports)).toBe(JSON.stringify(a.airports));
  });

  it('ordnet VFR-Meldepunkte und Frequenzen dem Platz zu', () => {
    const ahp = (id: string) => `<Ahp><AhpUid><codeId>${id}</codeId></AhpUid><OrgUid><txtName>X</txtName></OrgUid><txtName>${id} TEST</txtName><codeType>AD</codeType><geoLat>48.5N</geoLat><geoLong>007.6E</geoLong><valElev>500</valElev><uomDistVer>FT</uomDistVer></Ahp>`;
    const text = ahp('LFMV') + ahp('LFST') + fx('navigational_aid.ofmx') + fx('organisation.ofmx');
    const d = parseOfmxText(text);
    const lfmv = d.airports['LFMV'];
    expect(lfmv.rps.length).toBeGreaterThan(0);
    expect(lfmv.rps.some((r) => r.mandatory)).toBe(true);
    const lfst = d.airports['LFST'];
    expect(lfst.freqs.map((f) => f.mhz)).toContain('119.575');
    expect(lfst.freqs[0].callsign).toMatch(/STRASBOURG/);
  });
});
