'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { Sidebar } from './sidebar'
import GlobalHeader from './globalheader'

const AUTH_ROUTES = ['/login', '/auth']

interface Props {
  children: ReactNode
}

export default function ConditionalLayout({ children }: Props) {
  const pathname = usePathname()
  const isAuth = AUTH_ROUTES.some((r) => pathname.startsWith(r))

  if (isAuth) return <>{children}</>

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <GlobalHeader />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}