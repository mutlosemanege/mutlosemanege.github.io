# E2E Smoke Checklist

Diese Checkliste deckt die wichtigsten produktiven KI-Hauptpfade der App ab. Ziel ist kein tiefes Testframework, sondern eine schnelle, reproduzierbare Browser-Abnahme nach groesseren Aenderungen.

## Standardszenarien

### Szenario A: Leichter Tag
- Wenige Termine im Kalender
- 3-5 offene Aufgaben
- keine oder nur eine knappe Deadline
- mindestens ein freier Fokusblock

### Szenario B: Enger Tag
- mehrere Termine am selben Tag
- 5-8 offene Aufgaben
- mindestens eine knappe Deadline
- wenig freie Slots

### Szenario C: Projekt mit Dependencies
- neues Projekt mit 4-6 Aufgaben
- mindestens 2 Abhaengigkeiten
- gemischte Dauer und Prioritaeten
- optional Auto-Planung aktiv

## 1. Login und Kalendergrundlage

Setup:
- App im Browser oeffnen
- mit Google verbunden sein

Aktion:
- Hauptseite laden
- zwischen Monat und Woche wechseln

Erwartet:
- Kalender laedt ohne UI-Fehler
- Navigation reagiert
- bestehende Termine sind sichtbar

## 2. Termin-CRUD

Setup:
- Szenario A

Aktion:
- freien Slot anklicken
- Termin erstellen
- Termin erneut oeffnen und bearbeiten
- Termin loeschen

Erwartet:
- Termin erscheint direkt im Kalender
- Aenderung ist nach Bearbeitung sichtbar
- Termin verschwindet nach dem Loeschen

## 3. Task-CRUD

Setup:
- Szenario A oder B

Aktion:
- neue Aufgabe anlegen
- Prioritaet und Dauer aendern
- Aufgabe erneut oeffnen
- Aufgabe loeschen

Erwartet:
- Aufgabe erscheint in der Aufgabenleiste
- Aenderungen bleiben gespeichert
- geloeschte Aufgabe verschwindet aus der Liste

## 4. Planungs-Chat als Termin

Setup:
- Szenario A

Aktion:
- `Treffen mit Bro morgen Abend` eingeben
- Vorschlag suchen
- bei Bedarf Alternative waehlen
- Termin erstellen

Erwartet:
- Typ wird als Termin erkannt
- Vorschlag und Alternativen erscheinen
- Termin landet im Kalender

## 5. Planungs-Chat als Aufgabe

Setup:
- Szenario B

Aktion:
- `2h Videoschnitt naechste Woche vormittags` eingeben
- Vorschlag suchen
- Aufgabe erstellen

Erwartet:
- Typ wird als Aufgabe erkannt
- Aufgabe wird mit oder ohne direkten Slot korrekt angelegt
- geplanter Slot erscheint im Kalender, falls vorhanden

## 6. Planungs-Chat als Routine

Setup:
- Szenario A

Aktion:
- `jeden Mittwoch Gym 18 bis 20 Uhr` eingeben
- Routine-Vorschlag erzeugen
- Routine speichern

Erwartet:
- Typ wird als Routine erkannt
- naechste Ausfuehrung wird angezeigt
- Routine erscheint in Planung und Routinen

## 7. Klaerende KI bei Mehrdeutigkeit

Setup:
- Szenario A

Aktion:
- `Treffen Freitag Abend` eingeben
- Vorschlag suchen
- einen Klaerungs-Chip wie `Diesen Freitag`, `Naechsten Freitag` oder eine Uhrzeit anklicken

Erwartet:
- `Kurz klaeren` erscheint
- Prompt wird sichtbar geschaerft
- Vorschlag baut sich passend neu auf

## 8. Auto-Planen mit Vorschau

Setup:
- Szenario B

Aktion:
- Aufgabenleiste oeffnen
- `Auto-Planen` starten
- Vorschau pruefen
- anwenden

Erwartet:
- zuerst erscheint eine Vorschau
- nach Anwenden entstehen Kalenderbloecke
- Restprobleme und Diagnose bleiben sichtbar

## 9. Nicht geschafft -> Review -> Neuplanung

Setup:
- mindestens eine bereits geplante Aufgabe

Aktion:
- Aufgabe auf `Nicht geschafft` setzen
- Modus auswaehlen
- Vorschau pruefen
- anwenden

Erwartet:
- alter Slot bleibt bis zur Bestaetigung erhalten
- nach Anwenden wird sauber neu eingeplant
- Historie/Wiederherstellen enthaelt einen passenden Eintrag

## 10. Projektgenerator mit Planvorschau

Setup:
- Szenario C

Aktion:
- Projektbeschreibung eingeben
- Review pruefen
- Projekt erstellen
- Auto-Plan-Vorschau pruefen
- anwenden oder bewusst ablehnen

Erwartet:
- Aufgaben und Dependencies werden erzeugt
- Vorschau zeigt geplante Bloecke
- nach Anwenden landen die Slots im Kalender

## 11. Wiederherstellen

Setup:
- mindestens eine undo-faehige Aktion aus 8, 9 oder 10

Aktion:
- Bereich `Wiederherstellen` oeffnen
- einen Batch oder Slot-Eintrag wiederherstellen

Erwartet:
- Eintrag ist thematisch gruppiert sichtbar
- Wiederherstellen setzt den vorherigen Zustand zurueck
- Eintrag verschwindet danach aus dem Recovery-Bereich

## 12. Tagesmodus + Abendabschluss + Morgenbrief

Setup:
- Hauptseite offen

Aktion:
- Tagesmodus setzen
- Tagesabschluss mit Chips speichern
- Morgenbrief ansehen

Erwartet:
- Tagesmodus beeinflusst die Fokus-Empfehlung
- Tagesabschluss bleibt lokal erhalten
- Morgenbrief passt sich an die Reflexion an

## Abschluss

Ein Smoke-Durchlauf gilt als erfolgreich, wenn:
- kein Vue-/Nuxt-Fehleroverlay erscheint
- die 12 Hauptpfade ohne Blocker durchlaufen
- Kalender- und Task-Zustand sichtbar konsistent bleiben
- `npm run test:planning` vorher oder nachher gruen ist
