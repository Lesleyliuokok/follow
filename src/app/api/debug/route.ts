import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { searchBilibiliShows, searchBilibiliUsers } from '@/lib/scraper/bilibili'
import { searchDoubanCelebrities } from '@/lib/scraper/douban'

export const dynamic = 'force-dynamic'

export async function GET() {
  // 1. Test DB write-then-read
  let dbWriteOk = false
  let dbWriteError = ''
  let testId = ''
  try {
    const created = await prisma.celebrity.create({
      data: { name: '__debug_test__' },
    })
    testId = created.id
    const found = await prisma.celebrity.findUnique({ where: { id: testId } })
    dbWriteOk = found?.id === testId
    // Clean up
    await prisma.celebrity.delete({ where: { id: testId } }).catch(() => {})
  } catch (e) {
    dbWriteError = e instanceof Error ? e.message : String(e)
  }

  // 2. Test external scrapers
  const [biliShows, biliUsers, doubanCelebs] = await Promise.allSettled([
    searchBilibiliShows('三体'),
    searchBilibiliUsers('刘浩存'),
    searchDoubanCelebrities('刘浩存'),
  ])

  const dbHost = (process.env.DATABASE_URL ?? '')
    .replace(/:\/\/[^@]+@/, '://***@')
    .split('/')[2] ?? 'unknown'

  return NextResponse.json({
    db: {
      host: dbHost,
      writeReadOk: dbWriteOk,
      error: dbWriteError || null,
    },
    scrapers: {
      bilibiliShows: biliShows.status === 'fulfilled' ? biliShows.value.length : `error: ${(biliShows as PromiseRejectedResult).reason}`,
      bilibiliUsers: biliUsers.status === 'fulfilled' ? biliUsers.value.map(u => u.name) : `error: ${(biliUsers as PromiseRejectedResult).reason}`,
      douban: doubanCelebs.status === 'fulfilled' ? doubanCelebs.value.map(c => c.name) : `error: ${(doubanCelebs as PromiseRejectedResult).reason}`,
    },
  })
}
