import type { Platform, SocialPlatform, ShowStatus } from '@/generated/prisma/enums'

export type { Platform, SocialPlatform, ShowStatus }

export interface TimelineItem {
  id: string
  type: 'show_update' | 'social_post'
  publishedAt: Date
  // show update
  show?: {
    id: string
    title: string
    platform: Platform
    platformUrl: string
    coverImage: string | null
  }
  episode?: number
  episodeTitle?: string | null
  // social post
  celebrity?: {
    id: string
    name: string
    avatar: string | null
  }
  socialPlatform?: SocialPlatform
  content?: string | null
  mediaUrls?: string[]
  postUrl?: string
}

export const PLATFORM_LABELS: Record<Platform, string> = {
  BILIBILI: 'Bilibili',
  IQIYI: '爱奇艺',
  TENCENT: '腾讯视频',
  DOUYIN: '抖音',
}

export const SOCIAL_PLATFORM_LABELS: Record<SocialPlatform, string> = {
  WEIBO: '微博',
  XIAOHONGSHU: '小红书',
  DOUYIN: '抖音',
  BILIBILI: 'Bilibili',
}

export const PLATFORM_COLORS: Record<Platform, string> = {
  BILIBILI: '#00a1d6',
  IQIYI: '#00BE06',
  TENCENT: '#FF6600',
  DOUYIN: '#161823',
}
