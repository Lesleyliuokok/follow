/**
 * Debug endpoint for WeTV scraper internals.
 * Shows every intermediate step so we can diagnose null results.
 * Usage: GET /api/debug/wetv?keyword=主角
 */
import { NextRequest, NextResponse } from 'next/server'
import { Agent, fetch as undiciFetch } from 'undici'

export const dynamic = 'force-dynamic'

const agent = new Agent()
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,*/*;q=0.9',
  'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
}

function extractPageTitle(html: string): string {
  return (
    html.match(/property="og:title"\s+content="([^"]+)"/)?.[1] ??
    html.match(/content="([^"]+)"\s+property="og:title"/)?.[1] ??
    html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ??
    ''
  )
}

export async function GET(req: NextRequest) {
  const keyword = req.nextUrl.searchParams.get('keyword') ?? '主角'

  // Step 1: fetch search page
  const searchUrl = `https://wetv.vip/en/search?keyword=${encodeURIComponent(keyword)}`
  let searchHtml: string | null = null
  let searchStatus = 0
  let searchError = ''
  try {
    const res = await undiciFetch(searchUrl, { dispatcher: agent, headers: HEADERS })
    searchStatus = res.status
    searchHtml = res.ok ? await res.text() : null
  } catch (e) {
    searchError = e instanceof Error ? e.message : String(e)
  }

  if (!searchHtml) {
    return NextResponse.json({
      keyword,
      step: 'search_fetch',
      searchUrl,
      searchStatus,
      searchError: searchError || `HTTP ${searchStatus}`,
    })
  }

  // Step 2: extract cover IDs — try old regex first, then looser one
  const reStrict = /\/(?:en|zh-tw|zh-cn)\/play\/([a-z0-9]{10,20})(?:[-?#"'\s]|$)/g
  const reLoose = /\/(?:en|zh-tw|zh-cn)\/play\/([a-z0-9]{10,20})(?=[^a-z0-9]|$)/g

  const idsStrict: string[] = []
  const idsLoose: string[] = []

  let m: RegExpExecArray | null
  while ((m = reStrict.exec(searchHtml)) !== null) {
    if (!idsStrict.includes(m[1])) idsStrict.push(m[1])
  }
  while ((m = reLoose.exec(searchHtml)) !== null) {
    if (!idsLoose.includes(m[1])) idsLoose.push(m[1])
  }

  // Step 3: show sample of search HTML for inspection
  const htmlSnippet = searchHtml.slice(0, 2000)
  const hasPlayLinks = searchHtml.includes('/play/')
  const playLinkSample = searchHtml.match(/\/(?:en|zh-tw|zh-cn)\/play\/[a-z0-9]{5,}/)?.[0] ?? null

  // Step 4: verify each candidate (using loose IDs)
  const norm = (s: string) => s.toLowerCase().replace(/[\s　]/g, '')
  const normTitle = norm(keyword)
  const candidateResults: Array<{
    id: string
    pageUrl: string
    fetchOk: boolean
    rawTitle: string
    normTitle: string
    matches: boolean
  }> = []

  const ids = idsLoose.length > 0 ? idsLoose : idsStrict
  for (const id of ids.slice(0, 5)) {
    const pageUrl = `https://wetv.vip/en/play/${id}`
    let fetchOk = false
    let rawTitle = ''
    let normPageTitle = ''
    try {
      const res = await undiciFetch(pageUrl, { dispatcher: agent, headers: HEADERS })
      fetchOk = res.ok
      if (res.ok) {
        const html = await res.text()
        rawTitle = extractPageTitle(html)
        normPageTitle = norm(rawTitle)
      }
    } catch { /* ignore */ }

    const matches =
      normPageTitle.includes(normTitle) ||
      normTitle.includes(normPageTitle.split(/[-|]/)[0])

    candidateResults.push({ id, pageUrl, fetchOk, rawTitle, normTitle: normPageTitle, matches })
  }

  return NextResponse.json({
    keyword,
    searchUrl,
    searchStatus,
    htmlLength: searchHtml.length,
    hasPlayLinks,
    playLinkSample,
    idsStrict,
    idsLoose,
    htmlSnippet,
    candidateResults,
  })
}
