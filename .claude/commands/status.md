# /status — Projektstatus kompakt anzeigen

Gib einen schnellen Überblick über den aktuellen Projektzustand.

## Aufgaben

1. Führe `git status` und `git log --oneline -5` aus.
2. Lies `AI_FEATURE_ROADMAP.md` — zähle offene vs. erledigte Items.
3. Prüfe ob `app/assets/css/main.css` und die neuen Tailwind-Tokens in `tailwind.config.ts` bereits existieren (Redesign-Fortschritt).
4. Gib folgende Zusammenfassung aus:

```
## Projekt: Kalender-AI
Branch: [aktueller Branch]
Letzte Commits: [top 5]
Offene Git-Änderungen: [M/A/D Dateien]

## Roadmap
Erledigt: X / Y Items
Nächster offener Schritt: [...]

## Redesign
Status: [noch nicht gestartet / Phase 1 / Phase 2 / ...]
```

Halte die Ausgabe kurz — maximal 30 Zeilen.
