import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

/** Ensure a User row exists in DB (needed for foreign key on Subscription). */
async function ensureUser(id: string, name?: string | null, image?: string | null) {
  await prisma.user.upsert({
    where: { id },
    create: { id, name: name ?? null, image: image ?? null },
    update: { name: name ?? null, image: image ?? null },
  })
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const subs = await prisma.subscription.findMany({
    where: { userId: session.user.id },
    include: {
      show: true,
      celebrity: { include: { platforms: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(subs)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Ensure User row exists — handles sessions that pre-date the signIn upsert
  await ensureUser(session.user.id, session.user.name, session.user.image)

  const { showId, celebrityId } = await req.json()
  if (!showId && !celebrityId) {
    return NextResponse.json({ error: 'showId or celebrityId required' }, { status: 400 })
  }

  // Use upsert to avoid duplicate-constraint errors on double-click
  const sub = await prisma.subscription.upsert({
    where: showId
      ? { userId_showId: { userId: session.user.id, showId } }
      : { userId_celebrityId: { userId: session.user.id, celebrityId } },
    create: {
      userId: session.user.id,
      showId: showId ?? null,
      celebrityId: celebrityId ?? null,
    },
    update: {},
  })

  return NextResponse.json(sub, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { showId, celebrityId } = await req.json()
  await prisma.subscription.deleteMany({
    where: {
      userId: session.user.id,
      ...(showId ? { showId } : {}),
      ...(celebrityId ? { celebrityId } : {}),
    },
  })

  return NextResponse.json({ ok: true })
}
