# AI Feature Roadmap Phase 3

Diese Phase bündelt die nächsten realen Lücken nach Phase 2. Fokus bleibt auf Frontend, lokaler Logik, Robustheit und Produktreife ohne Modellwechsel.

Rahmen:
- Keine Änderung der verwendeten KI-Modelle
- Backend möglichst nicht anfassen
- Fokus auf Recovery, Validierung, Performance und belastbare Planung

## 17. Kalender-Recovery und Sync-Stabilität
- [x] Letzte fehlgeschlagene Kalenderaktion lokal merken
- [x] `Erneut versuchen` für fehlgeschlagene Kalenderaktionen in den zentralen KI-Flows anbieten
- [ ] Batch-Aktionen robuster gegen Teilfehler machen
- [ ] Lokale Recovery-Hinweise für abgebrochene Sync-Sequenzen ergänzen

## 18. Sicherheits- und Validierungs-Audit
- [ ] Eingaben in Chat, Import und Projektgenerator systematisch härten
- [ ] Kalender- und Auth-Flows auf unnötig sichtbare Fehlermeldungen prüfen
- [ ] Client-seitige Grenzen für extrem große Eingaben und Missbrauchspfade ergänzen
- [ ] Review-Dokument für echte Sicherheitsfunde anlegen

## 19. Performance für große Datenmengen
- [ ] Scheduler bei vielen Tasks und Events profilieren
- [ ] Wiederholte Slot-Berechnungen reduzieren oder cachen
- [ ] Große Aufgabenlisten und Projektgruppen auf unnötige Re-Renders prüfen
- [ ] Langsame Planungsansichten sichtbar mit leichteren Loading-States abfedern

## 20. Planungsqualität bei Grenzfällen
- [ ] Mehrtägige Termine, ganztägige Events und Randfälle um Mitternacht gezielt absichern
- [ ] DST-/Zeitzonen-Randfälle für Kalender und Chat-Vorschläge abdecken
- [ ] Wiederkehrende Routinen mit Ausnahmen und Feiertagen noch stärker zusammendenken
- [ ] Unschärfen im Chat bei mehrdeutigen Zeitangaben noch klarer machen

## 21. Vertrauenswürdige Entwurfs- und Recovery-Flows
- [ ] Größere Auto-Planungen optional erst als Vorschau zeigen statt sofort zu schreiben
- [ ] Vor Mehrfachänderungen eine kompakte Änderungszusammenfassung anzeigen
- [ ] Mehr Undo- und Restore-Pfade für Kalender-/Task-Kopplungen ergänzen
- [ ] Historie stärker als echte Wiederherstellungshilfe nutzen

## Startpunkt

Phase 3 startet mit `Kalender-Recovery und Sync-Stabilität`, weil davon Planungs-Chat, Sidebar, Routinen und Import direkt profitieren.
