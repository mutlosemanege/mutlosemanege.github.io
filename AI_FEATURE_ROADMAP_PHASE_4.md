# AI Feature Roadmap Phase 4

Diese Phase setzt nach der abgeschlossenen Phase 3 an und fokussiert sich auf noch mehr Alltagstauglichkeit, persoenliche Steuerung und vertrauensvolle KI-Unterstuetzung.

Rahmen:
- Keine Aenderung der verwendeten KI-Modelle
- Backend weiterhin moeglichst nicht anfassen
- Fokus auf Frontend, lokale Logik, produktive Tagessteuerung und sichere KI-Interaktion

## 23. Tagesmodus statt stiller Vollautomatik
- [x] Einen sichtbaren Tagesmodus fuer `fokussiert`, `entspannt`, `wenig Zeit` und `aufholen` einfuehren
- [x] Tagesmodus direkt in `Heute`-Ansicht und `Naechster bester Schritt` spiegeln
- [x] Tagesmodus lokal auf Fokus-Empfehlung und Slot-Wahl wirken lassen
- [x] Tagesmodus im Aufgabenbereich sprachlich mitfuehren

## 24. Klaerende KI statt stiller Annahmen
- [x] Bei mehrdeutigen Zeitangaben explizite Klaerungs-Chips oder Mini-Nachfragen anbieten
- [x] Zwischen `diesen Freitag` und `naechsten Freitag` noch sichtbarer unterscheiden
- [x] Risikoarme Rueckfragen vor Wochenend- oder Konflikt-Planungen einfuehren

## 25. Abendabschluss und Morgenbrief
- [x] Einen kurzen Tagesabschluss mit `geschafft`, `verschoben`, `unrealistisch` bauen
- [x] Daraus einen Morgenbrief fuer den naechsten Tag ableiten
- [x] Gelerntes Verhalten sichtbarer in konkrete Vorschlaege uebersetzen

## 26. Sicheres Wiederherstellen als eigene Ansicht
- [x] Eine zentrale Wiederherstellen-Ansicht fuer groessere Planungsbatches bauen
- [x] Kalender- und Aufgabenwiederherstellung zusammenfassen statt nur einzelne Undo-Buttons zu zeigen
- [x] Wiederherstellbare Aenderungen zeitlich und thematisch gruppieren

## 27. End-to-End-Absicherung der KI-Flows
- [ ] Komplette KI-Hauptpfade als szenariobasierte Ablauf-Checks dokumentieren
- [ ] Kritische Flows wie Chat -> Termin, Auto-Planen -> Review -> Anwenden, Reschedule -> Review -> Undo absichern
- [ ] Testbare Smoke-Flows fuer den Browser vorbereiten

## Startpunkt

Phase 4 startet mit `Tagesmodus statt stiller Vollautomatik`, weil dieser Schritt die KI fuer den Nutzer sofort greifbarer und steuerbarer macht.
