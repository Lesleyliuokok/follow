import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.hdslb.com' },      // Bilibili CDN
      { protocol: 'https', hostname: '**.iqiyipic.com' },   // iQiyi CDN
      { protocol: 'https', hostname: '**.gtimg.cn' },       // Tencent CDN
      { protocol: 'https', hostname: '**.sinaimg.cn' },     // Weibo CDN
      { protocol: 'https', hostname: '**.xiaohongshu.com' },
      { protocol: 'https', hostname: '**.douyinpic.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' }, // Google avatars
    ],
  },
}

export default nextConfig
