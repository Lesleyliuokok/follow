import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')

  const celebrities = await prisma.celebrity.findMany({
    where: q ? { name: { contains: q, mode: 'insensitive' } } : {},
    include: {
      platforms: true,
      _count: { select: { subscriptions: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: 20,
  })

  return NextResponse.json(celebrities)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, avatar, platforms } = await req.json()

  const celebrity = await prisma.celebrity.create({
    data: {
      name,
      avatar,
      platforms: {
        create: platforms ?? [],
      },
    },
    include: { platforms: true },
  })

  return NextResponse.json(celebrity, { status: 201 })
}
