import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const celebrity = await prisma.celebrity.findUnique({
    where: { id },
    include: { platforms: true },
  })
  if (!celebrity) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(celebrity)
}
