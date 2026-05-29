import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const posts = await prisma.socialPost.findMany({
    where: { celebrityPlatform: { celebrityId: id } },
    include: { celebrityPlatform: { select: { platform: true } } },
    orderBy: { publishedAt: 'desc' },
    take: 50,
  })
  return NextResponse.json(posts)
}
