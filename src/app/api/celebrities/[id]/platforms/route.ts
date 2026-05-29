/**
 * POST   /api/celebrities/[id]/platforms  — link a new platform (e.g. Weibo) to a celebrity
 * DELETE /api/celebrities/[id]/platforms  — unlink a platform
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { parseWeiboUrl, resolveWeiboUsername, getWeiboUserInfo } from '@/lib/scrapers/weibo'
import type { SocialPlatform } from '@prisma/client'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: celebrityId } = await params
  const body = await req.json()
  const platform = body.platform as SocialPlatform
  const rawInput: string = body.url ?? body.uid ?? ''

  if (!platform || !rawInput) {
    return NextResponse.json({ error: 'platform and url are required' }, { status: 400 })
  }

  let platformId = ''
  let profileUrl = ''
  let name = ''
  let avatar: string | null = null

  if (platform === 'WEIBO') {
    // Parse input URL/UID
    const parsed = parseWeiboUrl(rawInput)
    if (!parsed) {
      return NextResponse.json({ error: '无法识别的微博链接或 UID' }, { status: 400 })
    }

    let uid: string | null = null
    if (parsed.type === 'uid') {
      uid = parsed.uid
    } else {
      uid = await resolveWeiboUsername(parsed.custom)
    }

    if (!uid) {
      return NextResponse.json({ error: '无法解析微博账号，请检查链接是否正确' }, { status: 400 })
    }

    // Fetch user info for verification (needs WEIBO_COOKIE)
    const info = await getWeiboUserInfo(uid)
    platformId = uid
    profileUrl = `https://weibo.com/u/${uid}`
    name = info?.name ?? ''
    avatar = info?.avatar ?? null
  } else if (platform === 'BILIBILI') {
    platformId = rawInput.replace(/\D/g, '') // extract numeric UID
    profileUrl = `https://space.bilibili.com/${platformId}`
  } else {
    platformId = rawInput
    profileUrl = rawInput
  }

  if (!platformId) {
    return NextResponse.json({ error: '无法获取平台账号 ID' }, { status: 400 })
  }

  try {
    // Upsert the platform link
    const cp = await prisma.celebrityPlatform.upsert({
      where: { platform_platformId: { platform, platformId } },
      update: { profileUrl },
      create: { celebrityId, platform, platformId, profileUrl },
    })

    // If we got a name/avatar, update the celebrity record
    if (name) {
      await prisma.celebrity.update({
        where: { id: celebrityId },
        data: {
          ...(name ? { name } : {}),
          ...(!avatar ? {} : { avatar }),
        },
      })
    }

    return NextResponse.json({ ok: true, platform: cp })
  } catch {
    return NextResponse.json({ error: '添加失败，该账号可能已绑定到其他艺人' }, { status: 409 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: celebrityId } = await params
  const { platform } = await req.json()

  await prisma.celebrityPlatform.deleteMany({
    where: { celebrityId, platform },
  })

  return NextResponse.json({ ok: true })
}
