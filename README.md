# Platzrunde ✈️ – Flugbuch & Navi

**Platzrunde** ist ein digitales Flugbuch (UL / SEP) mit **GPS-Aufzeichnung**, **automatischer Erkennung von Start, Landung,
Touch-and-Go und Full-Stop** – ohne etwas tippen zu müssen – und einem **Vollbild-Navi (Moving Map)**.

> Status: Draft / Prototyp als Web-App (PWA). Läuft im Browser auf iPhone, Android und Desktop und lässt
> sich auf dem iPhone über „Zum Home-Bildschirm“ wie eine App installieren. Später: native iOS-App (siehe Roadmap).

## Funktionen

| Bereich | Was geht schon |
|---|---|
| **Flugbuch** | Einträge mit Datum, Kennzeichen, Muster, Von/Nach, Off-Block/Start/Landung/On-Block, Flug- & Blockzeit, Landungen, Touch-and-Gos, Funktion (PIC / Schulung mit **Fluglehrer** / als FI mit **Flugschüler**), Bemerkungen. Suche, manuelle Einträge, Bearbeiten, CSV-Export (Excel), GPX-Export je Flug |
| **CSV-Import** | Import aus b4takeoff, mein-flugbuch, UL-Flugbuch, Excel o.ä.: Trennzeichen, Zeichensatz, Kopfzeile und Spalten werden automatisch erkannt (deutsche + englische Spaltennamen), Zuordnung vor dem Import prüf- und änderbar, Vorschau, Duplikate werden übersprungen |
| **GPS-Aufzeichnung** | Start drücken, Handy ablegen. Start/Landung/T&G/Full-Stop werden erkannt, Start- und Zielplatz automatisch aus der Flugplatzdatenbank (841 Plätze in DE inkl. UL-Plätzen + Nachbarländer) ermittelt. Nach 2 min Stillstand nach der letzten Landung wird der Flug automatisch gespeichert. Aufzeichnung übersteht ein Neuladen der Seite. |
| **Navi / Moving Map** | Vollbild-Karte mit GS (kt), GPS-Höhe (ft), Vario (fpm), Track (°), Flugzeug-Symbol, geflogener Track, Flugplätze und Pisten auf der Karte, **Platz antippen → Details** (Pisten, Frequenzen, Links, eigene Notizen und Anflugkarten als PDF/Bild), **schematische Platzrunde** je Landerichtung (links/rechts, Abstand, Höhe einstellbar), nächster Platz mit Kurs/Distanz, Direct-To mit Kurs/Distanz/ETE, North-Up/Track-Up, Bildschirm bleibt an (Wake Lock), Meldungen „Start erkannt“, „Touch-and-Go erkannt“ … |
| **Karten** | Grundkarte OpenTopoMap / OpenStreetMap / eigene XYZ-URL, **openAIP-Overlay** (Lufträume, Plätze, Frequenzen – eigener kostenloser API-Key), **Offline-Karten aus MBTiles** (Import aus der Dateien-App, danach ohne Internet nutzbar; transparente Karten automatisch als Overlay, deckende als Grundkarte; über die höchste Zoomstufe wird hochskaliert) |
| **openflightmaps (OFMX)** | Import der OFMX-Datei (auch als ZIP) von openflightmaps.org: exakte Pistenschwellen, **Platzrundenrichtung je Piste** (wird für die Platzrunde automatisch übernommen), **VFR-Meldepunkte** (Pflicht/Bedarf) auf der Karte und im Platzblatt, Frequenzen mit Rufzeichen, Platzhinweise und Telefon. Streaming-Parser, auch für große Regionen. Gültigkeit (AIRAC) wird angezeigt |
| **Auswertung** | Gesamtstunden, Flüge, Landungen, Passagiermitnahme (3 Landungen / 90 Tage), letzte 24 Monate, nach Luftfahrzeug und Jahr |
| **Simulator** | Spielt an einem beliebigen Platz eine Platzrunde mit Touch-and-Go + Full-Stop ab (Zeitraffer bis 30×) – zum Testen am Schreibtisch |
| **Daten** | Alles lokal auf dem Gerät (IndexedDB), offlinefähig, Backup-Export/-Import als JSON |

## So funktioniert die automatische Erkennung

`src/lib/flightDetector.ts` – ein Zustandsautomat nur auf Basis von GPS:

```
AM BODEN ──GS > 35 kt für 3 s──▶ IN DER LUFT
IN DER LUFT ──GS < 25 kt  ODER  (Höhe < 30 ft über Grund & Vario ≈ 0)──▶ AUSROLLEN  (= Landung)
AUSROLLEN ──GS > 35 kt & steigt wieder──▶ IN DER LUFT    ⇒ Landung war Touch-and-Go
AUSROLLEN ──GS < 8 kt für 8 s──▶ AM BODEN                ⇒ Landung war Full-Stop
AM BODEN ──2 min Stillstand nach Landung──▶ Flug beendet, Eintrag wird gespeichert
```

Wichtig für Touch-and-Gos: Bei einem zügigen T&G fällt die Geschwindigkeit oft gar nicht unter die
Landeschwelle. Deshalb wird zusätzlich die **Höhe über Grund** genutzt: Die App misst beim Rollen die
GPS-Höhe am Boden als Referenz (unabhängig vom GPS-Geoid-Fehler) und verschiebt sie für andere Plätze um die
Höhendifferenz laut Flugplatzdatenbank. Alle Schwellen sind unter *Einstellungen* an das eigene
Luftfahrzeug anpassbar. Tests: `npm test`.

## Ausprobieren

Lokal (Node.js 20+ nötig):

```bash
npm install
npm run dev      # öffnet http://localhost:5173 – auch im gleichen WLAN vom Handy erreichbar
npm test         # Tests der Flugerkennung
npm run build    # Produktions-Build nach dist/
```

Auf dem iPhone mit echtem GPS: GPS im Browser funktioniert nur über **HTTPS**. Am einfachsten über
GitHub Pages – der Workflow `.github/workflows/pages.yml` ist schon da:
1. Branch nach `main` mergen
2. Repo → *Settings → Pages → Source: GitHub Actions*
3. URL in Safari öffnen → Teilen → **„Zum Home-Bildschirm“** → startet dann im Vollbild wie eine App

## Grenzen des Web-Drafts (ehrlich)

- **Bildschirm muss an bleiben**: iOS-Safari pausiert GPS, wenn das Display gesperrt wird oder die App im
  Hintergrund ist. Das Navi hält den Bildschirm aktiv (Wake Lock). Echte Hintergrund-Aufzeichnung mit
  gesperrtem Display geht erst mit der nativen iOS-App.
- **MBTiles**: nur Raster (PNG/JPG/WebP), keine Vektor-MBTiles. Beim Import wird die ganze Datei in den
  Arbeitsspeicher geladen – auf dem iPhone daher besser Dateien bis ca. 300 MB (Region/Zoomstufen begrenzen).
- **openAIP-Overlay** braucht Internet (gesehene Kacheln werden gecacht). Die Standard-Kachel-URL ist unter
  *Einstellungen → Karten → Erweitert* änderbar, falls openAIP sie ändert.
- **Höhe** ist GPS-Höhe, keine barometrische Höhe.
- **Platzrunden** sind schematisch aus der Pistenlage erzeugt (OFMX enthält Richtung und Meldepunkte, aber keine Platzrunden-Geometrie) – die veröffentlichten Platzrunden (AIP VFR / DFS) sind nicht frei verfügbar. Richtung/Abstand/Höhe pro Platz selbst einstellen; amtliche Sichtanflugkarte kann je Platz als PDF/Bild hinterlegt werden.
- **Platzdaten** (Pisten, Frequenzen) aus OurAirports – ohne Gewähr, vor dem Flug amtlich prüfen.
- Kein zugelassenes Navigationsgerät – nur zur Unterstützung.

## Roadmap

1. **iOS-App** mit [Capacitor](https://capacitorjs.com): derselbe Code wird in eine native App verpackt
   (Xcode/Mac nötig). Dazu Hintergrund-GPS (`@capacitor-community/background-geolocation`),
   Barometer für Höhe/Vario, Sprachansagen („Touch-and-Go erkannt“).
2. **Karten**: Vektor-MBTiles, Offline-Download einer Region für openAIP, Lufträume als Daten (für Warnungen).
3. **Navi**: Route mit Wegpunkten, Luftraumwarnung, Geländewarnung, horizontale Leiste mit Kursabweichung.
4. **Flugbuch**: Nachtflug, Fluglehrer/Schüler, Unterschrift, PDF-Druck im EASA-Format, Import aus
   anderen Flugbüchern (CSV), Cloud-Sync zwischen Geräten.

## Technik

React + TypeScript + Vite, Leaflet für Karten, sql.js für MBTiles, IndexedDB lokal, Service Worker für Offline.
Flugplatzdaten: [OurAirports](https://ourairports.com/data/) (Public Domain).

```
src/lib/flightDetector.ts   Start/Landung/T&G-Erkennung (Kernlogik, getestet)
src/lib/recorder.ts         GPS/Simulator → Detector → Flugbucheintrag
src/lib/simulator.ts        Platzrunden-Simulation
src/lib/airfields.ts        Flugplatzdatenbank, nächster Platz, Suche
src/lib/db.ts               IndexedDB
src/lib/csvImport.ts        CSV-Import mit Spaltenerkennung (getestet)
src/lib/ofmx.ts             OFMX-Parser (openflightmaps), getestet mit den offiziellen Beispielen
src/lib/airfieldDetails.ts  Pisten, Frequenzen, Platzrunden-Geometrie, eigene Platznotizen
src/lib/mbtiles.ts          MBTiles-Import (sql.js) + Leaflet-Layer aus IndexedDB
src/components/tiles.ts     Kartenquellen (Grundkarten, openAIP, MBTiles)
src/components/NavMap.tsx   Vollbild-Navi / Moving Map
src/components/…            Flugbuch, Eintrag, Fliegen, Auswertung, Einstellungen
tests/                      Vitest-Tests
```
