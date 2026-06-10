'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import {
  reasonLabel,
  statusBadgeClasses,
  formatElapsed,
  REASON_CATEGORIES,
  type ReasonKey,
} from '@/lib/loans'

// ─── Constantes ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 20
// INC-S25-03: limite de segurança para busca sem paginação
const SEARCH_LIMIT = 500

// ─── Types ────────────────────────────────────────────────────────────────────

type LoanStatus = 'all' | 'active' | 'returned'

type PeriodFilter = 'all' | '7d' | '30d' | '90d'

interface HistoricoLoan {
  // BUG-14-style: campos de loans diretamente — NÃO usa a view active_loans.
  // Aqui id = loans.id (UUID primário). Se migrar para a view, o campo vira loan_id.
  id: string
  device_id: string
  device_name: string
  qr_code: string
  borrower_name: string
  reason: string | null
  reason_detail: string | null
  custom_deadline_hours: number | null
  loaned_at: string
  returned_at: string | null
  status: 'active' | 'returned'
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatDateShort(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function periodToDate(period: PeriodFilter): Date | null {
  if (period === 'all') return null
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d
}

function elapsedBetween(loanedAt: string, returnedAt: string | null): string {
  const end = returnedAt ? new Date(returnedAt).getTime() : Date.now()
  const totalMinutes = Math.floor((end - new Date(loanedAt).getTime()) / 60_000)
  // INC-67: evita exibir '0min' para devoluções no mesmo minuto
  if (totalMinutes < 1) return '< 1min'
  const days    = Math.floor(totalMinutes / 1440)
  const hours   = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  if (days > 0)  return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}min`
  return `${minutes}min`
}

// ─── Export CSV ───────────────────────────────────────────────────────────────

function exportCsv(loans: HistoricoLoan[]) {
  const header = ['iPad', 'Responsável', 'Motivo', 'Detalhe', 'Status', 'Emprestado em', 'Devolvido em', 'Tempo']
  const rows = loans.map(l => [
    l.device_name,
    l.borrower_name,
    reasonLabel(l.reason),
    l.reason_detail ?? '',
    l.status === 'active' ? 'Ativo' : 'Devolvido',
    formatDate(l.loaned_at),
    formatDate(l.returned_at),
    elapsedBetween(l.loaned_at, l.returned_at),
  ])
  const csv = [header, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n')

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `historico-ipads-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── INC-70: query builder centralizado ──────────────────────────────────────
// Elimina duplicação entre fetchLoans e handleExportCsv.
// paginate=true aplica .range(); paginate=false busca tudo (para CSV e busca ativa).

function buildLoansQuery(
  supabase: ReturnType<typeof createClient>,
  opts: {
    status: LoanStatus
    period: PeriodFilter
    reason: string
    page: number
    paginate: boolean
    limit?: number
  },
) {
  // INC-69: busca de texto movida inteiramente para o cliente —
  // não filtramos no banco (evita count inconsistente entre borrower_name e device_name).
  let query = supabase
    .from('loans')
    .select(`
      id,
      borrower_name,
      reason,
      reason_detail,
      custom_deadline_hours,
      loaned_at,
      returned_at,
      status,
      device_id,
      devices ( id, name, qr_code )
    `, { count: 'exact' })
    .order('loaned_at', { ascending: false })

  if (opts.status !== 'all') {
    query = query.eq('status', opts.status)
  }

  const since = periodToDate(opts.period)
  if (since) {
    query = query.gte('loaned_at', since.toISOString())
  }

  if (opts.reason !== 'all') {
    query = query.eq('reason', opts.reason)
  }

  if (opts.paginate) {
    query = query.range(opts.page * PAGE_SIZE, (opts.page + 1) * PAGE_SIZE - 1)
  } else if (opts.limit) {
    // INC-S25-03: cap de segurança quando busca está ativa
    query = query.limit(opts.limit)
  }

  return query
}

function mapLoans(data: any[]): HistoricoLoan[] {
  return data.map((l: any) => ({
    id: l.id,
    device_id: l.devices?.id ?? '',
    device_name: l.devices?.name ?? '—',
    qr_code: l.devices?.qr_code ?? '',
    borrower_name: l.borrower_name ?? '—',
    reason: l.reason,
    reason_detail: l.reason_detail ?? null,
    custom_deadline_hours: l.custom_deadline_hours ?? null,
    loaned_at: l.loaned_at,
    returned_at: l.returned_at ?? null,
    status: l.status,
  }))
}

// INC-69: filtro de texto inteiramente no cliente
function applyTextFilter(loans: HistoricoLoan[], q: string): HistoricoLoan[] {
  if (!q.trim()) return loans
  const lower = q.trim().toLowerCase()
  return loans.filter(
    l =>
      l.device_name.toLowerCase().includes(lower) ||
      l.borrower_name.toLowerCase().includes(lower),
  )
}

// ─── Componente StatusBadge ───────────────────────────────────────────────────

function StatusBadge({ loan }: { loan: HistoricoLoan }) {
  if (loan.status === 'returned') {
    return (
      <span className="text-xs font-medium px-2 py-0.5 rounded-md border bg-success/10 text-success border-success/20">
        Devolvido
      </span>
    )
  }
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-md border ${statusBadgeClasses(loan.loaned_at, loan.reason, loan.custom_deadline_hours)}`}>
      {formatElapsed(loan.loaned_at)}
    </span>
  )
}

// ─── Componente LoanCard (mobile) ─────────────────────────────────────────────

function LoanCard({ loan }: { loan: HistoricoLoan }) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container p-3.5 space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-secondary-container/30 flex items-center justify-center flex-shrink-0 border border-outline-variant/50">
            <svg className="w-4 h-4 text-on-secondary-container fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="1.5">
              <rect x="5" y="2" width="14" height="20" rx="2" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="12" cy="17.5" r="1" fill="currentColor" stroke="none" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-on-surface truncate">{loan.device_name}</p>
            <p className="text-xs text-on-surface-variant truncate">{loan.borrower_name}</p>
          </div>
        </div>
        <StatusBadge loan={loan} />
      </div>

      <div className="flex items-center justify-between gap-4 text-xs text-on-surface-variant pt-0.5 border-t border-outline-variant/50">
        <span className="truncate">{reasonLabel(loan.reason)}</span>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span>{formatDateShort(loan.loaned_at)}</span>
          {loan.returned_at && (
            <>
              <span className="text-outline-variant">→</span>
              <span>{formatDateShort(loan.returned_at)}</span>
            </>
          )}
        </div>
      </div>

      {loan.reason_detail && (
        <p className="text-xs text-on-surface-variant opacity-70 truncate">
          {loan.reason_detail}
        </p>
      )}
    </div>
  )
}

// ─── Componente LoanTableRow (desktop) ────────────────────────────────────────

function LoanTableRow({ loan }: { loan: HistoricoLoan }) {
  return (
    <tr className="border-b border-outline-variant/50 hover:bg-surface-container-high/40 transition-colors">
      <td className="py-3 px-4">
        <p className="text-sm font-medium text-on-surface">{loan.device_name}</p>
        <p className="text-xs text-on-surface-variant">{loan.qr_code}</p>
      </td>
      <td className="py-3 px-4 text-sm text-on-surface">{loan.borrower_name}</td>
      <td className="py-3 px-4">
        <p className="text-sm text-on-surface">{reasonLabel(loan.reason)}</p>
        {loan.reason_detail && (
          <p className="text-xs text-on-surface-variant truncate max-w-[160px]">{loan.reason_detail}</p>
        )}
      </td>
      <td className="py-3 px-4 text-sm text-on-surface-variant whitespace-nowrap">
        {formatDate(loan.loaned_at)}
      </td>
      <td className="py-3 px-4 text-sm text-on-surface-variant whitespace-nowrap">
        {formatDate(loan.returned_at)}
      </td>
      <td className="py-3 px-4 text-sm text-on-surface-variant whitespace-nowrap font-mono tabular-nums">
        {elapsedBetween(loan.loaned_at, loan.returned_at)}
      </td>
      <td className="py-3 px-4">
        <StatusBadge loan={loan} />
      </td>
    </tr>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HistoricoPage() {
  const [loans, setLoans] = useState<HistoricoLoan[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  // INC-S25-03: avisa quando count do período excede SEARCH_LIMIT
  const [searchCapped, setSearchCapped] = useState(false)

  // Filtros
  const [statusFilter, setStatusFilter] = useState<LoanStatus>('all')
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('30d')
  const [reasonFilter, setReasonFilter] = useState<string>('all')
  const [search, setSearch] = useState('')

  const [loading, setLoading] = useState(true)
  const [networkError, setNetworkError] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const [exportingCsv, setExportingCsv] = useState(false)

  // Ref para abortar fetch anterior ao mudar filtros
  const fetchIdRef = useRef(0)

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchLoans = useCallback(async (
    currentPage: number,
    status: LoanStatus,
    period: PeriodFilter,
    reason: string,
    q: string,
  ) => {
    const thisFetch = ++fetchIdRef.current

    setLoading(true)
    setNetworkError(false)
    setServerError(null)
    setSearchCapped(false)

    const supabase = createClient()
    const isSearching = q.trim().length > 0

    // INC-S25-03: quando busca está ativa, busca sem .range() para o filtro
    // client-side operar sobre o período completo (cap: SEARCH_LIMIT registros).
    const { data, error: fetchErr, count } = await buildLoansQuery(supabase, {
      status,
      period,
      reason,
      page: currentPage,
      paginate: !isSearching,
      limit: isSearching ? SEARCH_LIMIT : undefined,
    })

    // Descarta se um fetch mais recente já foi disparado
    if (thisFetch !== fetchIdRef.current) return

    if (fetchErr) {
      if (fetchErr.message === 'Failed to fetch' || !navigator.onLine) {
        setNetworkError(true)
      } else {
        setServerError(fetchErr.message)
      }
      setLoading(false)
      return
    }

    const mapped = mapLoans(data ?? [])
    // INC-69: filtro de texto no cliente
    const finalLoans = applyTextFilter(mapped, q)

    // INC-S25-03: avisa se o período tem mais registros do que o cap de busca
    if (isSearching && (count ?? 0) > SEARCH_LIMIT) {
      setSearchCapped(true)
    }

    setLoans(finalLoans)
    // INC-69: quando há busca ativa, count do banco não reflete o filtro de texto —
    // usa finalLoans.length para exibição; paginação usa count sem texto.
    setTotal(count ?? 0)
    setLoading(false)
  }, [])

  // Dispara fetch quando filtros ou página mudam
  useEffect(() => {
    fetchLoans(page, statusFilter, periodFilter, reasonFilter, search)
  }, [fetchLoans, page, statusFilter, periodFilter, reasonFilter, search])

  // Reseta para página 0 ao mudar filtros
  function applyFilter<T>(setter: (v: T) => void) {
    return (v: T) => { setter(v); setPage(0) }
  }

  // ── Export CSV ──────────────────────────────────────────────────────────────

  async function handleExportCsv() {
    setExportingCsv(true)

    // INC-70: usa buildLoansQuery com paginate=false — sem duplicação
    const supabase = createClient()
    const { data } = await buildLoansQuery(supabase, {
      status: statusFilter,
      period: periodFilter,
      reason: reasonFilter,
      page: 0,
      paginate: false,
    })

    // INC-69: filtro de texto no cliente também para o CSV
    const mapped = mapLoans(data ?? [])
    const finalLoans = applyTextFilter(mapped, search)

    exportCsv(finalLoans)
    setExportingCsv(false)
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const totalPages = search.trim() ? 1 : Math.ceil(total / PAGE_SIZE)
  const hasError     = networkError || !!serverError
  const isEmpty      = !loading && !hasError && loans.length === 0
  // INC-69: quando há busca ativa, exibe contagem filtrada localmente
  const displayTotal = search.trim() ? loans.length : total

  // ── Render helpers ─────────────────────────────────────────────────────────

  function FilterChip({
    active,
    onClick,
    children,
  }: {
    active: boolean
    onClick: () => void
    children: React.ReactNode
  }) {
    return (
      <button
        onClick={onClick}
        className={`px-3 py-1.5 rounded-lg text-xs font-medium border whitespace-nowrap transition-colors ${
          active
            ? 'bg-primary/10 text-primary border-primary/30'
            : 'bg-surface-container text-on-surface-variant border-outline-variant hover:bg-surface-container-high'
        }`}
      >
        {children}
      </button>
    )
  }

  // ── JSX ────────────────────────────────────────────────────────────────────

  return (
    <div className="text-on-surface px-4 md:px-6 py-4 md:py-6 pb-24 md:pb-6">
      <div className="max-w-5xl mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-on-surface">Histórico</h1>
            <p className="text-sm text-on-surface-variant mt-0.5">
              {loading ? '…' : `${displayTotal} registro${displayTotal !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button
            onClick={handleExportCsv}
            disabled={exportingCsv || loading || hasError || total === 0}
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

        {/* Busca */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-container border border-outline-variant">
          <svg className="w-4 h-4 text-on-surface-variant flex-shrink-0 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            type="text"
            placeholder="iPad ou responsável..."
            value={search}
            onChange={e => applyFilter(setSearch)(e.target.value)}
            className="bg-transparent outline-none w-full text-sm placeholder:text-on-surface-variant text-on-surface"
          />
          {search && (
            <button
              onClick={() => applyFilter(setSearch)('')}
              className="text-on-surface-variant hover:text-on-surface transition-colors"
            >
              <svg className="w-4 h-4 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* INC-S25-03: aviso de cap de busca */}
        {searchCapped && !loading && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-warning/10 border border-warning/20 text-xs text-warning">
            <svg className="w-3.5 h-3.5 flex-shrink-0 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <span>
              O período selecionado tem mais de {SEARCH_LIMIT} registros. A busca está limitada aos {SEARCH_LIMIT} mais recentes — refine os filtros de período ou motivo para resultados completos.
            </span>
          </div>
        )}

        {/* INC-68: filtros em grupos independentes — separadores não somem em flex-wrap */}
        <div className="flex gap-2 overflow-x-auto pb-0.5 -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap">

          {/* Grupo: Status */}
          <div className="flex gap-2 flex-shrink-0">
            <FilterChip active={statusFilter === 'all'}      onClick={() => applyFilter(setStatusFilter)('all')}>Todos</FilterChip>
            <FilterChip active={statusFilter === 'active'}   onClick={() => applyFilter(setStatusFilter)('active')}>Ativos</FilterChip>
            <FilterChip active={statusFilter === 'returned'} onClick={() => applyFilter(setStatusFilter)('returned')}>Devolvidos</FilterChip>
          </div>

          <div className="w-px bg-outline-variant flex-shrink-0 self-stretch mx-1" />

          {/* Grupo: Período */}
          <div className="flex gap-2 flex-shrink-0">
            <FilterChip active={periodFilter === '7d'}  onClick={() => applyFilter(setPeriodFilter)('7d')}>7 dias</FilterChip>
            <FilterChip active={periodFilter === '30d'} onClick={() => applyFilter(setPeriodFilter)('30d')}>30 dias</FilterChip>
            <FilterChip active={periodFilter === '90d'} onClick={() => applyFilter(setPeriodFilter)('90d')}>90 dias</FilterChip>
            <FilterChip active={periodFilter === 'all'} onClick={() => applyFilter(setPeriodFilter)('all')}>Todo período</FilterChip>
          </div>

          <div className="w-px bg-outline-variant flex-shrink-0 self-stretch mx-1" />

          {/* Grupo: Motivo */}
          <div className="flex gap-2 flex-shrink-0 md:flex-wrap">
            <FilterChip active={reasonFilter === 'all'} onClick={() => applyFilter(setReasonFilter)('all')}>Todos os motivos</FilterChip>
            {REASON_CATEGORIES.map(cat => (
              <FilterChip
                key={cat.key}
                active={reasonFilter === cat.key}
                onClick={() => applyFilter(setReasonFilter)(cat.key)}
              >
                {cat.label}
              </FilterChip>
            ))}
          </div>
        </div>

        {/* Estado de erro */}
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
              <path strokeLinecap="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 00-3.42 0z" />
            </svg>
            <p>{serverError}</p>
          </div>
        )}

        {/* Estado vazio */}
        {isEmpty && (
          <div className="text-center py-16 space-y-2">
            <p className="text-sm text-on-surface-variant opacity-50">
              {search
                ? 'Nenhum resultado para a busca'
                : 'Nenhum registro encontrado para os filtros selecionados'}
            </p>
            {(search || statusFilter !== 'all' || periodFilter !== '30d' || reasonFilter !== 'all') && (
              <button
                onClick={() => {
                  setSearch('')
                  setStatusFilter('all')
                  setPeriodFilter('30d')
                  setReasonFilter('all')
                  setPage(0)
                }}
                className="text-xs text-primary hover:underline"
              >
                Limpar filtros
              </button>
            )}
          </div>
        )}

        {/* Lista mobile */}
        <div className="md:hidden space-y-2">
          {loading ? (
            [...Array(5)].map((_, i) => (
              <div key={i} className="h-[88px] animate-pulse rounded-xl bg-surface-container" />
            ))
          ) : (
            loans.map(loan => <LoanCard key={loan.id} loan={loan} />)
          )}
        </div>

        {/* Tabela desktop */}
        {!loading && loans.length > 0 && (
          <div className="hidden md:block rounded-xl border border-outline-variant overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-outline-variant bg-surface-container-high">
                  <th className="py-3 px-4 text-left text-xs font-medium text-on-surface-variant">iPad</th>
                  <th className="py-3 px-4 text-left text-xs font-medium text-on-surface-variant">Responsável</th>
                  <th className="py-3 px-4 text-left text-xs font-medium text-on-surface-variant">Motivo</th>
                  <th className="py-3 px-4 text-left text-xs font-medium text-on-surface-variant">Emprestado</th>
                  <th className="py-3 px-4 text-left text-xs font-medium text-on-surface-variant">Devolvido</th>
                  <th className="py-3 px-4 text-left text-xs font-medium text-on-surface-variant">Tempo</th>
                  <th className="py-3 px-4 text-left text-xs font-medium text-on-surface-variant">Status</th>
                </tr>
              </thead>
              <tbody className="bg-surface-container/30">
                {loans.map(loan => <LoanTableRow key={loan.id} loan={loan} />)}
              </tbody>
            </table>
          </div>
        )}

        {/* Skeleton desktop */}
        {loading && (
          <div className="hidden md:block rounded-xl border border-outline-variant overflow-hidden">
            <div className="h-10 bg-surface-container-high border-b border-outline-variant" />
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-14 animate-pulse bg-surface-container border-b border-outline-variant/50 last:border-0" />
            ))}
          </div>
        )}

        {/* Paginação */}
        {!loading && !hasError && totalPages > 1 && (
          <div className="flex items-center justify-between gap-4 pt-2">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-outline-variant text-sm text-on-surface-variant hover:bg-surface-container disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-4 h-4 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Anterior
            </button>

            <span className="text-sm text-on-surface-variant tabular-nums">
              {page + 1} / {totalPages}
            </span>

            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-outline-variant text-sm text-on-surface-variant hover:bg-surface-container disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Próxima
              <svg className="w-4 h-4 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
