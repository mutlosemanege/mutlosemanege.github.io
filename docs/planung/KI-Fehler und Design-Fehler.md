# Fehler & Design-Mängel – Struktur für Bugfixes

Eine strukturierte Sammlung von Fehlern in der Webapp für systematische Fehlerbehebung und Prompt-Entwicklung.

---

## 📋 Vorlage für neue Fehler

```markdown
### [DATUM] – [Kurztitel]

**Kategorie:** KI | Design | Integration | Performance
**Priorität:** 🔴 Kritisch | 🟠 Hoch | 🟡 Mittel | 🟢 Niedrig
**Status:** [ ] offen  [ ] in Bearbeitung  [ ] behoben

**Modul/Funktion:** 
**Fehlertyp:** 

**Beschreibung:**
Konkrete Schritte zum Reproduzieren:
1. Was tut der Nutzer?
2. Was passiert aktuell?
3. Was sollte stattdessen passieren?

**Root Cause (Hypothese):**
(Code, Prompt, Logik, Design-Entscheidung)

**Abhängigkeiten:**
- [ ] Fehler #123 muss zuerst gelöst werden
- [ ] Feature XYZ wird benötigt

**Lösungsansatz:**
Konkrete Schritte zur Behebung

**Test-Kriterien:**
Woran erkennt man, dass der Fehler behoben ist?

**Relevanter Prompt:**
Link oder Referenz zum Debug-Prompt (siehe unten)
```

---

## 🔴 KI-Fehler (Funktionslogik)

### [07.04.26] – Zu-Wenig-Chat-Möglichkeiten

**Kategorie:** KI  
**Priorität:** 🟠 Hoch  
**Status:** [ ] offen  [x] in Bearbeitung  [ ] behoben

**Review 12.04.26:** Zeitangaben wie `heute`, `morgen`, `übermorgen`, `nächste Woche` und viele Datumsformen werden inzwischen erkannt. Offen ist vor allem noch die Frequenzlogik wie `6mal die Woche`, `täglich` oder `Mo-Fr`.

**Modul/Funktion:** KI-Planer (Chat/Prompt-Verarbeitung)  
**Fehlertyp:** Mangelnde Nutzer-Intent-Erkennung

**Beschreibung:**
Der KI-Chat erkennt Nutzer-Eingaben nicht korrekt:
- "heute" (Zeitangabe)
- "6mal die Woche gym mit folgenden Trainingseinheiten" (Häufigkeit + Details)

**Root Cause (Hypothese):**
- Schlechter/zu allgemeiner Prompt
- Oder: Algorithmus statt echtes KI-Modell → dann muss Wörterbuch gebaut werden

**Abhängigkeiten:**
- Klären: Wird ein LLM (Claude/GPT) oder Algorithmus verwendet?

**Lösungsansatz:**
IF LLM:
- Prompt erweitern mit Beispielen für zeitliche Angaben und Häufigkeiten
- System-Prompt mit Trainingsdaten für Routinen anreichern
- Interne Memory-Datei für Nutzermuster

IF Algorithmus:
- Dynamisches Wörterbuch/Synonym-DB aufbauen
- Regex/NLP für Häufigkeiten (6x/Woche, täglich, Mo-Fr, etc.)

**Test-Kriterien:**
- "heute" wird erkannt und richtig verarbeitet
- "6mal Woche + Details" wird in wiederholten Einträgen umgewandelt
- Nutzereingaben triggern korrekte Aktionen

**Relevanter Prompt:**
→ Siehe Abschnitt "Debug-Prompts: KI-Intent-Erkennung"

---

### [07.04.26] – Button "heute" verweist, aber scrollt nicht

**Kategorie:** KI + Design  
**Priorität:** 🟢 Niedrig  
**Status:** [ ] offen  [ ] in Bearbeitung  [x] behoben

**Modul/Funktion:** Header Button "heute"  
**Fehlertyp:** Unvollständige Funktionalität

**Beschreibung:**
Der "heute"-Button zeigt den aktuellen Tag im Kalender, scrollt aber nicht automatisch dorthin.

**Root Cause:**
Schlechter/unvollständiger Prompt bei Implementierung

**Lösungsansatz:**
Button-Click sollte nicht nur den Tag hervorheben, sondern auch:
1. `scrollIntoView()` auf das Element aufrufen
2. UI sanft auf den Tag zentrieren

**Test-Kriterien:**
Button klicken → Kalender scrollt zu aktuellem Tag

---

## 🎨 Design-Fehler & UX-Mängel

### [07.04.26] – Seiten-Layout unklar & überladend

**Kategorie:** Design  
**Priorität:** 🔴 Kritisch  
**Status:** [ ] offen  [x] in Bearbeitung  [ ] behoben

**Review 12.04.26:** Die Seite ist weiterhin reichhaltiger als die ursprüngliche Minimal-Vision. Ein erster Navigations-Cluster wurde aber entschlackt, und Analysebereiche wie `Wochenblick`, `Lebensbereiche` und `Rückblick` hängen jetzt hinter einem gezielten `Einblicke`-Workspace statt immer im Hauptfluss.

**Modul/Funktion:** Gesamt-Seitenlayout  
**Fehlertyp:** Information Architecture

**Beschreibung:**
Die Seite hat zu viele Infos gleichzeitig, ist unintuitiv.
**Vision:** 
- Landing Page: Nur "heute"-Anzeige + Google Kalender
- Seitenleiste (Desktop/Dropdown-Menü Mobile): Alle KI-Funktionen und Features

**Abhängigkeiten:**
- [ ] Header-Redesign muss vorher klar sein
- [ ] Mobile Navigation definieren

**Lösungsansatz:**
1. Landing Page minimalistisch halten (nur Kalender + heutige Anzeige)
2. Alle anderen Funktionen in Navigation auslagern

---

### [07.04.26] – Header hat zu viele Buttons

**Kategorie:** Design  
**Priorität:** 🟠 Hoch  
**Status:** [ ] offen  [x] in Bearbeitung  [ ] behoben

**Review 12.04.26:** Der Header wurde reduziert und die Suche ist jetzt eine eigene Schnellzugriffs-Oberfläche statt eines versteckten Sidebar-Shortcuts. Der größere IA-Umbau bleibt offen, aber der Header ist nicht mehr der Hauptabladeplatz für Nebenfunktionen.

**Modul/Funktion:** Header/Navigation  
**Fehlertyp:** UX-Überladung

**Beschreibung:**
Header sollte nur folgende Elemente enthalten:
- Woche/Monats-Ansicht (Umschaltung)
- Aktueller Monat
- Vor/Zurück-Navigation (je nach Modus)
- Suchleiste
- Account-Menu

**Abhängigkeiten:**
- [ ] Seitenleisten-Struktur muss definiert sein

---

### [07.04.26] – Mobile Scrolling fehlerhaft

**Kategorie:** Design  
**Priorität:** 🟠 Hoch  
**Status:** [ ] offen  [x] in Bearbeitung  [ ] behoben

**Review 12.04.26:** Sticky Header und vertikales Scrolling sind deutlich stabiler als im Ursprungsticket. Offene Restthemen liegen vor allem in der mobilen Gesamt-IA und einzelnen Swipe-/Overflow-Kanten.

**Modul/Funktion:** Mobile-Layout / Responsive Design  
**Fehlertyp:** CSS/Layout-Bug

**Beschreibung:**
Probleme beim mobilen Scrollen:
- Header wird beim Scrollen "gefror" mit Blur-Effekt
- Funktionen verschieben sich horizontal statt fixiert zu bleiben
- Nutzer muss Header anfassen zum Scrollen statt frei zu scrollen

**Root Cause:**
Wahrscheinlich: Falsches CSS für Position/Overflow

**Lösungsansatz:**
- Header mit `position: sticky` oder `position: fixed` + `z-index`
- Body-Overflow richtig konfigurieren
- Kein horizontales Scrollen erlauben

**Test-Kriterien:**
- Vertikales Scrollen funktioniert überall
- Header bleibt sichtbar/fixiert
- Kein Horizontal-Shift beim Scrollen

---

### [07.04.26] – Aufgabenraum-Ansicht auf Mobile unbrauchbar

**Kategorie:** Design  
**Priorität:** 🟠 Hoch  
**Status:** [ ] offen  [ ] in Bearbeitung  [x] behoben

**Review 12.04.26:** Der mobile Aufgabenraum ist inzwischen als eigener Vollbild-/Overlay-Bereich mit eigenem Scrollcontainer umgesetzt.

**Modul/Funktion:** Aufgabenraum (Mobile)  
**Fehlertyp:** Layout-Bug

**Beschreibung:**
Erste Hälfte der Ansicht wird unsichtbar gemacht (Blur), zweite Hälfte scrollt darunter weg.

**Root Cause:**
Wahrscheinlich: `overflow: hidden` oder falsches z-index-Stacking auf Mobile

**Test-Kriterien:**
Aufgabenraum ist auf Mobile vollständig lesbar/nutzbar

---

## 🔗 Integration & Features

### [07.04.26] – Google Kalender nicht synchronisiert

**Kategorie:** Integration  
**Priorität:** 🔴 Kritisch  
**Status:** [ ] offen  [x] in Bearbeitung  [ ] behoben

**Review 12.04.26:** Google Calendar CRUD funktioniert, aber ein echter periodischer Hintergrund-Sync fehlt noch.

**Modul/Funktion:** Google Calendar API / Sync  
**Fehlertyp:** Daten-Sync-Fehler

**Beschreibung:**
Manuell in Google Calendar hinzugefügte Events erscheinen nicht in der Webapp.

**Root Cause:**
- Google Calendar API wird nicht regelmäßig abgefragt
- Oder: Auth-Token ist ungültig
- Oder: Filter/Kalender-Auswahl ist falsch

**Lösungsansatz:**
- Polling-Mechanismus für Calendar-Updates (z.B. alle 5 Minuten)
- Oder: WebSocket/Real-time-Sync via Google API
- Auth-Token-Refresh implementieren

**Test-Kriterien:**
- Event in Google Calendar hinzufügen
- Nach max. 5 min in Webapp sichtbar

---

### [07.04.26] – Google Account-Auswahl nicht möglich

**Kategorie:** Integration  
**Priorität:** 🟠 Hoch  
**Status:** [ ] offen  [x] in Bearbeitung  [ ] behoben

**Review 12.04.26:** Das ursprüngliche Problem wirkt eher wie eine OAuth-/Google-Konfigurationsfrage außerhalb des Repos. Ein echter Account-Switcher in der App fehlt aber weiterhin.

**Modul/Funktion:** Google OAuth/Account-Management  
**Fehlertyp:** Authentifizierung

**Beschreibung:**
Nur ein Google-Account funktioniert, andere bekommen Access Denied.

**Root Cause:**
OAuth-Konfiguration nur für ein spezifisches Konto

**Lösungsansatz:**
- OAuth Consent Screen auf "External" stellen
- Oder: Account-Switcher UI implementieren
- Mehrere Google-Konten in der App-Konfiguration erlauben

---

### [07.04.26] – Deploy-Funktionen für Routinen fehlen

**Kategorie:** KI + Feature  
**Priorität:** 🟠 Hoch  
**Status:** [ ] offen  [x] in Bearbeitung  [ ] behoben

**Review 12.04.26:** Routinen, Schlaf, Arbeitsweg und weitere Regeln können bereits als Planungsblocker und Kalenderblöcke genutzt werden. Ein feinerer Deploy-Flow pro Abschnitt ist noch offen.

**Modul/Funktion:** Routinen & Planungsregeln  
**Fehlertyp:** Feature-Unvollständigkeit

**Beschreibung:**
Routinen-Einträge sollten "deploybar" sein pro Abschnitt mit Checkboxen:
- Arbeitszeit
- Pausenzeit
- Arbeitsweg
- Schlafenszeit

Diese sollten dann intelligent mit anderen Funktionen interagieren:
- Deepwork-Zeiten buchen
- Persönliche Termine planen
- Andere Funktionen nutzen diese Blocks für Planung

**Abhängigkeiten:**
- [ ] KI-Planung muss diese Blöcke verstehen
- [ ] Kalender-Integration muss funktionieren

**Lösungsansatz:**
1. Deploy-Button pro Routinen-Abschnitt
2. Backend: Blöcke als "Constraints" für KI-Planer speichern
3. KI-Planer: Bei Planung diese Blöcke beachten

---

### [07.04.26] – Suchfunktion hat falschen Link

**Kategorie:** Design + Feature  
**Priorität:** 🟡 Mittel  
**Status:** [ ] offen  [ ] in Bearbeitung  [x] behoben

**Review 12.04.26:** Der Suchbutton öffnet jetzt eine eigene Schnellzugriffs- und Suchoberfläche statt direkt den Aufgabenraum.

**Modul/Funktion:** Suchleiste  
**Fehlertyp:** Falsche Navigation

**Beschreibung:**
Suchbutton öffnet direkt Aufgabenraum, statt eine Search-UI zu zeigen.

**Ziel:**
Eigene Such-UI mit:
- Suchfeld
- Ergebnisse: Kalender-Events + Funktionen
- "Weiterleiten"-Button navigiert zur Ressource

**Abhängigkeiten:**
- [ ] Seitenleisten-Struktur

---

### [07.04.26] – KI-Funktionen nicht direkt erreichbar

**Kategorie:** Design + Navigation  
**Priorität:** 🟡 Mittel  
**Status:** [ ] offen  [ ] in Bearbeitung  [x] behoben

**Review 12.04.26:** KI-Planer, Priorisierung, Auto-Planen und Projektgenerator sind jetzt direkt über Schnellzugriff, Desktop-Leiste und Mobile-Navigation erreichbar.

**Modul/Funktion:** Navigation (fehlt)  
**Fehlertyp:** Fehlende Links

**Beschreibung:**
KI-Funktionen sind nur über Aufgabenraum erreichbar:
- KI Projekt-Generator
- Auto-Planer
- KI Priorisierung

Diese sollten direkt über Seitenleiste zugänglich sein.

---

## 🧠 Seitenleisten-Struktur (Desktop + Mobile)

### [07.04.26] – Seitenleiste unvollständig

**Kategorie:** Design  
**Priorität:** 🔴 Kritisch  
**Status:** [ ] offen  [x] in Bearbeitung  [ ] behoben

**Review 12.04.26:** Die globale Navigation ist besser gebündelt, und `Einblicke` bildet jetzt einen ersten separaten Workspace für Analyse- und Lernbereiche. Die Vision einer vollständig ausgebauten Seitenleiste bzw. Bereichsnavigation ist aber noch nicht komplett erreicht.

**Modul/Funktion:** Seitenleiste/Sidebar + Mobile-Menü  
**Fehlertyp:** Feature-Fehler

**Beschreibung:**
Seitenleiste sollte folgende Funktionen accessible machen:

**Desktop (Sidebar):**
- KI Funktionen (Projekt-Generator, Auto-Planer, Priorisierung)
- Nächster bester Schritt
- Frei-Fokus Blöcke
- Lebensbereiche
- Wochenblick
- Rückblick
- Persönliche Signale
- Was die Planung über dich lernt
- Abschluss
- Morgenbrief

**Mobile (Dropdown-Menü unten):**
- Gleiche Funktionen wie Desktop

**Test-Kriterien:**
Alle Funktionen sind von jeder Seite erreichbar

---

## 🛠️ Debug-Prompts für Fehlerbehebung

### Prompt: KI-Intent-Erkennung verbessern

```
Du bist ein Prompt-Engineer für einen KI-Planer. 

Der aktuelle Chat erkennt folgende Nutzereingaben nicht korrekt:
- Zeitangaben: "heute", "morgen", "nächste Woche"
- Häufigkeiten: "6mal die Woche", "täglich", "Mo-Fr"
- Detailanfragen: "gym mit folgenden Einheiten"

AUFGABE:
1. Schreibe einen verbesserten System-Prompt für den KI-Planer
2. Füge 10 Trainingsbeispiele für diese Fälle hinzu
3. Definiere die erwartete Output-Struktur

Kontext: Der Planer sollte Routinen, Events und Tasks in einem Kalender eintragen.
```

---

### Prompt: Mobile Layout debuggen

```
Ich habe Scroll-Probleme auf Mobile:
- Header wird mit Blur-Effekt "eingefroren"
- Zweite Hälfte scrollt darunter weg
- Nutzer muss Header anfassen zum Scrollen

AUFGABE:
1. Gib mir ein CSS-Audit-Checkliste
2. Zeige häufige Fehler (overflow, position, z-index)
3. Gib korrekten CSS-Code für Sticky Header + freies Scrolling
```

---

### Prompt: Google Calendar Sync implementieren

```
Die Webapp zeigt keine Google Calendar Events.

Anforderungen:
- Manuell hinzugefügte Events in Google Calendar sollen in der Webapp sichtbar sein
- Max. 5 Minuten Verzögerung erlaubt
- OAuth Token sollte automatisch erneuert werden

AUFGABE:
1. Welche Google Calendar API Endpoints brauche ich?
2. Zeig Code für periodisches Polling/Sync
3. Wie handle ich Token-Refresh?
```

---

## 📊 Übersicht: Fehler nach Priorität

| Priorität | Fehler | Abhängigkeiten |
|-----------|--------|-----------------|
| 🔴 Kritisch | Seiten-Layout überladend | Viele andere |
| 🔴 Kritisch | Google Calendar Sync fehlt | API-Integration |
| 🟠 Hoch | KI-Chat erkennt Eingaben nicht | Prompt-Engineering |
| 🟠 Hoch | Mobile Scrolling | CSS-Fix |
| 🟠 Hoch | Header hat zu viele Buttons | Design-Entscheidung |
| 🟠 Hoch | Seitenleiste unvollständig | Navigation überall |
| 🟡 Mittel | Suchfunktion falsch | Design |
| 🟢 Niedrig | "heute"-Button scrollt nicht | Button-Handler |

---

## ✅ Nächste Schritte

1. **Abhängigkeiten klären**: Welche Fehler blockieren andere?
2. **Prioritäten definieren**: Welche zuerst beheben?
3. **Prompts anpassen**: Debug-Prompts für jeden Fehler verfeinern
4. **Tracking**: Welche Fehler sind gelöst?
