/**
 * WeChat Official Account API helpers.
 *
 * Covers:
 *  1. Access token management — cached in-memory, auto-refreshed before expiry
 *  2. OAuth code exchange — convert authorization code → OpenID
 *  3. Template message — send episode-update notifications to bound users
 *
 * Prerequisites (all set via env vars):
 *  WECHAT_APP_ID      — Official Account AppID (sandbox: from mp.weixin.qq.com/sandbox)
 *  WECHAT_APP_SECRET  — Official Account AppSecret
 *  WECHAT_TEMPLATE_ID — Template ID registered in Official Account backend
 *
 * Template format (register this in the WeChat backend):
 *   {{first.DATA}}
 *   剧名：{{keyword1.DATA}}
 *   更新：{{keyword2.DATA}}
 *   时间：{{keyword3.DATA}}
 *   {{remark.DATA}}
 */

const APP_ID = process.env.WECHAT_APP_ID!
const APP_SECRET = process.env.WECHAT_APP_SECRET!
const TEMPLATE_ID = process.env.WECHAT_TEMPLATE_ID!

// ── Access token cache ────────────────────────────────────────────────────────
// WeChat access tokens are valid for 7200 seconds. We refresh proactively 5 min
// before expiry so there's no gap during a cron run.

interface TokenCache {
  token: string
  expiresAt: number // unix ms
}

let _tokenCache: TokenCache | null = null

async function getAccessToken(): Promise<string> {
  const now = Date.now()
  if (_tokenCache && _tokenCache.expiresAt - now > 5 * 60 * 1000) {
    return _tokenCache.token
  }

  const url =
    `https://api.weixin.qq.com/cgi-bin/token` +
    `?grant_type=client_credential&appid=${APP_ID}&secret=${APP_SECRET}`

  const res = await fetch(url)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = (await res.json()) as any

  if (!json.access_token) {
    throw new Error(`WeChat token error: ${json.errmsg ?? JSON.stringify(json)}`)
  }

  _tokenCache = {
    token: json.access_token as string,
    expiresAt: now + (json.expires_in as number) * 1000,
  }
  return _tokenCache.token
}

// ── OAuth: code → OpenID ──────────────────────────────────────────────────────
/**
 * Exchange an OAuth authorization code (from WeChat redirect) for the user's OpenID.
 * Uses snsapi_base scope — silent authorization, no user approval dialog needed.
 */
export async function exchangeCodeForOpenId(code: string): Promise<string> {
  const url =
    `https://api.weixin.qq.com/sns/oauth2/access_token` +
    `?appid=${APP_ID}&secret=${APP_SECRET}&code=${code}&grant_type=authorization_code`

  const res = await fetch(url)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = (await res.json()) as any

  if (!json.openid) {
    throw new Error(`WeChat OAuth error: ${json.errmsg ?? JSON.stringify(json)}`)
  }
  return json.openid as string
}

// ── Template message ──────────────────────────────────────────────────────────

export interface EpisodeUpdatePayload {
  showTitle: string
  episode: number
  episodeTitle?: string | null
  showUrl: string
}

/**
 * Send a "new episode" template message to a single user.
 * Returns true on success, false on non-fatal failures (invalid openid, blocked, etc.)
 */
export async function sendEpisodeUpdateMessage(
  openId: string,
  payload: EpisodeUpdatePayload,
): Promise<boolean> {
  let token: string
  try {
    token = await getAccessToken()
  } catch (err) {
    console.error('[wechat] failed to get access token:', err)
    return false
  }

  const episodeDesc = payload.episodeTitle
    ? `第 ${payload.episode} 集：${payload.episodeTitle}`
    : `第 ${payload.episode} 集`

  const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })

  const body = {
    touser: openId,
    template_id: TEMPLATE_ID,
    url: payload.showUrl,
    data: {
      first: { value: `${payload.showTitle} 更新啦！`, color: '#173177' },
      keyword1: { value: payload.showTitle },
      keyword2: { value: episodeDesc },
      keyword3: { value: now },
      remark: { value: '点击查看最新剧集 →' },
    },
  }

  try {
    const res = await fetch(
      `https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=${token}`,
      { method: 'POST', body: JSON.stringify(body) },
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = (await res.json()) as any

    // errcode 0 = success; 43101 = user blocked template msgs; 40003 = invalid openid
    if (json.errcode !== 0) {
      console.warn(`[wechat] template send failed for ${openId}: ${json.errcode} ${json.errmsg}`)
      return false
    }
    return true
  } catch (err) {
    console.error('[wechat] template send error:', err)
    return false
  }
}

/**
 * Send episode-update template messages to all users subscribed to a show
 * with notifyWeChat=true and a bound wechatOpenId.
 */
export async function sendWeChatToSubscribers(
  showId: string,
  payload: EpisodeUpdatePayload,
): Promise<void> {
  if (!APP_ID || !APP_SECRET || !TEMPLATE_ID) return // not configured

  // All subscribers whose user account has a bound WeChat OpenID.
  // notifyWeChat is reserved for future per-subscription opt-out UI.
  const subs = await import('@/lib/db').then(({ prisma }) =>
    prisma.subscription.findMany({
      where: { showId },
      select: { user: { select: { wechatOpenId: true } } },
    }),
  )

  const openIds = subs
    .map((s) => s.user.wechatOpenId)
    .filter((id): id is string => Boolean(id))

  if (openIds.length === 0) return

  await Promise.allSettled(openIds.map((openId) => sendEpisodeUpdateMessage(openId, payload)))
}

/**
 * Build the WeChat OAuth authorization URL to redirect the user to.
 * After the user authorizes, WeChat redirects to `redirectUri?code=XXX&state=YYY`.
 */
export function buildOAuthUrl(redirectUri: string, state: string): string {
  const encoded = encodeURIComponent(redirectUri)
  return (
    `https://open.weixin.qq.com/connect/oauth2/authorize` +
    `?appid=${APP_ID}` +
    `&redirect_uri=${encoded}` +
    `&response_type=code` +
    `&scope=snsapi_base` +
    `&state=${state}` +
    `#wechat_redirect`
  )
}
