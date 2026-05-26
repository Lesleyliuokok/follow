import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import type { Platform } from '@/generated/prisma/enums'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')
  const platform = searchParams.get('platform') as Platform | null

  const shows = await prisma.show.findMany({
    where: {
      ...(q ? { title: { contains: q, mode: 'insensitive' } } : {}),
      ...(platform ? { platform } : {}),
    },
    include: { _count: { select: { subscriptions: true } } },
    orderBy: { updatedAt: 'desc' },
    take: 20,
  })

  return NextResponse.json(shows)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const show = await prisma.show.upsert({
    where: { platform_platformId: { platform: body.platform, platformId: body.platformId } },
    create: body,
    update: { title: body.title, coverImage: body.coverImage, platformUrl: body.platformUrl },
  })

  return NextResponse.json(show, { status: 201 })
}
