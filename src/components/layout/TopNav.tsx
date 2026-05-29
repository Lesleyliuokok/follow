'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { useState } from 'react'
import { Home, Compass, Bookmark, LogOut, ChevronDown } from 'lucide-react'

interface TopNavProps {
  user: {
    name?: string | null
    email?: string | null
    image?: string | null
  }
}

const navLinks = [
  { href: '/', label: '动态', icon: Home },
  { href: '/search', label: '发现', icon: Compass },
  { href: '/subscriptions', label: '追踪', icon: Bookmark },
]

export function TopNav({ user }: TopNavProps) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-100">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" aria-label="Follow">
          <svg width="88" height="27" viewBox="0 0 196 60" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="3" y="2" width="36" height="56" rx="8" stroke="#111827" strokeWidth="3"/>
            <rect x="14" y="8" width="14" height="3" rx="1.5" fill="#111827"/>
            <rect x="17" y="48" width="8" height="3" rx="1.5" fill="#111827"/>
            <path d="M21 37 C21 37 10 29 10 23 C10 18.5 13 16 17 17 C19 17.5 20.5 19 21 21 C21.5 19 23 17.5 25 17 C29 16 32 18.5 32 23 C32 29 21 37 21 37Z" fill="#E53E3E"/>
            <text x="50" y="40" fontFamily="'Arial Black','Helvetica Neue',Arial,sans-serif" fontWeight="900" fontSize="32" fill="#111827" letterSpacing="-0.5">Follow</text>
          </svg>
        </Link>

        {/* Nav links */}
        <nav className="flex items-center gap-1">
          {navLinks.map(({ href, label, icon: Icon }) => {
            const active = pathname === href
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <Icon size={16} />
                {label}
              </Link>
            )
          })}
        </nav>

        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <div className="relative w-7 h-7 rounded-full overflow-hidden bg-gray-200 flex-shrink-0">
              {user.image ? (
                <Image src={user.image} alt={user.name ?? ''} fill className="object-cover" />
              ) : (
                <div className="flex items-center justify-center h-full text-xs font-bold text-gray-500">
                  {user.name?.[0] ?? user.email?.[0] ?? '?'}
                </div>
              )}
            </div>
            <span className="text-sm text-gray-700 max-w-[100px] truncate">{user.name ?? user.email}</span>
            <ChevronDown size={14} className="text-gray-400" />
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-xl border border-gray-100 shadow-lg py-1 z-50">
                <div className="px-3 py-2 border-b border-gray-50">
                  <p className="text-xs text-gray-400 truncate">{user.email}</p>
                </div>
                <button
                  onClick={() => signOut({ callbackUrl: '/login' })}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  <LogOut size={14} />
                  退出登录
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
