# AI Feature Roadmap Phase 3

Diese Phase buendelt die naechsten realen Luecken nach Phase 2. Fokus bleibt auf Frontend, lokaler Logik, Robustheit und Produktreife ohne Modellwechsel.

Rahmen:
- Keine Aenderung der verwendeten KI-Modelle
- Backend moeglichst nicht anfassen
- Fokus auf Recovery, Validierung, Performance und belastbare Planung

## 17. Kalender-Recovery und Sync-Stabilitaet
- [x] Letzte fehlgeschlagene Kalenderaktion lokal merken
- [x] `Erneut versuchen` fuer fehlgeschlagene Kalenderaktionen in den zentralen KI-Flows anbieten
- [ ] Batch-Aktionen robuster gegen Teilfehler machen
- [ ] Lokale Recovery-Hinweise fuer abgebrochene Sync-Sequenzen ergaenzen

## 18. Sicherheits- und Validierungs-Audit
- [x] Eingaben in Chat, Import und Projektgenerator systematisch haerten
- [x] Kalender- und Auth-Flows auf unnoetig sichtbare Fehlermeldungen pruefen
- [x] Client-seitige Grenzen fuer extrem grosse Eingaben und Missbrauchspfade ergaenzen
- [x] Review-Dokument fuer echte Sicherheitsfunde anlegen

## 19. Performance fuer grosse Datenmengen
- [ ] Scheduler bei vielen Tasks und Events profilieren
- [ ] Wiederholte Slot-Berechnungen reduzieren oder cachen
- [ ] Grosse Aufgabenlisten und Projektgruppen auf unnoetige Re-Renders pruefen
- [ ] Langsame Planungsansichten sichtbar mit leichteren Loading-States abfedern

## 20. Planungsqualitaet bei Grenzfaellen
- [ ] Mehrtaegige Termine, ganztagige Events und Randfaelle um Mitternacht gezielt absichern
- [ ] DST-/Zeitzonen-Randfaelle fuer Kalender und Chat-Vorschlaege abdecken
- [ ] Wiederkehrende Routinen mit Ausnahmen und Feiertagen noch staerker zusammendenken
- [ ] Unschaerfen im Chat bei mehrdeutigen Zeitangaben noch klarer machen

## 21. Vertrauenswuerdige Entwurfs- und Recovery-Flows
- [x] Groessere Auto-Planungen optional erst als Vorschau zeigen statt sofort zu schreiben
- [x] Rescheduling zuerst als Vorschau zeigen, bevor der alte Zustand mutiert wird
- [x] Projektgenerator-Autoplan zuerst als Vorschau bestaetigen lassen
- [x] Vor Mehrfachaenderungen eine kompakte Aenderungszusammenfassung anzeigen
- [x] Mehr Undo- und Restore-Pfade fuer Kalender-/Task-Kopplungen ergaenzen
- [x] Historie staerker als echte Wiederherstellungshilfe nutzen

## 22. Wochenblick und Forecast
- [x] Einen kompakten Wochen-Ausblick mit freier Zeit, kritischen Tagen und Deadline-Druck ergaenzen
- [x] Frueh sichtbar machen, an welchen Tagen die Planung kippt oder unrealistisch wird

## Startpunkt

Phase 3 startete mit `Kalender-Recovery und Sync-Stabilitaet` und erweitert sich jetzt um vertrauenswuerdige Vorschau-Flows fuer automatische Planungen und einen fruehen Wochen-Forecast.
