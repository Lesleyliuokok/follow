/**
 * NextAuth v5 configuration.
 *
 * Auth providers:
 *   - WeChat Open Platform (微信开放平台) — QR-code login, works in any browser.
 *     On mobile inside WeChat, the same redirect flow authorises without a QR scan.
 *
 * WeChat Open Platform OAuth deviates from standard OAuth 2.0:
 *   • Authorization URL uses `appid` instead of `client_id`
 *   • Token endpoint uses GET with appid/secret/code as query params (no client_secret_post)
 *   • Userinfo endpoint requires access_token + openid as query params (no Bearer header)
 *   • Returns `unionid` (stable across all apps on the same open platform account) +
 *     `openid` (app-specific). We use unionid as the stable user identity.
 *
 * Registration: https://open.weixin.qq.com → 管理中心 → 网站应用 → 创建应用
 * Required env vars: WECHAT_OPEN_APP_ID, WECHAT_OPEN_APP_SECRET
 * Callback URL to register in WeChat console: {APP_URL}/api/auth/callback/wechat
 */
import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { prisma } from '@/lib/db'


// ── WeChat Open Platform profile shape ────────────────────────────────────────
interface WeChatProfile {
  openid: string
  nickname: string
  headimgurl: string
  unionid: string
}

// ── Custom WeChat Open Platform OAuth provider ────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const WeChatProvider: any = {
  id: 'wechat',
  name: 'WeChat',
  type: 'oauth',
  clientId: process.env.WECHAT_OPEN_APP_ID,
  clientSecret: process.env.WECHAT_OPEN_APP_SECRET,

  // Authorization: show QR code page (snsapi_login)
  // `appid` is WeChat's non-standard alias for client_id
  authorization: {
    url: 'https://open.weixin.qq.com/connect/qrconnect',
    params: {
      appid: process.env.WECHAT_OPEN_APP_ID,
      scope: 'snsapi_login',
      response_type: 'code',
    },
  },

  // Token exchange: GET with appid/secret/code as query params
  token: {
    url: 'https://api.weixin.qq.com/sns/oauth2/access_token',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async request({ params, provider }: any) {
      const url = new URL('https://api.weixin.qq.com/sns/oauth2/access_token')
      url.searchParams.set('appid', provider.clientId ?? '')
      url.searchParams.set('secret', provider.clientSecret ?? '')
      url.searchParams.set('code', params.code ?? '')
      url.searchParams.set('grant_type', 'authorization_code')
      const res = await fetch(url.toString())
      const tokens = await res.json()
      if (tokens.errcode) {
        console.error('[wechat] token exchange error:', tokens)
        throw new Error(`WeChat token error: ${tokens.errmsg}`)
      }
      return { tokens }
    },
  },

  // Userinfo: GET with access_token + openid as query params
  userinfo: {
    url: 'https://api.weixin.qq.com/sns/userinfo',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async request({ tokens }: any) {
      const url = new URL('https://api.weixin.qq.com/sns/userinfo')
      url.searchParams.set('access_token', tokens.access_token ?? '')
      url.searchParams.set('openid', tokens.openid ?? '')
      url.searchParams.set('lang', 'zh_CN')
      const res = await fetch(url.toString())
      return res.json() as Promise<WeChatProfile>
    },
  },

  // Map WeChat profile → NextAuth user. Use unionid as stable ID.
  profile(profile: WeChatProfile) {
    return {
      id: profile.unionid || profile.openid,
      name: profile.nickname || null,
      email: null, // WeChat does not expose email
      image: profile.headimgurl || null,
    }
  },

  // Only validate state (CSRF); WeChat Open Platform does not support PKCE
  checks: ['state'],
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    WeChatProvider,
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],

  pages: { signIn: '/login' },

  callbacks: {
    async signIn({ user, account }) {
      if (!user.id) return true

      if (account?.provider === 'wechat') {
        // WeChat users have no email — upsert by id (unionid)
        await prisma.user
          .upsert({
            where: { id: user.id },
            create: {
              id: user.id,
              name: user.name ?? null,
              image: user.image ?? null,
            },
            update: {
              name: user.name ?? null,
              image: user.image ?? null,
            },
          })
          .catch((e) => console.error('[auth] user upsert failed:', e))
      } else if (user.email) {
        // Other OAuth providers that supply an email
        await prisma.user
          .upsert({
            where: { email: user.email },
            create: {
              id: user.id,
              email: user.email,
              name: user.name ?? null,
              image: user.image ?? null,
            },
            update: {
              name: user.name ?? null,
              image: user.image ?? null,
            },
          })
          .catch((e) => console.error('[auth] user upsert failed:', e))
      }
      return true
    },

    session({ session, token }) {
      if (token.sub) session.user.id = token.sub
      return session
    },
  },
})
