'use client'

import { useEffect, useState, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { useDarkMode } from '@/components/darkmodeprovider'
import { createClient } from '@/lib/supabase'
import { getSlaHours } from '@/lib/loans'

const ROUTE_LABELS: Record<string, string> = {
  '/dashboard':     'Dashboard',
  '/emprestar':     'Empréstimos',
  '/devolver':      'Devoluções',
  '/dispositivos':  'Dispositivos',
  '/usuarios':      'Usuários',
  '/historico':     'Histórico',
  '/relatorios':    'Relatórios',
  '/alertas':       'Alertas',
  '/ipads/qrcodes': 'QR Codes',
}

const ROUTE_SUBTITLES: Record<string, string> = {
  '/dashboard':     'Visão geral do controle de iPads',
  '/emprestar':     'Registrar novo empréstimo',
  '/devolver':      'Registrar devolução de iPad',
  '/dispositivos':  'Gerenciar dispositivos cadastrados',
  '/usuarios':      'Gerenciar usuários com acesso ao sistema',
  '/historico':     'Histórico de empréstimos',
  '/relatorios':    'Relatórios e estatísticas',
  '/alertas':       'Empréstimos em atraso ou próximos do prazo',
  '/ipads/qrcodes': 'Etiquetas QR Code para impressão',
}

export default function GlobalHeader() {
  const pathname = usePathname()
  const { isDark, toggle } = useDarkMode()

  const [now, setNow] = useState<Date | null>(null)
  const [overdueCount, setOverdueCount] = useState(0)

  useEffect(() => {
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])

  const fetchOverdue = useCallback(async () => {
    try {
      const sb = createClient()
      const { data } = await sb
        .from('loans')
        .select('id, reason, custom_deadline_hours, loaned_at')
        .eq('status', 'active')

      if (!data) return

      const count = data.filter((l: any) => {
        const elapsed = (Date.now() - new Date(l.loaned_at).getTime()) / 3_600_000
        return elapsed >= getSlaHours(l.reason, l.custom_deadline_hours)
      }).length

      setOverdueCount(count)
    } catch {
      // silencia erros de rede
    }
  }, [])

  useEffect(() => {
    fetchOverdue()
    const t = setInterval(fetchOverdue, 5 * 60_000)
    return () => clearInterval(t)
  }, [fetchOverdue])

  const label    = ROUTE_LABELS[pathname]    ?? 'iPads'
  const subtitle = ROUTE_SUBTITLES[pathname] ?? ''

  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 px-4 md:px-6 py-3 md:py-4 border-b backdrop-blur-sm transition-colors bg-surface-container-low/80 border-outline-variant/20">

      {/* Título */}
      <div className="flex-1 min-w-0">
        <h1 className="text-base md:text-lg font-bold leading-none truncate text-on-surface">{label}</h1>
        {subtitle && (
          <p className="text-xs mt-0.5 text-on-surface-variant hidden sm:block truncate">
            {subtitle}
          </p>
        )}
      </div>

      {/* Sino de alertas */}
      <a href="/alertas"
        className="relative w-9 h-9 rounded-lg flex items-center justify-center transition-colors hover:bg-surface-container-high text-on-surface-variant"
        title={overdueCount > 0 ? `${overdueCount} em atraso` : 'Alertas'}
      >
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="1.8">
          <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
            strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {overdueCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-error text-on-primary text-[9px] font-bold leading-4 text-center">
            {overdueCount > 9 ? '9+' : overdueCount}
          </span>
        )}
      </a>

      {/* Dark mode toggle */}
      <button
        onClick={toggle}
        className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors hover:bg-surface-container-high text-on-surface-variant"
        title={isDark ? 'Modo claro' : 'Modo escuro'}
      >
        {isDark ? (
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="1.8">
            <circle cx="12" cy="12" r="5" />
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
              strokeLinecap="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="1.8">
            <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {/* Data e hora */}
      <div className="text-right text-xs text-on-surface-variant hidden md:block w-[110px]">
        {now && (
          <>
            <p className="font-semibold">
              {now.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
            <p>{now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
          </>
        )}
      </div>
    </header>
  )
}
