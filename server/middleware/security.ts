import { getRequestIP, getHeader, getRequestURL, setResponseHeader } from 'h3'

interface RateLimitEntry {
  count: number
  resetAt: number
}

const rateLimitStore = new Map<string, RateLimitEntry>()

const AI_RATE_LIMIT = 10     // max Anfragen pro Fenster
const AI_WINDOW_MS = 60_000  // 1 Minute

function getAllowedOrigins(): string[] {
  const origins = new Set(['http://localhost:3000', 'http://127.0.0.1:3000'])
  const baseUrl = process.env.NUXT_PUBLIC_BASE_URL
  if (baseUrl) {
    try {
      origins.add(new URL(baseUrl).origin)
    } catch {}
  }
  return [...origins]
}

export default defineEventHandler((event) => {
  const url = getRequestURL(event)

  if (!url.pathname.startsWith('/api/ai/')) return

  // Origin-Check: Wenn der Browser einen Origin-Header sendet, muss er erlaubt sein.
  // Same-Origin-Anfragen ohne Origin-Header werden durchgelassen.
  const origin = getHeader(event, 'origin')
  if (origin) {
    const allowed = getAllowedOrigins()
    if (!allowed.includes(origin)) {
      throw createError({ statusCode: 403, message: 'Forbidden' })
    }
  }

  // Rate Limiting per IP und Endpunkt (Sliding Window)
  // Hinweis: Bei Serverless-Deployments (Netlify Functions) ist dieser Store
  // pro Lambda-Instanz – bietet Schutz auf warm instances, kein globales Limit.
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
  const key = `${ip}:${url.pathname}`
  const now = Date.now()

  const entry = rateLimitStore.get(key)

  if (entry && now < entry.resetAt) {
    if (entry.count >= AI_RATE_LIMIT) {
      setResponseHeader(event, 'Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)))
      throw createError({ statusCode: 429, message: 'Zu viele Anfragen. Bitte warte eine Minute.' })
    }
    entry.count++
  } else {
    rateLimitStore.set(key, { count: 1, resetAt: now + AI_WINDOW_MS })
  }

  // Alten Einträgen löschen, damit der Store nicht unbegrenzt wächst
  if (rateLimitStore.size > 500) {
    for (const [k, v] of rateLimitStore) {
      if (now > v.resetAt) rateLimitStore.delete(k)
    }
  }
})
