# AI Feature Roadmap

> ⬆ [[Planung & Design]] · [[_INDEX]]
> Geschwister: [[REDESIGN-PROMPT]] · Verknüpft: [[CLAUDE]]

Diese Liste ist unsere gemeinsame Arbeitsgrundlage fuer die naechsten KI- und Planungsverbesserungen.

Rahmen:
- Keine Aenderung der verwendeten KI-Modelle
- Backend moeglichst nicht anfassen
- Fokus auf Frontend, lokale Logik, Scheduler, UX und Erklaerbarkeit

## Bereits verbessert

- [x] Aufgaben nach Projekten gruppieren
- [x] Prioritaeten nachtraeglich manuell aenderbar machen
- [x] Rescheduling bei `Nicht geschafft`
- [x] Auto-Planen robuster machen
- [x] Multi-Block-Scheduling einfuehren
- [x] Projektordner loeschbar machen
- [x] Planungs-Chat als neue Eingabe einfuehren
- [x] Routinen als Vorlagen einbauen
- [x] Schlaf- und Arbeitsweg-Zeiten als optionale blockierende Kalenderbloecke ergaenzen
- [x] Produktkommunikation staerker auf `Kalender AI` ausrichten

## Jetzt bauen

### 1. KI-Priorisierung realistischer machen
- [x] Kalenderkontext in die lokale Priorisierungsdarstellung einbeziehen
- [x] In der UI sichtbar machen, warum ein Task `critical`, `high`, `medium` oder `low` ist
- [x] Klar unterscheiden zwischen `KI-Vorschlag`, `manuell gesetzt` und `durch Deadline-Druck hochgezogen`
- [x] Risiken sichtbar machen: `passt kaum noch vor Deadline`, `blockiert andere Aufgaben`, `braucht Fokuszeit`

### 2. Auto-Planen erklaerbarer machen
- [x] Fuer nicht eingeplante Aufgaben konkrete Gruende anzeigen
- [x] Zwischen `kein Slot`, `Dependency blockiert`, `zu wenig Deep-Work-Fenster` und `Deadline unrealistisch` unterscheiden
- [x] Restaufgaben nach Schweregrad der Planungsprobleme sortieren
- [x] Feedback nach Auto-Planen in der Sidebar besser strukturieren

### 3. Rescheduling weiter verbessern
- [x] Mehrere Rescheduling-Modi einfuehren
- [x] `moeglichst gleiche Uhrzeit`
- [x] `noch heute wenn moeglich`
- [x] `naechster sinnvoller Slot`
- [x] `Rest neu verteilen` fuer laengere Aufgaben
- [x] In der UI anzeigen, wie stark sich der neue Termin vom alten unterscheidet

### 4. Planungs-Chat smarter machen
- [x] Wiederholungen wie `jeden Mittwoch` besser erkennen
- [x] Wochentage und Zeitfenster praeziser parsen
- [x] Besser zwischen `Termin`, `Aufgabe` und `Routine` unterscheiden
- [x] Klar anzeigen, ob etwas direkt terminiert oder nur als Aufgabe angelegt wird
- [x] Chat-Vorschlag mit Begruendung ausgeben: warum genau dieser Slot gewaehlt wurde

### 5. Projektgenerator enger mit Planung koppeln
- [x] Nach Projekt-Erstellung optional direkt erste Terminierung anbieten
- [x] Zu grosse Projekte markieren, wenn der Umfang unplausibel wirkt
- [x] Projekt-Review mit lesbaren Dependencies und besserem Reihenfolgegefuehl verbessern
- [x] Nach Generierung sichtbar machen, welche Aufgaben zuerst wichtig sind

## Danach bauen

### 6. Routinen zu echteren Planungsregeln ausbauen
- [x] Routinen staerker als feste Lebensrhythmen darstellen
- [x] Ausnahmen fuer einzelne Wochen oder Tage ermoeglichen
- [x] Besser mit Schlaf, Arbeitsweg und Arbeitstagen zusammendenken
- [x] Wiederkehrende Muster ueber die aktuellen Vorlagen hinaus erweitern

### 7. Personalisierung vorbereiten
- [x] Lokale Signale sammeln: oft verschoben, oft erledigt, bevorzugte Tageszeiten
- [x] Planungsstil definieren: `entspannt`, `normal`, `aggressiv`, `deadline-first`, `focus-first`
- [x] Spater daraus bessere Slot-Auswahl und Priorisierungsdarstellung ableiten

### 8. Bessere Transparenz in der gesamten KI-UX
- [x] `Warum diese Entscheidung?` als Muster in Sidebar, Chat und Projektgenerator vereinheitlichen
- [x] Hinweise anzeigen, wenn die KI unsicher ist
- [x] Nicht nur Ergebnisse, sondern auch Alternativen sichtbar machen

## Spaeter bauen

### 9. Bild-Import vorbereiten
- [x] Upload-UI fuer Stundenplan oder Screenshot
- [x] Review-Schritt vor dem Uebernehmen
- [x] Feste Termine daraus erzeugen

### 10. Test- und Sicherheitsnetz
- [x] Scheduler-Szenarien systematisch absichern
- [x] Parser-Faelle fuer den Planungs-Chat absichern
- [x] Rescheduling-Edge-Cases absichern
- [x] Regressionen bei Multi-Block-Scheduling verhindern

## Phase 2: Naechste Reifestufe

### 11. Verfuegbarkeit realistischer modellieren
- [x] Zwischen Arbeitszeit, persoenlicher Zeit und sozialer Zeit sauber unterscheiden
- [x] Abend- und Wochenend-Slots bewusst als eigene Verfuegbarkeit pflegbar machen
- [ ] Harte vs. weiche Blocker einfuehren, damit die Planung flexibler reagieren kann
- [x] Im Chat und Scheduler sichtbar machen, ob ein Slot aus Arbeits- oder Freizeitverfuegbarkeit stammt

### 12. Heute-Ansicht und Fokuszentrale bauen
- [x] Eine klare `Heute`-Zusammenfassung mit wichtigsten Aufgaben, Deadlines und freien Bloecken
- [x] Eine sichtbare `Naechster bester Schritt`-Empfehlung einbauen
- [x] Ueberlastung und unrealistische Tage frueh markieren
- [x] One-click Aktionen fuer `heute neu planen`, `fuer morgen schieben`, `kleinere Luecke finden`

### 13. Projektfortschritt und Abschlusslogik verbessern
- [x] Projekte mit echtem Fortschritt, Restaufwand und naechsten Schritten sichtbar machen
- [x] Abgeschlossene Projekte archivieren statt nur loeschen
- [ ] Teilfortschritte und Zwischenstaende bei Aufgaben erlauben
- [ ] Projektgenerator spaeter mit Review nach einigen Tagen koppeln: `Plan war realistisch / zu gross / zu klein`

### 14. Konfliktaufloesung und Planvarianten
- [x] Bei Kollisionen nicht nur `geht nicht`, sondern konkrete Umplan-Optionen anbieten
- [x] Planvarianten vergleichen: `entspannt`, `deadline-first`, `kompakt`, `fokusfreundlich`
- [ ] Niedrig priorisierte Slots bei Bedarf aktiv verdrengen koennen
- [ ] Vor einer groesseren Umplanung eine Vorschau `was sich aendert` anzeigen

### 15. Vertrauen, Verlauf und Nachvollziehbarkeit
- [ ] Eine kleine Historie fuer `was wurde automatisch geplant, verschoben, priorisiert`
- [ ] Undo fuer sensible Aktionen wie Neuplanung oder Projektloeschung
- [ ] Staerkere Dublettenpruefung ueber Chat, Routinen, Import und Kalender hinweg
- [ ] Klarere technische Fehlermeldungen und Sync-Status fuer Kalenderaktionen

### 16. Sprachqualitaet und UI-Konsistenz
- [ ] Sichtbare UI systematisch auf echte Umlaute und sauberes Deutsch umstellen
- [ ] Begriffe ueberall vereinheitlichen: `Aufgabe`, `Termin`, `Routine`, `Planung`, `Prioritaet`
- [ ] Mobile Modals und Sidebars auf Scroll- und Bedienbarkeit pruefen und nachziehen
- [ ] Leere Zustaende, Erfolgsmeldungen und Fehlermeldungen sprachlich hochwertiger machen

## Reihenfolge fuer den naechsten grossen Sprint

1. Verfuegbarkeit realistischer modellieren
2. Heute-Ansicht und Fokuszentrale bauen
3. Konfliktaufloesung und Planvarianten
4. Vertrauen, Verlauf und Nachvollziehbarkeit
5. Sprachqualitaet und UI-Konsistenz

## Notizen

- Schlaf- und Arbeitsweg-Zeiten sind aktuell bewusst ueber Kalenderbloecke geloest, damit die bestehende Logik stabil bleibt.
- Langfristig waere ein natives Regelmodell fuer solche Blocker noch sauberer.
- Wenn wir an einem Punkt doch Backend oder Modelle anfassen muessen, markieren wir das vorher explizit.
- Die erste Roadmap-Phase ist im Kern umgesetzt; die naechste Phase fokussiert jetzt staerker auf Produktreife und Alltagstauglichkeit.
