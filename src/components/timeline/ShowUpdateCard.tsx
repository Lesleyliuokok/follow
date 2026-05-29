import Image from 'next/image'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { Play, Tv } from 'lucide-react'
import { PLATFORM_LABELS, PLATFORM_COLORS } from '@/types'
import { imgSrc } from '@/lib/img'
import type { Platform } from '@prisma/client'

interface ShowUpdateCardProps {
  show: {
    id: string
    title: string
    platform: Platform
    platformUrl: string
    coverImage: string | null
  }
  episode: number
  episodeTitle?: string | null
  publishedAt: Date | string
}

export function ShowUpdateCard({ show, episode, episodeTitle, publishedAt }: ShowUpdateCardProps) {
  const timeAgo = formatDistanceToNow(new Date(publishedAt), { addSuffix: true, locale: zhCN })
  const color = PLATFORM_COLORS[show.platform]

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 hover:border-gray-200 hover:shadow-sm transition-all">
      <div className="flex gap-4">
        {/* Cover */}
        <div className="relative w-20 h-28 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100">
          {show.coverImage ? (
            <Image src={imgSrc(show.coverImage)!} alt={show.title} fill className="object-cover" />
          ) : (
            <div className="flex items-center justify-center h-full">
              <Tv size={24} className="text-gray-300" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded-full text-white"
                style={{ backgroundColor: color }}
              >
                {PLATFORM_LABELS[show.platform]}
              </span>
              <span className="text-xs text-gray-400">{timeAgo}</span>
            </div>
            <h3 className="font-semibold text-gray-900 text-base leading-snug">{show.title}</h3>
            <p className="text-sm text-gray-500 mt-1">
              第 <span className="font-medium text-gray-700">{episode}</span> 集已更新
              {episodeTitle && <span className="text-gray-400"> · {episodeTitle}</span>}
            </p>
          </div>

          <a
            href={show.platformUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 self-start mt-2 px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-700 transition-colors"
          >
            <Play size={12} fill="white" />
            立即观看
          </a>
        </div>
      </div>
    </div>
  )
}
