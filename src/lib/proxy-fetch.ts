/**
 * proxyFetch — routes HTTP requests through the HK proxy server when
 * HK_PROXY_URL is set, falling back to a direct fetch otherwise.
 *
 * Usage (drop-in replacement for fetch in scrapers):
 *   import { proxyFetch } from '@/lib/proxy-fetch'
 *   const res = await proxyFetch('https://api.bilibili.com/...', { headers: {...} })
 */

const PROXY_URL = process.env.HK_PROXY_URL   // e.g. https://follow-hk-proxy.fly.dev
const PROXY_SECRET = process.env.HK_PROXY_SECRET || ''

export async function proxyFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  // No proxy configured → direct fetch
  if (!PROXY_URL) {
    return fetch(url, init)
  }

  const proxyRes = await fetch(`${PROXY_URL}/fetch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${PROXY_SECRET}`,
    },
    body: JSON.stringify({
      url,
      method: (init.method as string) ?? 'GET',
      headers: (init.headers as Record<string, string>) ?? {},
      body: init.body != null ? String(init.body) : undefined,
    }),
  })

  return proxyRes
}
