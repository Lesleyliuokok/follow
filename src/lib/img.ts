/**
 * Rewrite image URLs that require a proxy.
 *
 * Several CDNs enforce hotlink protection and return 403 when the browser
 * loads them with a non-origin Referer. Route those through the server-side
 * /api/image-proxy endpoint which sets the correct Referer header.
 *
 * Covered domains:
 *   doubanio.com   — Douban poster CDN
 *   hdslb.com      — Bilibili CDN (bangumi covers, avatars)
 *   iqiyipic.com   — iQiyi poster CDN
 *   qpic.cn        — Tencent / WeChat CDN
 *   sinaimg.cn     — Weibo avatar / image CDN (hotlink-protected, needs Referer)
 */
const PROXY_DOMAINS = ['doubanio.com', 'hdslb.com', 'iqiyipic.com', 'qpic.cn', 'sinaimg.cn']

export function imgSrc(url: string | null | undefined): string | null {
  if (!url) return null
  if (PROXY_DOMAINS.some((d) => url.includes(d))) {
    return `/api/image-proxy?url=${encodeURIComponent(url)}`
  }
  return url
}
