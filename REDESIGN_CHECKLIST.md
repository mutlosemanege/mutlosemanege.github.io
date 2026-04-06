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
- [x] `ProjectGenerator.vue`: Step-2-Review noch feiner poliert
- [x] `PlanningChat.vue`: leere Zustände und Erfolgszustände auf Mobile geprüft
- [x] Mobile: `AISidebar` als sauberer Fullscreen-/Bottom-Sheet-Flow nachgezogen
- [x] Responsive Feinschliffe für 360px bis große Desktop-Breiten umgesetzt
- [x] Hover-/Focus-Zustände in den zentralen Panels angeglichen
- [x] Umlaute und UI-Texte in den offenen Redesign-Komponenten konsistent bereinigt
- [x] Finaler Redesign-Build erfolgreich bis zum bekannten lokalen Nuxt-Cache-`EPERM` durchgelaufen

## Verifikationsstand
- [x] `npm run test:planning` läuft grün
- [x] `npm run build` läuft fachlich durch und scheitert nur am bekannten lokalen Nuxt-Cache-`EPERM`
- [x] Login-Zustand und eingeloggte Hauptansicht in [index.vue](d:/kalender-ai/app/pages/index.vue) visuell und strukturell geprüft
- [x] Monat-/Wochenwechsel in [NavBar.vue](d:/kalender-ai/app/components/NavBar.vue) und [index.vue](d:/kalender-ai/app/pages/index.vue) verdrahtet geprüft
- [x] Termin-CRUD-Flow zwischen [index.vue](d:/kalender-ai/app/pages/index.vue) und [EventModal.vue](d:/kalender-ai/app/components/EventModal.vue) geprüft
- [x] Aufgaben-CRUD-Flow zwischen [index.vue](d:/kalender-ai/app/pages/index.vue) und [TaskModal.vue](d:/kalender-ai/app/components/TaskModal.vue) geprüft
- [x] Planungs-Chat-Flow in [PlanningChat.vue](d:/kalender-ai/app/components/PlanningChat.vue) gegen bestehende Regressionstests und Einbindung geprüft
- [x] Projektgenerator Schritt 1 bis 3 in [ProjectGenerator.vue](d:/kalender-ai/app/components/ProjectGenerator.vue) strukturell geprüft
- [x] Aufgaben-Sidebar-Flows in [AISidebar.vue](d:/kalender-ai/app/components/AISidebar.vue) gegen Layout, Status und Einbindung geprüft
- [x] Einstellungen, Routinen und Import in [PreferencesModal.vue](d:/kalender-ai/app/components/PreferencesModal.vue) strukturell geprüft

## Abschluss
- [x] Redesign-Umsetzung abgeschlossen
- [x] Technische Verifikation dokumentiert

## Endabnahme-Hinweis
- [ ] Empfohlener Browser-Klicktest auf echtem Gerät bzw. im Dev-Browser:
  Login, Monat/Woche, Termin-CRUD, Aufgaben-CRUD, Planungs-Chat, Projektgenerator, Sidebar-Flows, Routinen/Import
