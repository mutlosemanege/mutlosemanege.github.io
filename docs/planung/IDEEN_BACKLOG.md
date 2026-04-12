# Ideen-Backlog

> ↑ [[00_Übersicht]] · [[../index]]

Sammlung für neue Produkt-, KI-, UX- und Design-Ideen, die wir später in Ruhe prüfen können.

## Leitplanke

Jede Idee in dieser Datei steht unter derselben Premisse:

1. Bestehende Kernfunktionen dürfen nicht kaputtgehen.
2. Vor jeder Umsetzung prüfen wir Auswirkungen auf Kalender, Aufgaben, KI-Planung, Mobile und bestehende Flows.
3. Ideen werden erst dann umgesetzt, wenn klar ist:
   - was das Ziel ist
   - welche bestehende Funktion betroffen ist
   - wie wir Regressionen vermeiden

## Status-Legende

- `[ ] offen` Idee ist nur gesammelt
- `[-] prüfen` Idee ist sinnvoll, muss aber gegen Doku/Code abgeglichen werden
- `[x] umgesetzt` Idee wurde bewusst eingebaut
- `[~] verworfen` Idee wurde geprüft, aber bewusst nicht umgesetzt

---

## Aktuelle Ideen

### [12.04.26] Einblicke als eigener Raum statt im Home-Screen

**Status:** `[-] prüfen`  
**Kategorie:** Design | Navigation | IA  
**Quelle:** Nutzeridee im laufenden Gespräch

**Idee:**
`Einblicke` soll später nicht mehr als Bereich im Home-Screen auftauchen, sondern als eigener Bereich geöffnet werden.

**Wunschbild:**
- `Home` bleibt ruhig mit `Heute + Kalender`
- `Einblicke` lebt separat
- keine Zerstörung bestehender Analyse-, Forecast- oder Lernfunktionen

**Wichtige Leitplanken:**
- bestehende Einblicke-Inhalte müssen vollständig erreichbar bleiben
- Kalender-Startseite darf nicht unabsichtlich an Funktion verlieren
- bestehende KI-/Analyse-Datenflüsse müssen wiederverwendet werden

**Mögliche saubere Richtungen:**
1. eigener App-Raum innerhalb der SPA
2. Fullscreen-Overlay / Workspace statt Inline-Bereich
3. echte Route erst später, falls die Architektur bewusst geändert wird

**Aktueller Doku-Kontext:**
- Die bestehende Doku bevorzugt aktuell eher `SPA ohne neue Routen`
- Die Fehlerdatei will `Home` langfristig minimalistischer halten
- Diese Idee ist also sinnvoll, aber eine bewusste Richtungsentscheidung

**Prüffragen vor Umsetzung:**
- Reicht ein eigener Workspace innerhalb von `index.vue`?
- Soll `Einblicke` in Rail, Mobile-Nav und Schnellzugriff als eigener Raum auftauchen?
- Müssen `Wochenblick`, `Balance`, `Rückblick`, `Persönliche Signale` dann vollständig dorthin wandern?

---

## Vorlage für neue Ideen

```md
### [DATUM] Kurztitel

**Status:** `[ ] offen`
**Kategorie:** Design | KI | Navigation | Feature | Mobile | Performance
**Quelle:** Nutzeridee | Review | Doku | Test

**Idee:**
Kurz beschreiben, was gewünscht ist.

**Wunschbild:**
- Punkt 1
- Punkt 2

**Leitplanken:**
- Bestehende Funktion A darf nicht kaputtgehen
- Bestehende Funktion B muss erhalten bleiben

**Prüffragen vor Umsetzung:**
- Frage 1
- Frage 2
```

---

*Zurück: [[00_Übersicht]] · [[../index]]*
