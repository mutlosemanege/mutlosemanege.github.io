# Google Cloud Einrichtung fuer kalender-ai

> ⬆ [[Setup & Deployment]] · [[_INDEX]]
> Geschwister: [[README]] · [[NETLIFY_SETUP]]

Diese Anleitung beschreibt Schritt fuer Schritt, wie du Google Cloud konfigurierst, damit die Kalender-App auf die Google Calendar API zugreifen kann.

---

## 1. Google Cloud Projekt erstellen

1. Oeffne die [Google Cloud Console](https://console.cloud.google.com).
2. Klicke oben in der Navigationsleiste auf das Projekt-Dropdown und waehle **Neues Projekt**.
3. Vergib den Projektnamen `kalender-app` (oder einen Namen deiner Wahl).
4. Klicke auf **Erstellen** und warte, bis das Projekt angelegt wurde.
5. Stelle sicher, dass das neue Projekt in der oberen Leiste als aktives Projekt ausgewaehlt ist.

---

## 2. Google Calendar API aktivieren

1. Navigiere im Seitenmenue zu **APIs & Dienste** > **Bibliothek**.
2. Suche in der Suchleiste nach **Google Calendar API**.
3. Klicke auf das Suchergebnis **Google Calendar API**.
4. Klicke auf **Aktivieren**.
5. Warte, bis die API erfolgreich aktiviert wurde. Du wirst automatisch zur API-Uebersicht weitergeleitet.

---

## 3. OAuth2-Zustimmungsbildschirm konfigurieren

1. Navigiere zu **APIs & Dienste** > **OAuth-Zustimmungsbildschirm**.
2. Waehle als User Type **Extern** und klicke auf **Erstellen**.
3. Fuelle die Pflichtfelder aus:
   - **App-Name**: `kalender-app` (oder dein bevorzugter Name)
   - **Support-E-Mail**: Deine E-Mail-Adresse
   - **Entwicklerkontaktinformationen**: Deine E-Mail-Adresse
4. Klicke auf **Speichern**.

> **Hinweis:** Die Google Cloud Console hat seit 2025 ein neues Layout. Die Scopes und Testnutzer befinden sich nicht mehr im Einrichtungs-Wizard, sondern in separaten Tabs.

5. Wechsle zum Tab **Data Access** (Datenzugriff) im linken Menue unter OAuth-Zustimmungsbildschirm.
6. Klicke auf **ADD OR REMOVE SCOPES** (Bereiche hinzufuegen oder entfernen).
7. Suche nach dem Bereich `https://www.googleapis.com/auth/calendar` und waehle ihn aus. Alternativ gib den Scope manuell im Textfeld unter **Manually add scopes** ein.
8. Klicke auf **UPDATE** (Aktualisieren).
9. Wechsle zum Tab **Audience** (Zielgruppe) im linken Menue.
10. Stelle sicher, dass **External** (Extern) als User Type gewaehlt ist.
11. Im Abschnitt **Test users** (Testnutzer) klicke auf **ADD USERS** (Nutzer hinzufuegen).
12. Trage deine eigene Google-E-Mail-Adresse ein (und die Adressen weiterer Personen, die die App testen sollen).
13. Klicke auf **Save** (Speichern).

> **Hinweis:** Solange die App im Teststatus ist, koennen nur die eingetragenen Testnutzer sich anmelden. Fuer eine oeffentliche Nutzung muss die App spaeter verifiziert werden.

---

## 4. OAuth2 Client ID erstellen

1. Navigiere zu **APIs & Dienste** > **Anmeldedaten**.
2. Klicke auf **Anmeldedaten erstellen** > **OAuth-Client-ID**.
3. Waehle als Anwendungstyp **Webanwendung**.
4. Vergib einen Namen, z. B. `kalender-app-web`.
5. Unter **Autorisierte JavaScript-Quellen** fuege folgende URIs hinzu:
   - `http://localhost:3000`
   - `https://<GITHUB_USERNAME>.github.io`
6. Unter **Autorisierte Weiterleitungs-URIs** fuege folgende URIs hinzu:
   - `http://localhost:3000`
   - `https://<GITHUB_USERNAME>.github.io`
7. Klicke auf **Erstellen**.
8. Ein Dialog zeigt dir die **Client-ID** und das **Client-Secret** an. **Notiere dir beide Werte** -- du brauchst sie im naechsten Schritt.

> **Wichtig:** Ersetze `<GITHUB_USERNAME>` durch deinen tatsaechlichen GitHub-Benutzernamen.

---

## 5. Umgebungsvariablen vorbereiten

1. Kopiere die Datei `.env.example` und benenne die Kopie in `.env` um:
   ```bash
   cp .env.example .env
   ```
2. Oeffne die `.env`-Datei und trage deine Werte ein:
   ```
   NUXT_PUBLIC_GOOGLE_CLIENT_ID=deine-client-id-hier-eintragen
   NUXT_PUBLIC_GOOGLE_CALENDAR_ID=primary
   NUXT_PUBLIC_BASE_URL=https://<GITHUB_USERNAME>.github.io/<REPO_NAME>
   ```
   - **NUXT_PUBLIC_GOOGLE_CLIENT_ID**: Die Client-ID aus Schritt 4.
   - **NUXT_PUBLIC_GOOGLE_CALENDAR_ID**: `primary` fuer deinen Hauptkalender, oder die ID eines spezifischen Kalenders.
   - **NUXT_PUBLIC_BASE_URL**: Die URL, unter der die App deployed wird (fuer lokale Entwicklung: `http://localhost:3000`).

Die genaue Struktur findest du in der Datei [`.env.example`](.env.example).

---

## 6. Wichtige Hinweise

- **`.env` niemals committen!** Die Datei `.env` ist bereits in der `.gitignore` eingetragen. Sie enthaelt sensible Daten (Client-ID) und darf nicht in das Repository gelangen.
- **Client-Side Only mit OAuth2 PKCE:** Diese App laeuft vollstaendig im Browser (Client-Side). Die Authentifizierung erfolgt ueber OAuth2 mit PKCE (Proof Key for Code Exchange). Ein Client-Secret wird daher zur Laufzeit nicht benoetigt -- es wird nur die Client-ID verwendet.
- **GitHub Pages URL muss exakt uebereinstimmen:** Die in der Google Cloud Console eingetragene autorisierte JavaScript-Quelle und Weiterleitungs-URI muss genau mit der tatsaechlichen GitHub Pages URL uebereinstimmen. Achte auf korrekte Schreibweise, Gross-/Kleinschreibung und darauf, dass kein abschliessender Schraegstrich (`/`) vorhanden ist, sofern er in der Console nicht angegeben wurde.

---

## Checkliste

Pruefe, ob alle Schritte erledigt sind:

- [ ] Google Cloud Projekt erstellt
- [ ] Google Calendar API aktiviert
- [ ] OAuth2-Zustimmungsbildschirm konfiguriert (Extern)
- [ ] Scope `https://www.googleapis.com/auth/calendar` hinzugefuegt
- [ ] Testnutzer eingetragen
- [ ] OAuth-Client-ID (Webanwendung) erstellt
- [ ] Autorisierte JavaScript-Quellen eingetragen (`localhost` + GitHub Pages)
- [ ] Autorisierte Weiterleitungs-URIs eingetragen (`localhost` + GitHub Pages)
- [ ] Client-ID notiert
- [ ] `.env.example` nach `.env` kopiert und Werte eingetragen
- [ ] `.env` ist in `.gitignore` vorhanden (bereits standardmaessig eingetragen)
