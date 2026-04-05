// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  ssr: false,
  devServer: {
    host: '0.0.0.0',
  },
  devtools: { enabled: true },
  app: {
    baseURL: (() => {
      const baseUrl = process.env.NUXT_PUBLIC_BASE_URL
      if (baseUrl) {
        try {
          const url = new URL(baseUrl)
          return url.pathname.endsWith('/') ? url.pathname : url.pathname + '/'
        } catch {
          return '/'
        }
      }
      return '/'
    })(),
    head: {
      title: 'Kalender',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Google Kalender Web-App' }
      ],
      script: [
        { src: 'https://accounts.google.com/gsi/client', async: true },
        { src: 'https://apis.google.com/js/api.js', async: true }
      ]
    }
  },
  runtimeConfig: {
    public: {
      googleClientId: process.env.NUXT_PUBLIC_GOOGLE_CLIENT_ID,
      googleCalendarId: process.env.NUXT_PUBLIC_GOOGLE_CALENDAR_ID || 'primary',
      aiEnabled: process.env.NUXT_PUBLIC_AI_ENABLED || 'true'
    }
  },
  modules: ['@nuxtjs/tailwindcss']
})
