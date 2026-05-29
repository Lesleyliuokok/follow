import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { searchBilibiliUsers } from '@/lib/scraper/bilibili'
import { searchWeiboUsers } from '@/lib/scrapers/weibo'
import { searchDoubanCelebrities } from '@/lib/scraper/douban'
import type { Celebrity, CelebrityPlatform } from '@prisma/client'

type CelebrityWithPlatforms = Celebrity & { platforms: CelebrityPlatform[] }

async function upsertBiliCelebrity(item: {
  platformId: string
  name: string
  avatar: string | null
}): Promise<CelebrityWithPlatforms | null> {
  try {
    const existing = await prisma.celebrityPlatform.findUnique({
      where: { platform_platformId: { platform: 'BILIBILI', platformId: item.platformId } },
      include: { celebrity: { include: { platforms: true } } },
    })

    if (existing) {
      await prisma.celebrity.update({
        where: { id: existing.celebrityId },
        data: { name: item.name, avatar: item.avatar },
      })
      return { ...existing.celebrity, name: item.name, avatar: item.avatar }
    }

    return await prisma.celebrity.create({
      data: {
        name: item.name,
        avatar: item.avatar,
        platforms: {
          create: [
            {
              platform: 'BILIBILI',
              platformId: item.platformId,
              profileUrl: `https://space.bilibili.com/${item.platformId}`,
            },
          ],
        },
      },
      include: { platforms: true },
    })
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()

  if (!q) {
    const celebrities = await prisma.celebrity.findMany({
      include: { platforms: true },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    })
    return NextResponse.json(celebrities)
  }

  // Run local DB search + Douban celebrity search in parallel
  // Douban is the primary discovery source (curated, accurate names & photos)
  // Bilibili is secondary (high-follower/verified creators only)
  const [localCelebs, doubanCelebs, biliUsers] = await Promise.all([
    prisma.celebrity.findMany({
      where: { name: { contains: q, mode: 'insensitive' } },
      include: { platforms: true },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    }),
    searchDoubanCelebrities(q).catch(() => []),
    searchBilibiliUsers(q).catch(() => []),
  ])

  // Upsert Douban celebrities (use doubanId as platformId for a virtual "DOUBAN" platform
  // — or just create the celebrity record; platform links are added manually later)
  type CelebWithPlatforms = Celebrity & { platforms: CelebrityPlatform[] }
  const doubanUpserted = await Promise.all(
    doubanCelebs.map(async (d): Promise<CelebWithPlatforms | null> => {
      try {
        // Check if already in DB by name (exact match)
        const existing = await prisma.celebrity.findFirst({
          where: { name: { equals: d.name, mode: 'insensitive' } },
          include: { platforms: true },
        })
        if (existing) return existing

        // Create new celebrity with Douban photo
        return prisma.celebrity.create({
          data: { name: d.name, avatar: d.coverImage },
          include: { platforms: true },
        })
      } catch {
        return null
      }
    }),
  )

  // Upsert Bilibili creators (verified / high-follower accounts only, after filtering)
  const biliUpserted = await Promise.all(biliUsers.map(upsertBiliCelebrity))

  // Weibo search (needs cookie — silently skipped if unavailable)
  const weiboUsers = process.env.WEIBO_COOKIE
    ? await searchWeiboUsers(q, 3).catch(() => [])
    : []

  const weiboUpserted = await Promise.all(
    weiboUsers.map(async (u): Promise<CelebWithPlatforms | null> => {
      if (!u.uid) return null
      try {
        const existingCp = await prisma.celebrityPlatform.findUnique({
          where: { platform_platformId: { platform: 'WEIBO', platformId: u.uid } },
          include: { celebrity: { include: { platforms: true } } },
        })
        if (existingCp) return existingCp.celebrity

        const existingCeleb = await prisma.celebrity.findFirst({
          where: { name: { equals: u.name, mode: 'insensitive' } },
          include: { platforms: true },
        })
        if (existingCeleb) {
          await prisma.celebrityPlatform.create({
            data: { celebrityId: existingCeleb.id, platform: 'WEIBO', platformId: u.uid, profileUrl: u.profileUrl },
          }).catch(() => {})
          return prisma.celebrity.findUnique({ where: { id: existingCeleb.id }, include: { platforms: true } })
        }
        return prisma.celebrity.create({
          data: {
            name: u.name, avatar: u.avatar,
            platforms: { create: [{ platform: 'WEIBO', platformId: u.uid, profileUrl: u.profileUrl }] },
          },
          include: { platforms: true },
        })
      } catch { return null }
    }),
  )

  // Merge: local DB first, then new results not already present
  const localIds = new Set(localCelebs.map((c) => c.id))
  const localNames = new Set(localCelebs.map((c) => c.name.toLowerCase()))

  const allNew = [...doubanUpserted, ...biliUpserted, ...weiboUpserted]
  const seenIds = new Set<string>()
  const deduped = allNew.filter((c): c is CelebWithPlatforms => {
    if (!c || localIds.has(c.id) || localNames.has(c.name.toLowerCase())) return false
    if (seenIds.has(c.id)) return false
    seenIds.add(c.id)
    return true
  })

  return NextResponse.json([...localCelebs, ...deduped].slice(0, 20))
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
