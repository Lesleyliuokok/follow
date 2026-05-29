/**
 * GET /api/auth/wechat
 *
 * Redirects the current user to WeChat OAuth authorization.
 * The user must be logged in — their userId is embedded in the OAuth `state`
 * so the callback can associate the returned OpenID with the correct account.
 *
 * Flow:
 *   1. User clicks "绑定微信" → browser hits this route
 *   2. Route builds the WeChat OAuth URL and redirects
 *   3. WeChat redirects back to /api/auth/wechat/callback?code=XXX&state=userId
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { buildOAuthUrl } from '@/lib/wechat'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const appUrl = process.env.AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin
  const callbackUrl = `${appUrl}/api/auth/wechat/callback`

  // state = userId so the callback can bind the right account
  const oauthUrl = buildOAuthUrl(callbackUrl, session.user.id)
  return NextResponse.redirect(oauthUrl)
}
