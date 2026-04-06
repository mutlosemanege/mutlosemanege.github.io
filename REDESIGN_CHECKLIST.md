# Redesign Checklist

## Erledigt
- [x] Design-Tokens in [tailwind.config.ts](d:/kalender-ai/tailwind.config.ts) erweitert
- [x] Globale Dark-/Glass-Styles in [main.css](d:/kalender-ai/app/assets/css/main.css) angelegt
- [x] Globales CSS in [nuxt.config.ts](d:/kalender-ai/nuxt.config.ts) eingebunden
- [x] Dunkle App-Basis in [app.vue](d:/kalender-ai/app/app.vue) gesetzt
- [x] Neue Shell in [index.vue](d:/kalender-ai/app/pages/index.vue) mit linker Rail und Mobile-Bottom-Navigation umgesetzt
- [x] Neue Top-Bar in [NavBar.vue](d:/kalender-ai/app/components/NavBar.vue) umgesetzt
- [x] Monatansicht in [CalendarGrid.vue](d:/kalender-ai/app/components/CalendarGrid.vue) redesigniert
- [x] Wochenansicht in [WeekView.vue](d:/kalender-ai/app/components/WeekView.vue) redesigniert
- [x] Event-Badges in [EventItem.vue](d:/kalender-ai/app/components/EventItem.vue) für Dark Mode angepasst
- [x] Deadline-Banner in [DeadlineWarning.vue](d:/kalender-ai/app/components/DeadlineWarning.vue) redesigniert
- [x] Task-Modal in [TaskModal.vue](d:/kalender-ai/app/components/TaskModal.vue) redesigniert
- [x] Event-Modal in [EventModal.vue](d:/kalender-ai/app/components/EventModal.vue) redesigniert
- [x] Planungs-Chat in [PlanningChat.vue](d:/kalender-ai/app/components/PlanningChat.vue) auf Dark-Glass-Look umgestellt
- [x] Projektgenerator in [ProjectGenerator.vue](d:/kalender-ai/app/components/ProjectGenerator.vue) auf Dark-Glass-Look umgestellt
- [x] Desktop: echte [AISidebar.vue](d:/kalender-ai/app/components/AISidebar.vue) als persistente rechte Spalte angedockt
- [x] [AISidebar.vue](d:/kalender-ai/app/components/AISidebar.vue) Header-, Heute- und Aktionsbereich auf Dark-Premium-Look umgestellt
- [x] `AISidebar.vue` komplett auf Premium-Dark-Panel umgezogen
- [x] `PreferencesModal.vue` vollständig an das neue Designsystem angeglichen
- [x] `PreferencesModal.vue`: alle Sektionen visuell vereinheitlicht

## In Arbeit
- [ ] `ProjectGenerator.vue`: Step-2-Review noch feiner polieren
- [ ] `PlanningChat.vue`: leere Zustände und Erfolgszustände auf Mobile prüfen

## Offen
- [ ] Mobile: `AISidebar` als sauberer Fullscreen-/Bottom-Sheet-Flow prüfen
- [ ] Hover-/Focus-Zustände in allen Panels angleichen
- [ ] Responsive Feinschliffe für 360px bis große Desktop-Breiten
- [ ] Umlaute und UI-Texte in allen noch offenen Redesign-Komponenten konsistent prüfen
- [ ] Finaler Redesign-Build- und Klicktest über die wichtigsten Flows

## Test-Check
- [ ] Login-Screen prüfen
- [ ] Monat/Woche wechseln
- [ ] Termin erstellen/bearbeiten/löschen
- [ ] Aufgabe erstellen/bearbeiten/löschen
- [ ] Planungs-Chat: Termin, Aufgabe und Routine testen
- [ ] Projektgenerator Schritt 1 bis 3 testen
- [ ] Aufgaben-Sidebar: Priorisierung, Auto-Planen, Rescheduling, Projektgruppen testen
- [ ] Einstellungen/Routinen/Import testen
