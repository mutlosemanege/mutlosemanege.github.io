# Netlify Deployment Einrichtung fuer kalender-ai

Diese Anleitung beschreibt Schritt fuer Schritt, wie du die App von GitHub Pages auf Netlify umstellst. Netlify wird benoetigt, weil die KI-Features Server Routes (Serverless Functions) verwenden, die auf GitHub Pages nicht laufen.

> **Kosten:** Der kostenlose Netlify-Tarif ("Starter") reicht voellig aus. Er beinhaltet 100 GB Bandbreite/Monat, 300 Build-Minuten/Monat und 125.000 Serverless-Function-Aufrufe/Monat.

---

## 1. Netlify-Konto erstellen

1. Oeffne [https://app.netlify.com/signup](https://app.netlify.com/signup).
2. Klicke auf **Sign up with GitHub** -- damit wird dein GitHub-Konto direkt verknuepft.
3. Autorisiere Netlify fuer den Zugriff auf deine GitHub-Repositories.
4. Nach der Anmeldung landest du im Netlify-Dashboard.

---

## 2. Neue Site erstellen (Import aus GitHub)

1. Klicke im Dashboard auf **Add new site** > **Import an existing project**.
2. Waehle **GitHub** als Git-Provider.
3. Waehle das Repository `kalender-ai` aus der Liste.
   - Falls es nicht angezeigt wird: Klicke auf **Configure the Netlify app on GitHub** und erteile Zugriff auf das Repository.
4. Konfiguriere die Build-Einstellungen:
   - **Branch to deploy**: `main`
   - **Build command**: `npm run build`
   - **Publish directory**: `.output/public`
5. Klicke noch **nicht** auf Deploy -- zuerst muessen die Umgebungsvariablen eingetragen werden (Schritt 3).

> **Wichtig:** Wir verwenden `npm run build` statt `npm run generate`, weil wir Server Routes (Serverless Functions) fuer die KI-Features benoetigen. Netlify erkennt Nuxt automatisch und richtet die Serverless Functions ein.

---

## 3. Umgebungsvariablen konfigurieren

1. Klicke im Bereich **Site configuration** (oder unter **Site settings** > **Environment variables**) auf **Add environment variables**.
2. Trage folgende Variablen ein:

| Variable                         | Wert                                 | Beschreibung                                          |
| -------------------------------- | ------------------------------------ | ----------------------------------------------------- |
| `NUXT_PUBLIC_GOOGLE_CLIENT_ID`   | `deine-client-id`                    | Die OAuth2 Client-ID aus der Google Cloud Console     |
| `NUXT_PUBLIC_GOOGLE_CALENDAR_ID` | `primary`                            | Dein Kalender (oder eine spezifische Kalender-ID)     |
| `NUXT_PUBLIC_BASE_URL`           | `https://dein-site-name.netlify.app` | Die Netlify-URL deiner Site                           |
| `ANTHROPIC_API_KEY`              | `sk-ant-api03-...`                   | Dein Claude API-Key (wird NUR serverseitig verwendet) |

3. Klicke auf **Save**.

> **Hinweis:** Die Variable `ANTHROPIC_API_KEY` ist serverseitig und wird niemals an den Browser gesendet. Sie wird nur von den Server Routes (Serverless Functions) verwendet.

---

## 4. Anthropic API-Key erstellen

1. Oeffne [https://console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys).
2. Erstelle ein Konto bei Anthropic, falls du noch keines hast.
3. Klicke auf **Create Key**.
4. Vergib einen Namen, z. B. `kalender-ai-netlify`.
5. Kopiere den Key (beginnt mit `sk-ant-api03-...`).
6. Trage ihn als `ANTHROPIC_API_KEY` in den Netlify-Umgebungsvariablen ein (Schritt 3).

> **Kosten:** Anthropic bietet kein kostenloses Kontingent. Du zahlst nur fuer tatsaechliche API-Nutzung. Mit den Token-sparenden Massnahmen der App (lokale Algorithmen, Haiku-Modell) liegen die Kosten bei normalem Gebrauch bei ca. $1-3/Monat. Du kannst ein Ausgabenlimit in der Anthropic Console setzen.

---

## 5. Site deployen

1. Gehe zurueck zur Site-Uebersicht und klicke auf **Deploy site** (falls noch nicht geschehen).
2. Warte, bis der Build abgeschlossen ist (dauert ca. 1-2 Minuten).
3. Nach erfolgreichem Deploy siehst du die URL deiner Site: `https://dein-site-name.netlify.app`.

---

## 6. Google Cloud OAuth-URIs aktualisieren

Da die App jetzt unter einer neuen URL laeuft, muessen die autorisierten URIs in der Google Cloud Console angepasst werden.

1. Oeffne die [Google Cloud Console](https://console.cloud.google.com).
2. Navigiere zu **APIs & Dienste** > **Anmeldedaten**.
3. Klicke auf deine OAuth-Client-ID (z. B. `kalender-app-web`).
4. Unter **Autorisierte JavaScript-Quellen** fuege hinzu:
   - `https://dein-site-name.netlify.app`
5. Unter **Autorisierte Weiterleitungs-URIs** fuege hinzu:
   - `https://dein-site-name.netlify.app`
6. Klicke auf **Speichern**.

> **Tipp:** Behalte die `http://localhost:3000` Eintraege fuer die lokale Entwicklung bei.

---

## 7. Lokale Entwicklung anpassen

1. Aktualisiere deine lokale `.env`-Datei:
   ```
   NUXT_PUBLIC_GOOGLE_CLIENT_ID=deine-client-id
   NUXT_PUBLIC_GOOGLE_CALENDAR_ID=primary
   NUXT_PUBLIC_BASE_URL=http://localhost:3000
   ANTHROPIC_API_KEY=sk-ant-api03-dein-key-hier
   ```

2. Starte den Entwicklungsserver:
   ```bash
   npm run dev
   ```
   Die Server Routes laufen lokal automatisch mit (Nitro Dev Server).

---

## 8. (Optional) Custom Domain einrichten

1. Gehe in der Netlify-Site zu **Domain management** > **Add a domain**.
2. Trage deine eigene Domain ein (z. B. `kalender.meinedomain.de`).
3. Folge den Anweisungen, um die DNS-Eintraege bei deinem Domain-Provider zu setzen.
4. Netlify stellt automatisch ein SSL-Zertifikat (Let's Encrypt) bereit.
5. **Vergiss nicht**, die neue Domain auch in der Google Cloud Console unter den autorisierten URIs einzutragen.

---

## 9. GitHub Actions Workflow deaktivieren

Da Netlify den Build und das Deployment jetzt uebernimmt, kann der alte GitHub Pages Workflow deaktiviert werden.

**Option A: Datei loeschen**
```bash
rm .github/workflows/deploy.yml
```

**Option B: Workflow deaktivieren (falls du ihn spaeter wieder brauchen koenntest)**
1. Oeffne dein Repository auf GitHub.
2. Gehe zu **Actions** > **Deploy to GitHub Pages**.
3. Klicke auf die drei Punkte (...) und waehle **Disable workflow**.

---

## 10. Netlify-spezifische Konfiguration

Die App benoetigt keine extra `netlify.toml`-Datei. Netlify erkennt Nuxt automatisch und konfiguriert:
- **Build Command**: `npm run build`
- **Publish Directory**: `.output/public`
- **Serverless Functions**: Werden automatisch aus `server/api/` erstellt

Falls du die Konfiguration trotzdem explizit festlegen moechtest, erstelle eine `netlify.toml` im Projektroot:
```toml
[build]
  command = "npm run build"
  publish = ".output/public"

[build.environment]
  NODE_VERSION = "20"
```

---

## Kostenueberblick (Netlify Starter -- kostenlos)

| Ressource | Limit (kostenlos) | Geschaetzte Nutzung |
|---|---|---|
| Bandbreite | 100 GB/Monat | < 1 GB/Monat |
| Build-Minuten | 300/Monat | ~10-20/Monat (bei Pushes) |
| Serverless Functions | 125.000 Aufrufe/Monat | ~150-300/Monat (AI-Calls) |
| Serverless Laufzeit | 100 Std./Monat | < 1 Std./Monat |

> Du bleibst weit unter den kostenlosen Limits. Selbst bei taeglicher Nutzung der KI-Features.

---

## Checkliste

Pruefe, ob alle Schritte erledigt sind:

- [ ] Netlify-Konto erstellt (Sign up with GitHub)
- [ ] Repository `kalender-ai` als neue Site importiert
- [ ] Build-Einstellungen konfiguriert (`npm run build`, `.output/public`)
- [ ] Umgebungsvariablen eingetragen (Google Client ID, Calendar ID, Base URL, Anthropic API Key)
- [ ] Anthropic API-Key erstellt und eingetragen
- [ ] Site erfolgreich deployed
- [ ] Google Cloud OAuth-URIs aktualisiert (neue Netlify-URL hinzugefuegt)
- [ ] Lokale `.env` um `ANTHROPIC_API_KEY` erweitert
- [ ] App unter der Netlify-URL getestet (Login, Kalender laden)
- [ ] (Optional) GitHub Actions Workflow deaktiviert
- [ ] (Optional) Custom Domain eingerichtet

---

## Fehlerbehebung

### "Build failed" bei Netlify
- Pruefe die Build-Logs unter **Deploys** > **Deploy log**
- Haeufigste Ursache: Fehlende Umgebungsvariablen
- Stelle sicher, dass Node.js 20 verwendet wird

### "Nicht angemeldet" / OAuth-Fehler
- Pruefe, ob die Netlify-URL exakt in den autorisierten JavaScript-Quellen und Weiterleitungs-URIs in der Google Cloud Console eingetragen ist
- Kein abschliessender Schraegstrich (`/`) in der URL

### Serverless Functions geben 500-Fehler
- Pruefe, ob `ANTHROPIC_API_KEY` korrekt in den Netlify-Umgebungsvariablen eingetragen ist
- Pruefe die Function-Logs unter **Logs** > **Functions** im Netlify-Dashboard

### AI-Features funktionieren lokal, aber nicht auf Netlify
- Stelle sicher, dass `ANTHROPIC_API_KEY` in den Netlify-Umgebungsvariablen gesetzt ist (nicht nur lokal in `.env`)
- Nach dem Aendern von Umgebungsvariablen muss ein neuer Deploy getriggert werden: **Deploys** > **Trigger deploy** > **Deploy site**
