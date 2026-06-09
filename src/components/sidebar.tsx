'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { getSlaHours } from '@/lib/loans';

interface NavRoute {
  href: string;
  label: string;
  icon: string;
  badge?: number;
}

const BASE_ROUTES: NavRoute[] = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  },
  {
    href: '/emprestar',
    label: 'Empréstimos',
    icon: 'M7 11l5-5m0 0l5 5m-5-5v12',
  },
  {
    href: '/devolver',
    label: 'Devoluções',
    icon: 'M7 13l5 5m0 0l5-5m-5 5V6',
  },
  {
    href: '/dispositivos',
    label: 'Dispositivos',
    icon: 'M12 18H6a2 2 0 01-2-2V8a2 2 0 012-2h12a2 2 0 012 2v4',
  },
  {
    href: '/usuarios',
    label: 'Usuários',
    icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  },
  {
    href: '/historico',
    label: 'Histórico',
    icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  {
    href: '/relatorios',
    label: 'Relatórios',
    icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  },
  {
    href: '/alertas',
    label: 'Alertas',
    icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9',
  },
  {
    href: '/ipads/qrcodes',
    label: 'QR Codes',
    icon: 'M12 4H6a2 2 0 00-2 2v6M4 16v2a2 2 0 002 2h2M16 4h2a2 2 0 012 2v2M20 16v2a2 2 0 01-2 2h-2M8 8h2v2H8zM14 8h2v2h-2zM8 14h2v2H8z',
  },
];

const MOBILE_ROUTES = ['/dashboard', '/emprestar', '/devolver', '/alertas', '/historico'];

export function Sidebar() {
  const pathname = usePathname();
  const [alertCount, setAlertCount] = useState<number>(0);

  useEffect(() => {
    async function fetchAlertCount() {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('loans')
          .select('loaned_at, reason, custom_deadline_hours')
          .eq('status', 'active');

        if (error || !data) return;

        const now = Date.now();
        const overdueCount = data.filter(
          (loan: { loaned_at: string; reason: string | null; custom_deadline_hours: number | null }) => {
            const elapsed = (now - new Date(loan.loaned_at).getTime()) / 3_600_000;
            return elapsed >= getSlaHours(loan.reason, loan.custom_deadline_hours);
          }
        ).length;

        setAlertCount(overdueCount);
      } catch {
        // silently fail — badge is non-critical
      }
    }

    fetchAlertCount();
    const interval = setInterval(fetchAlertCount, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const routes: NavRoute[] = BASE_ROUTES.map((route) =>
    route.href === '/alertas' ? { ...route, badge: alertCount } : route
  );

  const mobileRoutes = routes.filter((r) => MOBILE_ROUTES.includes(r.href));

  return (
    <>
      {/* ── Desktop sidebar (md+) ───────────────────────────────────────── */}
      <aside className="hidden md:flex w-56 flex-shrink-0 flex-col h-full bg-surface-container border-r border-outline-variant/20">
        {/* Logo / Brand */}
        <div className="px-4 py-5 border-b border-outline-variant/20">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-secondary-container flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-on-secondary-container" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 18H6a2 2 0 01-2-2V8a2 2 0 012-2h12a2 2 0 012 2v4" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold text-on-surface leading-none">iPads</p>
              <p className="text-[10px] text-on-surface-variant leading-none mt-0.5">
                Controle de empréstimos
              </p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
          {routes.map((route) => {
            const isActive =
              pathname === route.href ||
              (route.href !== '/dashboard' && pathname.startsWith(route.href));

            return (
              <Link
                key={route.href}
                href={route.href}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                  isActive
                    ? 'bg-secondary-container text-on-secondary-container shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                }`}
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={route.icon} />
                </svg>
                <span className="flex-1 truncate">{route.label}</span>
                {route.href === '/alertas' && route.badge && route.badge > 0 ? (
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none ${
                    isActive
                      ? 'bg-on-secondary-container/20 text-on-secondary-container'
                      : 'bg-error-container/20 text-error'
                  }`}>
                    {route.badge > 99 ? '99+' : route.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-outline-variant/20">
          <p className="text-[10px] text-on-surface-variant/50 text-center">
            {new Date().getFullYear()} · Escola
          </p>
        </div>
      </aside>

      {/* ── Mobile bottom nav (< md) ────────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-surface-container border-t border-outline-variant/20 flex items-stretch">
        {mobileRoutes.map((route) => {
          const isActive =
            pathname === route.href ||
            (route.href !== '/dashboard' && pathname.startsWith(route.href));

          return (
            <Link
              key={route.href}
              href={route.href}
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 relative transition-colors ${
                isActive
                  ? 'text-secondary'
                  : 'text-on-surface-variant'
              }`}
            >
              <div className="relative">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={isActive ? 2 : 1.75} d={route.icon} />
                </svg>
                {route.href === '/alertas' && route.badge && route.badge > 0 ? (
                  <span className="absolute -top-1 -right-1.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-error text-on-primary text-[9px] font-bold leading-[14px] text-center">
                    {route.badge > 99 ? '99+' : route.badge}
                  </span>
                ) : null}
              </div>
              <span className="text-[10px] leading-none font-medium">{route.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}