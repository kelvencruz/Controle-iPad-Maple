'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { reasonLabel, REASON_CATEGORIES } from '@/lib/loans'

// ─── Constantes ───────────────────────────────────────────────────────────────

type PeriodFilter = '7d' | '30d' | '90d' | '365d'

const PERIOD_LABELS: Record<PeriodFilter, string> = {
  '7d':   'Últimos 7 dias',
  '30d':  'Últimos 30 dias',
  '90d':  'Últimos 90 dias',
  '365d': 'Último ano',
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface SummaryStats {
  totalLoans: number
  activeLoans: number
  returnedLoans: number
  overdueLoans: number
  avgDurationHours: number
  overdueRate: number
}

interface DailyCount {
  date: string      // 'YYYY-MM-DD'
  count: number
}

interface ReasonStat {
  key: string
  label: string
  count: number
  pct: number
}

interface TopBorrower {
  name: string
  count: number
}

interface TopDevice {
  device_name: string
  count: number
}

interface RawLoan {
  id: string
  status: string
  reason: string | null
  loaned_at: string
  returned_at: string | null
  custom_deadline_hours: number | null
  borrower_name: string
  devices: { name: string } | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function periodToDate(period: PeriodFilter): Date {
  const days = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : 365
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d
}

function formatHoursReadable(h: number): string {
  if (h < 1)  return `${Math.round(h * 60)}min`
  if (h < 24) return `${h.toFixed(1)}h`
  const days = Math.floor(h / 24)
  const rem  = Math.round(h % 24)
  return rem > 0 ? `${days}d ${rem}h` : `${days}d`
}

function getSlaHoursLocal(reason: string | null, custom: number | null): number {
  if (reason === 'suporte_tecnico' && custom != null) return custom
  const cat = REASON_CATEGORIES.find(c => c.key === reason)
  return cat?.sla_horas ?? 72
}

function isOverdue(loan: RawLoan): boolean {
  if (loan.status !== 'active') return false
  const sla     = getSlaHoursLocal(loan.reason, loan.custom_deadline_hours)
  const elapsed = (Date.now() - new Date(loan.loaned_at).getTime()) / 3_600_000
  return elapsed >= sla
}

function durationHours(loan: RawLoan): number | null {
  if (!loan.returned_at) return null
  return (new Date(loan.returned_at).getTime() - new Date(loan.loaned_at).getTime()) / 3_600_000
}

// ─── Export CSV ───────────────────────────────────────────────────────────────

function exportCsv(
  summary: SummaryStats,
  byReason: ReasonStat[],
  topBorrowers: TopBorrower[],
  topDevices: TopDevice[],
  period: PeriodFilter,
) {
  const lines: string[] = []

  lines.push(`"Relatório de iPads — ${PERIOD_LABELS[period]}"`)
  lines.push(`"Gerado em","${new Date().toLocaleString('pt-BR')}"`)
  lines.push('')

  lines.push('"RESUMO"')
  lines.push('"Total de empréstimos","Ativos","Devolvidos","Em atraso","Tempo médio","Taxa de atraso"')
  lines.push([
    summary.totalLoans,
    summary.activeLoans,
    summary.returnedLoans,
    summary.overdueLoans,
    `"${formatHoursReadable(summary.avgDurationHours)}"`,
    `"${summary.overdueRate.toFixed(1)}%"`,
  ].join(','))
  lines.push('')

  lines.push('"POR MOTIVO"')
  lines.push('"Motivo","Empréstimos","% do total"')
  byReason.forEach(r => {
    lines.push(`"${r.label}",${r.count},"${r.pct.toFixed(1)}%"`)
  })
  lines.push('')

  lines.push('"TOP RESPONSÁVEIS"')
  lines.push('"Nome","Empréstimos"')
  topBorrowers.forEach(b => lines.push(`"${b.name}",${b.count}`))
  lines.push('')

  lines.push('"TOP DISPOSITIVOS"')
  lines.push('"iPad","Empréstimos"')
  topDevices.forEach(d => lines.push(`"${d.device_name}",${d.count}`))

  const csv  = lines.join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `relatorio-ipads-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Mini bar-chart SVG ────────────────────────────────────────────────────────
// Sem recharts — SVG inline para manter zero dependência nova nesta tarefa.
// recharts pode ser instalado depois para substituir se quiser interatividade.

function BarChart({ data, period }: { data: DailyCount[]; period: PeriodFilter }) {
  if (data.length === 0) return null

  const max        = Math.max(...data.map(d => d.count), 1)
  const barW       = period === '7d' ? 28 : period === '30d' ? 9 : period === '90d' ? 4 : 2
  const gap        = period === '7d' ? 8  : period === '30d' ? 3 : period === '90d' ? 1 : 1
  // topPad: espaço acima da barra máxima — evita label/barra encostar no topo do SVG
  const topPad     = 16
  const chartH     = 72
  const labelH     = 18
  const totalH     = topPad + chartH + labelH
  const totalW     = data.length * (barW + gap) - gap

  // Ticks do eixo Y — apenas 0 e max para não poluir
  const yTicks = [0, max]

  // Labels do eixo X
  const xLabelStep = period === '7d' ? 1 : period === '30d' ? 5 : period === '90d' ? 10 : 30
  const showLabel  = (i: number) => i === 0 || i === data.length - 1 || i % xLabelStep === 0

  function formatXLabel(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00')
    if (period === '7d') return d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
  }

  // Converte valor em Y dentro do chartH, com topPad aplicado
  function valueToY(v: number) {
    return topPad + chartH - (v / max) * chartH
  }

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`-28 0 ${totalW + 32} ${totalH}`}
        className="w-full"
        style={{ minWidth: Math.max(totalW + 32, 240) }}
        aria-label="Gráfico de empréstimos por dia"
      >
        {/* Linhas de grade Y */}
        {yTicks.map(tick => {
          const y = valueToY(tick)
          return (
            <g key={tick}>
              <line
                x1={0} y1={y} x2={totalW} y2={y}
                stroke="currentColor"
                strokeOpacity={0.08}
                strokeWidth={1}
              />
              <text
                x={-6} y={y + 3.5}
                fontSize={8.5}
                textAnchor="end"
                fill="currentColor"
                opacity={0.35}
              >
                {tick}
              </text>
            </g>
          )
        })}

        {/* Barras */}
        {data.map((d, i) => {
          const barH   = Math.max((d.count / max) * chartH, d.count > 0 ? 2 : 0)
          const x      = i * (barW + gap)
          const y      = valueToY(d.count)
          // Valor fica dentro da barra se ela for alta o suficiente, senão fica acima
          const labelInside = period === '7d' && barH > 18
          const labelY      = labelInside ? y + 13 : y - 5

          return (
            <g key={d.date}>
              {/* Fundo fantasma da barra — dá contexto nos dias vazios */}
              <rect
                x={x} y={topPad}
                width={barW} height={chartH}
                rx={barW <= 4 ? 1 : 3}
                fill="currentColor"
                opacity={0.04}
              />
              {/* Barra real */}
              {d.count > 0 && (
                <rect
                  x={x} y={y}
                  width={barW} height={barH}
                  rx={barW <= 4 ? 1 : 3}
                  className="fill-secondary"
                  opacity={0.75}
                />
              )}
              {/* Label X */}
              {showLabel(i) && (
                <text
                  x={x + barW / 2}
                  y={totalH - 2}
                  fontSize={8}
                  textAnchor="middle"
                  fill="currentColor"
                  opacity={0.4}
                >
                  {formatXLabel(d.date)}
                </text>
              )}
              {/* Valor — só para 7d */}
              {period === '7d' && d.count > 0 && (
                <text
                  x={x + barW / 2}
                  y={labelY}
                  fontSize={9}
                  textAnchor="middle"
                  fill={labelInside ? 'white' : 'currentColor'}
                  opacity={labelInside ? 0.9 : 0.65}
                >
                  {d.count}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ─── Componente: card de KPI ──────────────────────────────────────────────────

const KPI_ICONS: Record<string, React.ReactNode> = {
  loans: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h6m-6 4h4M5 4h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" />
    </svg>
  ),
  time: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <circle cx="12" cy="12" r="9" strokeLinecap="round" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 3" />
    </svg>
  ),
  overdue: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    </svg>
  ),
  returned: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
}

function KpiCard({
  label,
  value,
  sub,
  accent,
  icon,
}: {
  label: string
  value: string | number
  sub?: string
  accent?: 'warning' | 'error' | 'secondary'
  icon?: keyof typeof KPI_ICONS
}) {
  const accentColor =
    accent === 'error'       ? 'text-error'
    : accent === 'warning'   ? 'text-warning'
    : accent === 'secondary' ? 'text-secondary'
    : 'text-on-surface'

  const iconBg =
    accent === 'error'       ? 'bg-error-container/40 text-error'
    : accent === 'warning'   ? 'bg-warning-container text-warning'
    : 'bg-secondary-container/40 text-on-secondary-container'

  return (
    <div className="rounded-2xl border border-outline-variant bg-surface-container-low p-4 flex flex-col gap-3">
      {/* Topo: ícone + label */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-on-surface-variant uppercase tracking-wide leading-none">
          {label}
        </span>
        {icon && (
          <span className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${iconBg}`}>
            {KPI_ICONS[icon]}
          </span>
        )}
      </div>

      {/* Valor */}
      <p className={`text-3xl font-semibold tabular-nums leading-none ${accentColor}`}>
        {value}
      </p>

      {/* Sub */}
      {sub && (
        <p className="text-xs text-on-surface-variant border-t border-outline-variant/50 pt-2.5 leading-none">
          {sub}
        </p>
      )}
    </div>
  )
}

// ─── Componente: barra horizontal de proporção ────────────────────────────────

function ProportionBar({ pct, label, count }: { pct: number; label: string; count: number }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-on-surface truncate">{label}</span>
        <span className="text-sm tabular-nums font-mono text-on-surface-variant flex-shrink-0">
          {count} <span className="text-xs opacity-60">({pct.toFixed(0)}%)</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-container-highest overflow-hidden">
        <div
          className="h-full rounded-full bg-secondary transition-all duration-500"
          style={{ width: `${Math.max(pct, pct > 0 ? 1 : 0)}%` }}
        />
      </div>
    </div>
  )
}

// ─── Componente: linha de ranking ─────────────────────────────────────────────

function RankRow({ rank, name, count, maxCount }: { rank: number; name: string; count: number; maxCount: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-5 text-right text-xs font-mono text-on-surface-variant opacity-50 flex-shrink-0">
        {rank}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="text-sm text-on-surface truncate">{name}</span>
          <span className="text-sm font-mono tabular-nums text-on-surface-variant flex-shrink-0">{count}</span>
        </div>
        <div className="h-1 rounded-full bg-surface-container-highest overflow-hidden">
          <div
            className="h-full rounded-full bg-secondary/60 transition-all duration-500"
            style={{ width: `${(count / maxCount) * 100}%` }}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonKpi() {
  return <div className="h-[108px] animate-pulse rounded-2xl bg-surface-container" />
}

function SkeletonBlock({ h = 200 }: { h?: number }) {
  return <div className={`animate-pulse rounded-xl bg-surface-container`} style={{ height: h }} />
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RelatoriosPage() {
  const [period, setPeriod]           = useState<PeriodFilter>('30d')
  const [loading, setLoading]         = useState(true)
  const [networkError, setNetworkError] = useState(false)
  const [serverError, setServerError]  = useState<string | null>(null)
  const [exportingCsv, setExportingCsv] = useState(false)

  // Dados derivados
  const [summary, setSummary]           = useState<SummaryStats | null>(null)
  const [dailyCounts, setDailyCounts]   = useState<DailyCount[]>([])
  const [byReason, setByReason]         = useState<ReasonStat[]>([])
  const [topBorrowers, setTopBorrowers] = useState<TopBorrower[]>([])
  const [topDevices, setTopDevices]     = useState<TopDevice[]>([])

  // ── Fetch + derivação ─────────────────────────────────────────────────────

  const fetchData = useCallback(async (p: PeriodFilter) => {
    setLoading(true)
    setNetworkError(false)
    setServerError(null)

    const supabase = createClient()
    const since    = periodToDate(p)

    const { data, error } = await supabase
      .from('loans')
      .select(`
        id,
        status,
        reason,
        custom_deadline_hours,
        loaned_at,
        returned_at,
        borrower_name,
        devices ( name )
      `)
      .gte('loaned_at', since.toISOString())
      .order('loaned_at', { ascending: true })

    if (error) {
      if (error.message === 'Failed to fetch' || !navigator.onLine) {
        setNetworkError(true)
      } else {
        setServerError(error.message)
      }
      setLoading(false)
      return
    }

    const loans = (data ?? []) as unknown as RawLoan[]

    // ── Summary ────────────────────────────────────────────────────────────

    const totalLoans    = loans.length
    const activeLoans   = loans.filter(l => l.status === 'active').length
    const returnedLoans = loans.filter(l => l.status === 'returned').length
    const overdueLoans  = loans.filter(isOverdue).length

    const durations = loans
      .map(durationHours)
      .filter((h): h is number => h !== null)
    const avgDurationHours = durations.length
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0
    const overdueRate = totalLoans > 0 ? (overdueLoans / totalLoans) * 100 : 0

    setSummary({ totalLoans, activeLoans, returnedLoans, overdueLoans, avgDurationHours, overdueRate })

    // ── Por dia ────────────────────────────────────────────────────────────
    // Gera todos os dias do período, preenche com 0 onde não há empréstimos

    const dayMap = new Map<string, number>()
    loans.forEach(l => {
      const day = l.loaned_at.slice(0, 10)
      dayMap.set(day, (dayMap.get(day) ?? 0) + 1)
    })

    const days    = p === '7d' ? 7 : p === '30d' ? 30 : p === '90d' ? 90 : 365
    const allDays: DailyCount[] = []
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      allDays.push({ date: key, count: dayMap.get(key) ?? 0 })
    }
    setDailyCounts(allDays)

    // ── Por motivo ─────────────────────────────────────────────────────────

    const reasonMap = new Map<string, number>()
    loans.forEach(l => {
      const k = l.reason ?? 'outro'
      reasonMap.set(k, (reasonMap.get(k) ?? 0) + 1)
    })
    const reasonStats: ReasonStat[] = REASON_CATEGORIES.map(cat => ({
      key:   cat.key,
      label: cat.label,
      count: reasonMap.get(cat.key) ?? 0,
      pct:   totalLoans > 0 ? ((reasonMap.get(cat.key) ?? 0) / totalLoans) * 100 : 0,
    })).sort((a, b) => b.count - a.count)
    setByReason(reasonStats)

    // ── Top borrowers ──────────────────────────────────────────────────────

    const borrowerMap = new Map<string, number>()
    loans.forEach(l => {
      borrowerMap.set(l.borrower_name, (borrowerMap.get(l.borrower_name) ?? 0) + 1)
    })
    const topB: TopBorrower[] = [...borrowerMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }))
    setTopBorrowers(topB)

    // ── Top devices ────────────────────────────────────────────────────────

    const deviceMap = new Map<string, number>()
    loans.forEach(l => {
      const name = l.devices?.name ?? '—'
      deviceMap.set(name, (deviceMap.get(name) ?? 0) + 1)
    })
    const topD: TopDevice[] = [...deviceMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([device_name, count]) => ({ device_name, count }))
    setTopDevices(topD)

    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData(period)
  }, [fetchData, period])

  // ── Export ─────────────────────────────────────────────────────────────────

  function handleExport() {
    if (!summary) return
    setExportingCsv(true)
    exportCsv(summary, byReason, topBorrowers, topDevices, period)
    setExportingCsv(false)
  }

  // ── Derived ─────────────────────────────────────────────────────────────────

  const hasError = networkError || !!serverError
  const maxBorrower = topBorrowers[0]?.count ?? 1
  const maxDevice   = topDevices[0]?.count ?? 1

  // ── JSX ─────────────────────────────────────────────────────────────────────

  return (
    <div className="text-on-surface px-4 md:px-6 py-4 md:py-6 pb-24 md:pb-6">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-on-surface">Relatórios</h1>
            <p className="text-sm text-on-surface-variant mt-0.5">
              {PERIOD_LABELS[period]}
            </p>
          </div>
          <button
            onClick={handleExport}
            disabled={exportingCsv || loading || hasError || !summary || summary.totalLoans === 0}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-outline-variant bg-surface-container text-sm font-medium text-on-surface hover:bg-surface-container-high disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
          >
            {exportingCsv ? (
              <svg className="w-4 h-4 animate-spin fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2">
                <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                <path d="M12 2a10 10 0 0110 10" strokeLinecap="round" />
              </svg>
            ) : (
              <svg className="w-4 h-4 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            )}
            <span className="hidden sm:inline">Exportar CSV</span>
          </button>
        </div>

        {/* Seletor de período */}
        <div className="flex gap-2 overflow-x-auto pb-0.5 -mx-4 px-4 md:mx-0 md:px-0">
          {(['7d', '30d', '90d', '365d'] as PeriodFilter[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border whitespace-nowrap transition-colors flex-shrink-0 ${
                period === p
                  ? 'bg-primary/10 text-primary border-primary/30'
                  : 'bg-surface-container text-on-surface-variant border-outline-variant hover:bg-surface-container-high'
              }`}
            >
              {p === '7d' ? '7 dias' : p === '30d' ? '30 dias' : p === '90d' ? '90 dias' : '1 ano'}
            </button>
          ))}
        </div>

        {/* Erros */}
        {networkError && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-error-container/20 border border-error/20 text-sm text-error">
            <svg className="w-4 h-4 mt-0.5 flex-shrink-0 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636a9 9 0 010 12.728M15.536 8.464a5 5 0 010 7.072M6.343 6.343a9 9 0 000 12.728M9.172 9.172a5 5 0 000 7.071M12 12h.01" />
            </svg>
            <div>
              <p className="font-medium">Sem conexão</p>
              <p className="text-xs opacity-80 mt-0.5">Verifique sua internet e tente novamente.</p>
            </div>
          </div>
        )}
        {serverError && !networkError && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-error-container/20 border border-error/20 text-sm text-error">
            <svg className="w-4 h-4 mt-0.5 flex-shrink-0 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <p>{serverError}</p>
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {loading ? (
            [...Array(4)].map((_, i) => <SkeletonKpi key={i} />)
          ) : summary ? (
            <>
              <KpiCard
                label="Empréstimos"
                value={summary.totalLoans}
                sub={`${summary.activeLoans} ativo${summary.activeLoans !== 1 ? 's' : ''} agora`}
                icon="loans"
              />
              <KpiCard
                label="Tempo médio"
                value={summary.totalLoans > 0 ? formatHoursReadable(summary.avgDurationHours) : '—'}
                sub="por devolução"
                icon="time"
              />
              <KpiCard
                label="Taxa de atraso"
                value={summary.totalLoans > 0 ? `${summary.overdueRate.toFixed(1)}%` : '—'}
                sub={`${summary.overdueLoans} em atraso`}
                accent={summary.overdueRate > 20 ? 'error' : summary.overdueRate > 10 ? 'warning' : undefined}
                icon="overdue"
              />
              <KpiCard
                label="Devolvidos"
                value={summary.returnedLoans}
                sub={summary.totalLoans > 0
                  ? `${((summary.returnedLoans / summary.totalLoans) * 100).toFixed(0)}% do total`
                  : undefined}
                icon="returned"
              />
            </>
          ) : null}
        </div>

        {/* Gráfico de empréstimos por dia */}
        <div className="rounded-xl border border-outline-variant bg-surface-container p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-on-surface">Empréstimos por dia</h2>
            {!loading && dailyCounts.length > 0 && (
              <span className="text-xs text-on-surface-variant opacity-60">
                pico: {Math.max(...dailyCounts.map(d => d.count))}
              </span>
            )}
          </div>
          {loading ? (
            <SkeletonBlock h={100} />
          ) : dailyCounts.every(d => d.count === 0) ? (
            <p className="text-sm text-on-surface-variant opacity-50 py-6 text-center">
              Nenhum empréstimo no período
            </p>
          ) : (
            <BarChart data={dailyCounts} period={period} />
          )}
        </div>

        {/* Distribuição por motivo + Top responsáveis (lado a lado no desktop) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Por motivo */}
          <div className="rounded-xl border border-outline-variant bg-surface-container p-4 space-y-3">
            <h2 className="text-sm font-medium text-on-surface">Por motivo</h2>
            {loading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => <SkeletonBlock key={i} h={32} />)}
              </div>
            ) : byReason.every(r => r.count === 0) ? (
              <p className="text-sm text-on-surface-variant opacity-50 py-4 text-center">
                Nenhum empréstimo no período
              </p>
            ) : (
              <div className="space-y-3.5">
                {byReason.map(r => (
                  <ProportionBar key={r.key} pct={r.pct} label={r.label} count={r.count} />
                ))}
              </div>
            )}
          </div>

          {/* Top responsáveis */}
          <div className="rounded-xl border border-outline-variant bg-surface-container p-4 space-y-3">
            <h2 className="text-sm font-medium text-on-surface">Top responsáveis</h2>
            {loading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => <SkeletonBlock key={i} h={32} />)}
              </div>
            ) : topBorrowers.length === 0 ? (
              <p className="text-sm text-on-surface-variant opacity-50 py-4 text-center">
                Nenhum empréstimo no período
              </p>
            ) : (
              <div className="space-y-3.5">
                {topBorrowers.map((b, i) => (
                  <RankRow
                    key={b.name}
                    rank={i + 1}
                    name={b.name}
                    count={b.count}
                    maxCount={maxBorrower}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Top dispositivos */}
        <div className="rounded-xl border border-outline-variant bg-surface-container p-4 space-y-3">
          <h2 className="text-sm font-medium text-on-surface">iPads mais emprestados</h2>
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[...Array(6)].map((_, i) => <SkeletonBlock key={i} h={32} />)}
            </div>
          ) : topDevices.length === 0 ? (
            <p className="text-sm text-on-surface-variant opacity-50 py-4 text-center">
              Nenhum empréstimo no período
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {topDevices.map((d, i) => (
                <RankRow
                  key={d.device_name}
                  rank={i + 1}
                  name={d.device_name}
                  count={d.count}
                  maxCount={maxDevice}
                />
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
