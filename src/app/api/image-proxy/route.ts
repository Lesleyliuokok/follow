import { NextRequest, NextResponse } from 'next/server'
import { Agent, fetch as undiciFetch } from 'undici'

const directAgent = new Agent()

// Trusted domains and the Referer each requires
const ALLOWED: Record<string, string> = {
  'doubanio.com':   'https://movie.douban.com',
  'hdslb.com':      'https://www.bilibili.com',   // Bilibili CDN — hotlink protected
  'iqiyipic.com':   'https://www.iqiyi.com',
  'qpic.cn':        'https://v.qq.com',            // Tencent Video CDN
  'puui.qpic.cn':   'https://v.qq.com',
}

// Only proxy images from trusted domains
function isAllowed(url: string): boolean {
  try {
    const { hostname } = new URL(url)
    return Object.keys(ALLOWED).some((d) => hostname.endsWith(d))
  } catch {
    return false
  }
}

const REFERERS: Record<string, string> = ALLOWED

function refererFor(url: string): string {
  try {
    const { hostname } = new URL(url)
    for (const [key, referer] of Object.entries(REFERERS)) {
      if (hostname.endsWith(key)) return referer
    }
  } catch { /* empty */ }
  return ''
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) return new NextResponse('Missing url', { status: 400 })
  if (!isAllowed(url)) return new NextResponse('Forbidden', { status: 403 })

  try {
    const res = await undiciFetch(url, {
      dispatcher: directAgent,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Referer: refererFor(url),
        Accept: 'image/*,*/*',
      },
    })

    if (!res.ok) return new NextResponse('Upstream error', { status: res.status })

    const data = await res.arrayBuffer()
    return new NextResponse(data, {
      headers: {
        'Content-Type': res.headers.get('content-type') ?? 'image/jpeg',
        'Cache-Control': 'public, max-age=604800, immutable',
      },
    })
  } catch {
    return new NextResponse('Proxy error', { status: 502 })
  }
}
