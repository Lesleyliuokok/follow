/**
 * POST /api/auth/wechat/unbind
 * Remove the WeChat binding from the current user's account.
 */
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function POST() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { wechatOpenId: null },
  })

  return NextResponse.json({ ok: true })
}
