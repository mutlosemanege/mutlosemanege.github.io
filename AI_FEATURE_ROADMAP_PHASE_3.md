# AI Feature Roadmap Phase 3

> Aktueller Stand: Die verbindliche Phase-3-Richtung wird parallel auch in [AI_FEATURE_ROADMAP.md](d:/kalender-ai/AI_FEATURE_ROADMAP.md) gepflegt.
> Der derzeit aktive Fokus ist `Review vor automatischen Aenderungen`.

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
- [ ] Eingaben in Chat, Import und Projektgenerator systematisch haerten
- [ ] Kalender- und Auth-Flows auf unnoetig sichtbare Fehlermeldungen pruefen
- [ ] Client-seitige Grenzen fuer extrem grosse Eingaben und Missbrauchspfade ergaenzen
- [ ] Review-Dokument fuer echte Sicherheitsfunde anlegen

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
- [x] Vor Mehrfachaenderungen eine kompakte Aenderungszusammenfassung anzeigen
- [ ] Mehr Undo- und Restore-Pfade fuer Kalender-/Task-Kopplungen ergaenzen
- [ ] Historie staerker als echte Wiederherstellungshilfe nutzen

## 22. Wochenblick und Forecast
- [ ] Einen kompakten Wochen-Ausblick mit freier Zeit, kritischen Tagen und Deadline-Druck ergaenzen
- [ ] Frueh sichtbar machen, an welchen Tagen die Planung kippt oder unrealistisch wird

## Startpunkt

## Live-Stand

- [x] `Auto-Planen` zeigt zuerst eine Vorschau
- [x] Planvarianten laufen zuerst ueber eine Vorschau
- [x] Rescheduling (`Nicht geschafft`) laeuft jetzt ebenfalls zuerst ueber eine Vorschau
- [ ] Projektgenerator-Autoplan an dieselbe Review-Stufe anbinden

Phase 3 startete mit `Kalender-Recovery und Sync-Stabilitaet` und erweitert sich jetzt um vertrauenswuerdige Vorschau-Flows fuer automatische Planungen.
