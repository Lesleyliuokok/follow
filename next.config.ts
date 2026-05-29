import type { NextConfig } from 'next'
import type { Configuration } from 'webpack'

const nextConfig: NextConfig = {
  serverExternalPackages: ['@prisma/client', '@prisma/adapter-pg', 'pg', 'undici'],
  webpack(config: Configuration) {
    // Allow webpack to handle node: URI scheme (required by undici and other packages)
    config.resolve = config.resolve ?? {}
    config.resolve.fallback = { ...config.resolve.fallback }
    const webpack = require('webpack')
    config.plugins = config.plugins ?? []
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(/^node:/, (resource: { request: string }) => {
        resource.request = resource.request.replace(/^node:/, '')
      }),
    )
    return config
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.hdslb.com' },
      { protocol: 'https', hostname: '**.iqiyipic.com' },
      { protocol: 'https', hostname: '**.gtimg.cn' },
      { protocol: 'https', hostname: '**.sinaimg.cn' },
      { protocol: 'https', hostname: '**.xiaohongshu.com' },
      { protocol: 'https', hostname: '**.douyinpic.com' },
      { protocol: 'https', hostname: '**.doubanio.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
  },
}

export default nextConfig
