import { Outlet } from 'react-router-dom'
import { TopNav } from './TopNav'
import { BottomNav } from './BottomNav'

export function Layout() {
  return (
    <div className="min-h-[100svh] flex flex-col bg-bg">
      <TopNav />
      <main className="flex-1 pb-24 md:pb-8">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
