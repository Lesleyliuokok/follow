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
  try {
    const session = await auth()
    if (!session?.user?.id)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Ensure User row exists — handles sessions that pre-date the signIn upsert
    await ensureUser(session.user.id, session.user.name, session.user.image)

    const { showId, celebrityId } = await req.json()
    if (!showId && !celebrityId) {
      return NextResponse.json({ error: 'showId or celebrityId required' }, { status: 400 })
    }

    // Verify FK targets exist before upserting (gives a clearer error if missing)
    if (celebrityId) {
      // Log which DB host we're connected to (masked password)
      const dbUrl = process.env.DATABASE_URL ?? ''
      const dbHost = dbUrl.replace(/:\/\/[^@]+@/, '://***@').split('/')[2] ?? 'unknown'
      const totalCelebs = await prisma.celebrity.count()
      const celeb = await prisma.celebrity.findUnique({ where: { id: celebrityId } })
      if (!celeb) {
        console.error('[subscriptions] celebrity not found:', celebrityId, '| db host:', dbHost, '| total celebrities in db:', totalCelebs)
        return NextResponse.json({ error: `celebrity_not_found:${celebrityId} | db:${dbHost} | total:${totalCelebs}` }, { status: 404 })
      }
    }
    let show = null
    if (showId) {
      show = await prisma.show.findUnique({ where: { id: showId } })
      if (!show) {
        console.error('[subscriptions] show not found:', showId)
        return NextResponse.json({ error: `show_not_found:${showId}` }, { status: 404 })
      }
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

    // Seed a ShowUpdate immediately so the timeline isn't empty after subscribing.
    // Only do this if: subscribing to a show (not a celebrity), the show has a known
    // episode count, and no ShowUpdate has been created for it yet.
    if (show && show.latestEpisode && show.latestEpisode > 0) {
      const existingCount = await prisma.showUpdate.count({ where: { showId: show.id } })
      if (existingCount === 0) {
        await prisma.showUpdate.create({
          data: {
            showId: show.id,
            episode: show.latestEpisode,
            title: null,
            publishedAt: new Date(),
          },
        }).catch(() => {}) // non-fatal
      }
    }

    return NextResponse.json(sub, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[POST /api/subscriptions]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
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
