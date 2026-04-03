interface UserProfile {
  name: string
  email: string
  picture: string
}

const isLoggedIn = ref(false)
const userProfile = ref<UserProfile | null>(null)
const accessToken = ref<string | null>(null)
const isLoading = ref(false)
const error = ref<string | null>(null)

let tokenClient: any = null

function waitForScript(check: () => boolean, timeout = 10000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (check()) return resolve()
    const start = Date.now()
    const interval = setInterval(() => {
      if (check()) {
        clearInterval(interval)
        resolve()
      } else if (Date.now() - start > timeout) {
        clearInterval(interval)
        reject(new Error('Script konnte nicht geladen werden'))
      }
    }, 100)
  })
}

async function fetchUserProfile(token: string): Promise<UserProfile> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!res.ok) throw new Error('Profil konnte nicht geladen werden')
  const data = await res.json()
  return {
    name: data.name,
    email: data.email,
    picture: data.picture
  }
}

export function useGoogleAuth() {
  const config = useRuntimeConfig()

  async function initClient() {
    try {
      await waitForScript(() => typeof (window as any).google !== 'undefined' && !!(window as any).google.accounts)

      tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: config.public.googleClientId,
        scope: 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
        callback: async (response: any) => {
          if (response.error) {
            error.value = 'Anmeldung fehlgeschlagen: ' + response.error
            isLoading.value = false
            return
          }
          accessToken.value = response.access_token
          try {
            userProfile.value = await fetchUserProfile(response.access_token)
            isLoggedIn.value = true
            error.value = null
          } catch (e: any) {
            error.value = e.message
          }
          isLoading.value = false
        }
      })
    } catch (e: any) {
      error.value = 'Google-Skript konnte nicht geladen werden. Bitte Seite neu laden.'
    }
  }

  function login() {
    if (!tokenClient) {
      error.value = 'Google-Login noch nicht bereit. Bitte kurz warten.'
      return
    }
    isLoading.value = true
    error.value = null
    tokenClient.requestAccessToken()
  }

  function logout() {
    if (accessToken.value) {
      (window as any).google.accounts.oauth2.revoke(accessToken.value)
    }
    accessToken.value = null
    userProfile.value = null
    isLoggedIn.value = false
    error.value = null
  }

  function getAccessToken(): string | null {
    return accessToken.value
  }

  return {
    isLoggedIn: readonly(isLoggedIn),
    userProfile: readonly(userProfile),
    isLoading: readonly(isLoading),
    error: readonly(error),
    initClient,
    login,
    logout,
    getAccessToken
  }
}
