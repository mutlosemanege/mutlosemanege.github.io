# AI Feature Roadmap

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
- [ ] Fuer nicht eingeplante Aufgaben konkrete Gruende anzeigen
- [ ] Zwischen `kein Slot`, `Dependency blockiert`, `zu wenig Deep-Work-Fenster` und `Deadline unrealistisch` unterscheiden
- [ ] Restaufgaben nach Schweregrad der Planungsprobleme sortieren
- [ ] Feedback nach Auto-Planen in der Sidebar besser strukturieren

### 3. Rescheduling weiter verbessern
- [ ] Mehrere Rescheduling-Modi einfuehren
- [ ] `moeglichst gleiche Uhrzeit`
- [ ] `noch heute wenn moeglich`
- [ ] `naechster sinnvoller Slot`
- [ ] `Rest neu verteilen` fuer laengere Aufgaben
- [ ] In der UI anzeigen, wie stark sich der neue Termin vom alten unterscheidet

### 4. Planungs-Chat smarter machen
- [ ] Wiederholungen wie `jeden Mittwoch` besser erkennen
- [ ] Wochentage und Zeitfenster praeziser parsen
- [ ] Besser zwischen `Termin`, `Aufgabe` und `Routine` unterscheiden
- [ ] Klar anzeigen, ob etwas direkt terminiert oder nur als Aufgabe angelegt wird
- [ ] Chat-Vorschlag mit Begruendung ausgeben: warum genau dieser Slot gewaehlt wurde

### 5. Projektgenerator enger mit Planung koppeln
- [ ] Nach Projekt-Erstellung optional direkt erste Terminierung anbieten
- [ ] Zu grosse Projekte markieren, wenn der Umfang unplausibel wirkt
- [ ] Projekt-Review mit lesbaren Dependencies und besserem Reihenfolgegefuehl verbessern
- [ ] Nach Generierung sichtbar machen, welche Aufgaben zuerst wichtig sind

## Danach bauen

### 6. Routinen zu echteren Planungsregeln ausbauen
- [ ] Routinen staerker als feste Lebensrhythmen darstellen
- [ ] Ausnahmen fuer einzelne Wochen oder Tage ermoeglichen
- [ ] Besser mit Schlaf, Arbeitsweg und Arbeitstagen zusammendenken
- [ ] Wiederkehrende Muster ueber die aktuellen Vorlagen hinaus erweitern

### 7. Personalisierung vorbereiten
- [ ] Lokale Signale sammeln: oft verschoben, oft erledigt, bevorzugte Tageszeiten
- [ ] Planungsstil definieren: `entspannt`, `normal`, `aggressiv`, `deadline-first`, `focus-first`
- [ ] Spater daraus bessere Slot-Auswahl und Priorisierungsdarstellung ableiten

### 8. Bessere Transparenz in der gesamten KI-UX
- [ ] `Warum diese Entscheidung?` als Muster in Sidebar, Chat und Projektgenerator vereinheitlichen
- [ ] Hinweise anzeigen, wenn die KI unsicher ist
- [ ] Nicht nur Ergebnisse, sondern auch Alternativen sichtbar machen

## Spaeter bauen

### 9. Bild-Import vorbereiten
- [ ] Upload-UI fuer Stundenplan oder Screenshot
- [ ] Review-Schritt vor dem Uebernehmen
- [ ] Feste Termine daraus erzeugen

### 10. Test- und Sicherheitsnetz
- [ ] Scheduler-Szenarien systematisch absichern
- [ ] Parser-Faelle fuer den Planungs-Chat absichern
- [ ] Rescheduling-Edge-Cases absichern
- [ ] Regressionen bei Multi-Block-Scheduling verhindern

## Reihenfolge fuer den naechsten grossen Sprint

1. KI-Priorisierung realistischer machen
2. Auto-Planen erklaerbarer machen
3. Rescheduling mit mehreren Modi
4. Planungs-Chat smarter machen
5. Projektgenerator direkt mit Planung koppeln

## Notizen

- Schlaf- und Arbeitsweg-Zeiten sind aktuell bewusst ueber Kalenderbloecke geloest, damit die bestehende Logik stabil bleibt.
- Langfristig waere ein natives Regelmodell fuer solche Blocker noch sauberer.
- Wenn wir an einem Punkt doch Backend oder Modelle anfassen muessen, markieren wir das vorher explizit.
