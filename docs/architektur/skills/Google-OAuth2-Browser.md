# Skill: Google OAuth2 im Browser (ohne Backend)

> ⬆ [[00 Skills Übersicht]] · [[../_INDEX]]
> Verknüpft: [[../CLAUDE]] · [[../GOOGLE_SETUP]] · [[../NETLIFY_SETUP]]
> Verwandte Skills: [[Nuxt-Serverless-KI]] · [[IndexedDB-Vue3]]

---

## Was haben wir gebaut?

Vollständige **Google OAuth2 Authentifizierung rein im Browser** — kein Backend-Proxy, kein Server-side Token-Handling. Der Access Token lebt nur im Memory.

**Datei:** `app/composables/useGoogleAuth.ts`

---

## Warum kein Backend für Auth?

- Die App ist primär eine **SPA** — kein persistentes Backend
- OAuth2 PKCE Flow erlaubt sichere Browser-only Auth
- Access Token wird nie in localStorage gespeichert → kein XSS-Risiko
- Einzige Limitation: Kein automatisches Token-Refresh nach ~1h

---

## Wie es funktioniert

### Script-Loading (Polling-Pattern)
Google APIs werden als externe Scripts geladen — nicht als npm-Packages:

```ts
// In nuxt.config.ts
app: {
  head: {
    script: [
      { src: 'https://accounts.google.com/gsi/client', async: true },
      { src: 'https://apis.google.com/js/api.js', async: true }
    ]
  }
}
```

Weil `async`, sind die Scripts nach `onMounted` noch nicht verfügbar. Lösung: **Polling**:

```ts
async function waitForScript(check: () => boolean, timeout = 10000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const interval = setInterval(() => {
      if (check()) { clearInterval(interval); resolve() }
      if (Date.now() - start > timeout) { clearInterval(interval); reject() }
    }, 100)
  })
}

await waitForScript(() => !!window.google?.accounts)
await waitForScript(() => !!window.gapi?.client)
```

### Token-Client initialisieren

```ts
const tokenClient = google.accounts.oauth2.initTokenClient({
  client_id: config.public.googleClientId,
  scope: 'https://www.googleapis.com/auth/calendar',
  callback: (response) => {
    accessToken.value = response.access_token
    isLoggedIn.value = true
  }
})
```

### Login/Logout

```ts
function login() {
  tokenClient.requestAccessToken()  // Öffnet Google Popup
}

function logout() {
  google.accounts.oauth2.revoke(accessToken.value)
  accessToken.value = null
  isLoggedIn.value = false
}
```

---

## Token-Sicherheit

- Token nur in `ref<string | null>` im Memory
- Kein `localStorage.setItem()` jemals
- Bei Page-Reload: User muss sich erneut anmelden (kein "Remember me")
- Token läuft nach ~1h ab → bekannte Limitation, kein Auto-Refresh implementiert

---

## User Profile abrufen

Nach Login: Google People API für Profilbild + Name

```ts
const profile = await gapi.client.request({
  path: 'https://www.googleapis.com/oauth2/v2/userinfo'
})
user.value = { name: profile.name, imageUrl: profile.picture, email: profile.email }
```

---

## Setup-Voraussetzungen

Vollständige Anleitung: [[../GOOGLE_SETUP]]

Kritisch:
1. OAuth2 Client ID als Typ "Webanwendung" erstellen
2. Exakte Origin-URLs in "Autorisierte JavaScript-Quellen" eintragen
3. Kein trailing slash in der URL
