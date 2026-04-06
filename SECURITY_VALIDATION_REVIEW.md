# Security And Validation Review

Stand: 2026-04-06

Diese Notiz dokumentiert die lokalen Haertungen aus Phase 3, ohne Backend oder Modellwahl zu aendern.

## Umgesetzte Risiken und Gegenmassnahmen

### 1. Uebergrosse Chat-Eingaben
- Bereich: `PlanningChat.vue`
- Risiko: Sehr lange Prompts koennen Parser, UI und spaetere Kalendertexte unnötig aufblasen.
- Gegenmassnahme:
  - Eingaben werden lokal auf `600` Zeichen begrenzt.
  - Der Prompt wird vor der Planung normalisiert.
  - Die UI zeigt die verbleibenden Zeichen an.

### 2. Uebergrosse Projektbeschreibungen und KI-Ausgaben
- Bereich: `ProjectGenerator.vue`
- Risiko: Riesige Projektbeschreibungen oder ausufernde KI-Ausgaben machen die Review unlesbar und koennen Folgefluesse destabilisieren.
- Gegenmassnahme:
  - Projektbeschreibung lokal auf `2000` Zeichen begrenzt.
  - Projektname und Task-Titel werden gekuerzt und normalisiert.
  - KI-Aufgabenlisten werden auf einen kontrollierten Umfang reduziert.
  - Lange Beschreibungen werden lokal gesaeubert.

### 3. Unsichere oder unpassende Bild-Uploads
- Bereich: `PreferencesModal.vue`
- Risiko: Beliebige Dateien oder sehr grosse Uploads koennen den Import-Flow unnoetig belasten.
- Gegenmassnahme:
  - Nur echte Bilddateien werden angenommen.
  - Uploads groesser als `5 MB` werden blockiert.
  - Import-Reviews werden auf `20` Eintraege pro Durchgang begrenzt.

### 4. Ungepruefte Routine- und Importtexte
- Bereich: `PreferencesModal.vue`
- Risiko: Sehr lange oder kaputte Titel/Beschreibungen laufen in Routinen, Imports und Kalendertexte durch.
- Gegenmassnahme:
  - Titel und Texte werden vor dem Speichern normalisiert und begrenzt.
  - Dieselben Grenzen gelten fuer Routinen und feste Termine aus dem Import.

### 5. Zu rohe Kalenderfehlermeldungen
- Bereich: `useCalendar.ts`
- Risiko: Externe Fehlermeldungen koennen zu technisch oder fuer Nutzer unnoetig verwirrend sein.
- Gegenmassnahme:
  - Kalenderfehler werden jetzt clientseitig in sichere, nutzerfreundliche Meldungen uebersetzt.
  - Typische Faelle wie Auth, Rechte, Rate Limits und Netzwerkprobleme bekommen klare Texte.

## Rest-Risiken

- Die eigentliche Kalender-API und Auth laufen weiterhin ueber externe Google-Fehler und deren Verhalten.
- KI-Ausgaben werden lokal bereinigt, aber nicht serverseitig validiert.
- Ein echtes Security-Audit fuer alle API-Endpunkte und Deploy-Konfigurationen bleibt weiterhin sinnvoll.

## Schnellster weiterer Sicherheitsgewinn

1. Einheitliche Validatoren auch fuer Task-/Event-Modals nutzen.
2. Harte Groessenlimits zentral in einer Datei pflegen und in Tests absichern.
3. Fuer sensible Kalender-Batch-Aktionen noch explizitere Teilfehler- und Recovery-Hinweise einbauen.
