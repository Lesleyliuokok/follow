import { NextResponse } from 'next/server'
import { searchBilibiliShows, searchBilibiliUsers } from '@/lib/scraper/bilibili'

export async function GET() {
  const [shows, users] = await Promise.all([
    searchBilibiliShows('三体'),
    searchBilibiliUsers('王一博'),
  ])

  return NextResponse.json({
    shows: shows.map((s) => ({ title: s.title, id: s.platformId, ep: s.latestEpisode })),
    users: users.map((u) => ({ name: u.name, id: u.platformId })),
  })
}
