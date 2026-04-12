# Component Template Error Analysis

## Ziel

Diese Analyse dokumentiert den Vue-Templatefehler rund um `PlanningChat.vue` und prüft die zuletzt stark umgebauten Komponenten auf ähnliche Risiken.

Geprüfte Dateien:

- [PlanningChat.vue](d:/kalender-ai/app/components/PlanningChat.vue)
- [ProjectGenerator.vue](d:/kalender-ai/app/components/ProjectGenerator.vue)
- [PreferencesModal.vue](d:/kalender-ai/app/components/PreferencesModal.vue)
- [AISidebar.vue](d:/kalender-ai/app/components/AISidebar.vue)

Zusätzlich betrachtet:

- die letzten relevanten Commits rund um das Redesign
- typische Spuren kaputter Template-Ersetzungen oder abgeschnittener SFC-Blöcke

## Kurzfazit

Der akute Fehler, der die Seite blockiert hat, kam aus [PlanningChat.vue](d:/kalender-ai/app/components/PlanningChat.vue), nicht aus der markierten `Deadline`-Zeile selbst.

Die eigentliche Ursache war ein beschädigter Template-Schlussblock:

- nach einem Redesign-Umbau blieb alter Template-Restcode stehen
- dadurch wurde der Vorschau-Block für `previewTask` zeitweise abgeschnitten oder doppelt
- Vue meldete dann an einer späteren Stelle `Invalid end tag`, obwohl dort nur das erste sichtbare Symptom lag

Die Seite sollte jetzt wieder benutzbar sein, weil dieser kaputte Restblock entfernt wurde.

## Root Cause

Die wahrscheinlichste Root Cause ist eine unsaubere große Template-Ersetzung im Redesign-Schritt.

Dafür sprechen:

1. Die betroffenen Commits direkt vor den Fixes:
   - `65e8882` `feat: redesign planning chat and project generator with checklist tracking`
   - `8039042` `feat: dock ai sidebar on desktop and extend premium redesign panels`
   - danach sofort mehrere Reparatur-Commits nur für `PlanningChat.vue`

2. Das Fehlermuster:
   - nicht ein einzelner falscher Tag
   - sondern abgeschnittener oder verdoppelter Rest zwischen dem eigentlichen `</template>` und späterem Inhalt

3. Das Risikoprofil der Dateien:
   - viele große Vue-SFCs
   - viele inline-`<template v-if>`
   - sehr große Template-Blöcke
   - starke visuelle Umbauten in kurzer Folge

Bei solchen Dateien sind einfache Text-/Regex-Ersetzungen besonders fehleranfällig, weil sie leicht am falschen `</template>` oder im falschen Vorschau-Zweig landen.

## Detail: PlanningChat.vue

Datei:

- [PlanningChat.vue](d:/kalender-ai/app/components/PlanningChat.vue)

### Beobachtung

Im kritischen Vorschau-Bereich für `previewTask` war die Struktur zeitweise beschädigt:

- ein alter Restblock blieb nach dem eigentlichen Komponenten-Template stehen
- dadurch wirkte das `</p>` bei der `Deadline`-Zeile wie ein ungültiger End-Tag
- in Wahrheit war der umgebende Block vorher schon kaputt

### Warum die markierte Zeile nicht die Ursache war

Diese Zeile war semantisch korrekt:

- ein normales `<p>` mit Interpolation
- kein spezieller Vue-Syntaxfehler

Der Fehler trat nur auf, weil der Parser vorher schon aus der Spur geraten war.

### Status

- akuter Parserfehler behoben
- Datei ist wieder parsebar
- `npm run build` läuft fachlich durch

## Detail: ProjectGenerator.vue

Datei:

- [ProjectGenerator.vue](d:/kalender-ai/app/components/ProjectGenerator.vue)

### Beobachtung

Diese Datei ist aktuell die auffälligste Risikostelle nach `PlanningChat`.

Es gibt deutliche Hinweise auf einen teilweise verdoppelten Review-/Done-Bereich:

- der Review-/Done-Flow taucht im unteren Bereich erneut auf
- die Datei ist zwar aktuell nicht der akute Blocker
- sie trägt aber dasselbe Muster wie der frühere `PlanningChat`-Fehler

### Bewertung

- aktuell kein bestätigter Parse-Blocker
- aber hohes strukturelles Risiko
- sehr wahrscheinlich aus demselben Umbaukontext entstanden

### Empfehlung

Den Template-Flow von `ProjectGenerator.vue` gezielt bereinigen, bevor weitere Redesign-Schritte darauf aufbauen.

## Detail: PreferencesModal.vue

Datei:

- [PreferencesModal.vue](d:/kalender-ai/app/components/PreferencesModal.vue)

### Beobachtung

Keine akuten Hinweise auf kaputte Restblöcke oder abgeschnittene SFC-Struktur.

Die Datei ist groß und komplex, aber die Template-Struktur wirkt im Audit grundsätzlich konsistent.

### Bewertung

- kein aktueller Parser-Blocker
- mittleres Risiko nur wegen Dateigröße und vieler Formbereiche

## Detail: AISidebar.vue

Datei:

- [AISidebar.vue](d:/kalender-ai/app/components/AISidebar.vue)

### Beobachtung

Keine Hinweise auf doppelte Template-Reste oder abgeschnittene SFC-Enden.

Die Datei ist funktional sehr komplex, aber strukturell im Audit unauffällig.

### Bewertung

- kein akuter Template-Schaden sichtbar
- Risiko liegt hier eher in UI-/Logik-Komplexität, nicht in kaputten SFC-Grenzen

## Warum das Problem entstanden ist

Wahrscheinliche technische Ursache:

- große visuelle Umbauten in mehreren sehr langen Vue-Dateien
- dabei wurden Template-Blöcke teilweise automatisiert oder halb-manuell ersetzt
- Dateien mit inline-`<template v-if>` sind dafür besonders anfällig
- wenn bei einer Ersetzung nicht exakt der äußere Komponentenblock getroffen wird, bleiben leicht Altfragmente stehen

Kurz gesagt:

Nicht die einzelne Vue-Zeile war fehlerhaft, sondern der umgebende SFC-Block war nach einem Umbau nicht mehr sauber abgeschlossen.

## Risiko-Einschätzung

### Hoch

- [ProjectGenerator.vue](d:/kalender-ai/app/components/ProjectGenerator.vue)

Grund:

- gleiche Umbauphase
- auffällige Wiederholungsmuster im unteren Template-Bereich
- wahrscheinlich noch Altfragmente oder doppelte Abschnitte

### Mittel

- [PreferencesModal.vue](d:/kalender-ai/app/components/PreferencesModal.vue)

Grund:

- sehr groß
- viele Formularzweige
- aber aktuell keine klaren Template-Schäden sichtbar

### Niedrig bis Mittel

- [AISidebar.vue](d:/kalender-ai/app/components/AISidebar.vue)

Grund:

- große Komplexität
- aber kein Hinweis auf beschädigte SFC-Struktur

## Empfohlene nächste Schritte

1. [ProjectGenerator.vue](d:/kalender-ai/app/components/ProjectGenerator.vue) gezielt auf doppelte Review-/Done-Fragmente bereinigen.
2. Danach die riskantesten Redesign-Dateien einmal systematisch gegen doppelte SFC-Reste prüfen.
3. Bei weiteren großen UI-Umbauten keine breitflächigen Template-Ersetzungen ohne anschließenden SFC-Strukturcheck verwenden.

## Verifikation

Nach der Bereinigung von `PlanningChat.vue`:

- `npm run build` läuft fachlich wieder durch
- es bleibt nur der bekannte lokale Nuxt-Cache-`EPERM`
- kein akuter Vue-`Invalid end tag` mehr
