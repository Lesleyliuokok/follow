/**
 * GET /api/auth/wechat/callback
 *
 * WeChat OAuth callback. WeChat redirects here with ?code=XXX&state=userId.
 *
 * Steps:
 *  1. Exchange code for OpenID via WeChat API
 *  2. Check if this OpenID is already bound to another account
 *  3. Store OpenID on the User record
 *  4. Redirect to /subscriptions?wechat=bound (or ?wechat=error)
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { exchangeCodeForOpenId } from '@/lib/wechat'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const code = searchParams.get('code')
  const userId = searchParams.get('state') // we put userId in state

  const baseUrl = process.env.AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin

  if (!code || !userId) {
    return NextResponse.redirect(`${baseUrl}/subscriptions?wechat=error&reason=missing_params`)
  }

  // WeChat returns code=authdeny when user cancels
  if (code === 'authdeny') {
    return NextResponse.redirect(`${baseUrl}/subscriptions?wechat=cancelled`)
  }

  try {
    const openId = await exchangeCodeForOpenId(code)

    // Check if this OpenID is already bound to a different account
    const existing = await prisma.user.findUnique({ where: { wechatOpenId: openId } })
    if (existing && existing.id !== userId) {
      return NextResponse.redirect(`${baseUrl}/subscriptions?wechat=error&reason=already_bound`)
    }

    // Bind the OpenID to the user
    await prisma.user.update({
      where: { id: userId },
      data: { wechatOpenId: openId },
    })

    return NextResponse.redirect(`${baseUrl}/subscriptions?wechat=bound`)
  } catch (err) {
    console.error('[wechat/callback] error:', err)
    return NextResponse.redirect(`${baseUrl}/subscriptions?wechat=error&reason=api_error`)
  }
}
