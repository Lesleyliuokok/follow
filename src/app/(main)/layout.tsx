import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { TopNav } from '@/components/layout/TopNav'
import { PushNotificationSetup } from '@/components/PushNotificationSetup'

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  return (
    <div className="min-h-screen bg-gray-50">
      <PushNotificationSetup />
      <TopNav user={session.user} />
      <main className="pt-14">{children}</main>
    </div>
  )
}
