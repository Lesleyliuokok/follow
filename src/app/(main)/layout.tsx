import Link from 'next/link'
import { Home, Search, Bookmark } from 'lucide-react'
import { PushNotificationSetup } from '@/components/PushNotificationSetup'

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <PushNotificationSetup />
      {children}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 safe-area-inset-bottom">
        <div className="max-w-lg mx-auto flex items-center justify-around h-16">
          <Link href="/" className="flex flex-col items-center gap-1 text-gray-500 hover:text-blue-600 transition-colors px-6">
            <Home size={22} />
            <span className="text-xs">首页</span>
          </Link>
          <Link href="/search" className="flex flex-col items-center gap-1 text-gray-500 hover:text-blue-600 transition-colors px-6">
            <Search size={22} />
            <span className="text-xs">搜索</span>
          </Link>
          <Link href="/subscriptions" className="flex flex-col items-center gap-1 text-gray-500 hover:text-blue-600 transition-colors px-6">
            <Bookmark size={22} />
            <span className="text-xs">追踪</span>
          </Link>
        </div>
      </nav>
    </div>
  )
}
