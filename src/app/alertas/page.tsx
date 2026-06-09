'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase'
// INC-48a/b: reasonLabel e formatElapsed importados de '@/lib/loans' — NÃO reimplementar inline
// INC-63: formatHours importado para formatar hours_elapsed (number) e sla_hours (number)
import { getSlaHours, reasonLabel, formatElapsed, formatHours, type ReasonKey } from '@/lib/loans'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AlertLoan {
  loan_id: string
  device_id: string
  device_name: string
  qr_code: string
  borrower_name: string
  reason: ReasonKey | null
  reason_detail: string | null
  custom_deadline_hours: number | null
  loaned_at: string
  hours_elapsed: number
}

type AlertLevel = 'overdue' | 'warning'

interface EnrichedLoan extends AlertLoan {
  sla_hours: number | null
  pct: number | null
  level: AlertLevel
  hours_over: number | null
}

// ─── Enrich ───────────────────────────────────────────────────────────────────

function enrichLoan(loan: AlertLoan): EnrichedLoan {
  const sla = getSlaHours(loan.reason, loan.custom_deadline_hours ?? undefined)
  const pct = sla != null ? (loan.hours_elapsed / sla) * 100 : null
  const level: AlertLevel = pct == null || pct >= 100 ? 'overdue' : 'warning'
  const hours_over = pct != null && pct >= 100 ? +(loan.hours_elapsed - sla!).toFixed(1) : null
  return { ...loan, sla_hours: sla, pct, level, hours_over }
}

// ─── Badge ────────────────────────────────────────────────────────────────────

function AlertBadge({ level, pct, hours_over }: { level: AlertLevel; pct: number | null; hours_over: number | null }) {
  if (level === 'overdue') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-error-container/30 text-error border border-error/20">
        <span className="w-1.5 h-1.5 rounded-full bg-error animate-pulse" />
        {/* INC-63: hours_over é number — usar formatHours, não formatElapsed */}
        {hours_over != null ? `+${formatHours(hours_over)} atrasado` : 'Atrasado'}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-warning-container/40 text-warning border border-warning/20">
      <span className="w-1.5 h-1.5 rounded-full bg-warning" />
      {pct != null ? `${Math.round(pct)}% do prazo` : 'Atenção'}
    </span>
  )
}

// ─── SLA Progress Bar ─────────────────────────────────────────────────────────

function SlaBar({ pct, level }: { pct: number | null; level: AlertLevel }) {
  if (pct == null) return null
  const capped = Math.min(pct, 100)
  return (
    <div className="w-full h-1 rounded-full bg-surface-container-highest overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${level === 'overdue' ? 'bg-error' : 'bg-warning'}`}
        style={{ width: `${capped}%` }}
      />
    </div>
  )
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function AlertCard({
  loan,
  onReturn,
  returning,
}: {
  loan: EnrichedLoan
  onReturn: (id: string) => void
  returning: boolean
}) {
  return (
    // INC-66: border-color via style inline substituído por classe Tailwind condicional
    <div
      className={`rounded-2xl border bg-surface-container overflow-hidden transition-opacity ${returning ? 'opacity-50 pointer-events-none' : ''} ${
        loan.level === 'overdue' ? 'border-error/25' : 'border-outline-variant'
      }`}
    >
      {/* Top stripe */}
      <div className={`h-0.5 w-full ${loan.level === 'overdue' ? 'bg-error' : 'bg-warning'}`} />

      <div className="px-4 py-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center ${
              loan.level === 'overdue' ? 'bg-error-container/30' : 'bg-warning-container/40'
            }`}>
              <svg
                viewBox="0 0 24 24"
                className={`w-4.5 h-4.5 fill-none stroke-current ${loan.level === 'overdue' ? 'text-error' : 'text-warning'}`}
                strokeWidth="1.8"
              >
                <rect x="5" y="2" width="14" height="20" rx="2" />
                <line x1="12" y1="18" x2="12" y2="18.01" strokeLinecap="round" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-on-surface truncate">{loan.device_name}</p>
              <p className="text-xs text-on-surface-variant truncate">{loan.borrower_name}</p>
            </div>
          </div>
          <AlertBadge level={loan.level} pct={loan.pct} hours_over={loan.hours_over} />
        </div>

        {/* SLA bar */}
        <div className="mb-3">
          <SlaBar pct={loan.pct} level={loan.level} />
        </div>

        {/* Info row */}
        <div className="flex items-center gap-4 mb-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-on-surface-variant fill-none stroke-current flex-shrink-0" strokeWidth="2">
              <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" strokeLinecap="round" />
            </svg>
            {/* INC-63: hours_elapsed e sla_hours são number — usar formatHours, não formatElapsed */}
            <span className="text-xs font-mono text-on-surface-variant">
              {formatHours(loan.hours_elapsed)}
              {loan.sla_hours != null && (
                <span className="opacity-60"> / {formatHours(loan.sla_hours)}</span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-on-surface-variant fill-none stroke-current flex-shrink-0" strokeWidth="2">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" strokeLinecap="round" />
            </svg>
            <span className="text-xs text-on-surface-variant">{reasonLabel(loan.reason)}</span>
          </div>
          {loan.reason === 'outro' && loan.reason_detail && (
            <p className="text-xs text-on-surface-variant italic truncate w-full">&quot;{loan.reason_detail}&quot;</p>
          )}
        </div>

        {/* Action */}
        <button
          onClick={() => onReturn(loan.loan_id)}
          disabled={returning}
          className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 bg-primary text-on-primary hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {returning ? (
            <>
              <svg className="w-4 h-4 animate-spin fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2">
                <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                <path d="M12 2a10 10 0 0110 10" strokeLinecap="round" />
              </svg>
              Registrando...
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2.5">
                <path d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Registrar devolução
            </>
          )}
        </button>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AlertasPage() {
  const [loans, setLoans] = useState<EnrichedLoan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [returningId, setReturningId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'overdue' | 'warning'>('all')

  const loadAlerts = useCallback(async () => {
    setLoading(true)
    setError(null)
    const sb = createClient()

    const { data, error: fetchError } = await sb
      .from('active_loans')
      .select('loan_id, device_id, device_name, qr_code, borrower_name, reason, reason_detail, custom_deadline_hours, loaned_at, hours_elapsed')
      .order('loaned_at', { ascending: true })

    if (fetchError) {
      setError(fetchError.message)
      setLoading(false)
      return
    }

    const enriched = (data ?? [])
      .map((l) => enrichLoan(l as AlertLoan))
      .filter((l) => {
        if (l.level === 'overdue') return true
        if (l.pct == null) return false
        return l.pct >= 80
      })
      .sort((a, b) => {
        if (a.level !== b.level) return a.level === 'overdue' ? -1 : 1
        return b.hours_elapsed - a.hours_elapsed
      })

    setLoans(enriched)
    setLoading(false)
  }, [])

  useEffect(() => { loadAlerts() }, [loadAlerts])

  // INC-48c: UPDATE usa loans.id diretamente (UUID da tabela loans).
  // A view active_loans expõe esse campo como loan_id — NÃO confundir com l.id.
  const handleReturn = async (loanId: string) => {
    setReturningId(loanId)
    const sb = createClient()

    const { error: retErr } = await sb
      .from('loans')
      .update({ status: 'returned', returned_at: new Date().toISOString() })
      .eq('id', loanId)
      .eq('status', 'active')

    if (retErr) {
      toast.error(retErr.message || 'Erro ao registrar devolução.')
      setReturningId(null)
      return
    }

    // Remove da lista localmente sem refetch
    setLoans((prev) => prev.filter((l) => l.loan_id !== loanId))
    setReturningId(null)
  }

  const filtered = filter === 'all' ? loans : loans.filter((l) => l.level === filter)
  const overdueCount = loans.filter((l) => l.level === 'overdue').length
  const warningCount = loans.filter((l) => l.level === 'warning').length

  // ─── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 md:px-6 py-6 pb-24 md:pb-6">
        <div className="h-7 w-40 rounded-lg animate-pulse bg-surface-container mb-1" />
        <div className="h-4 w-56 rounded animate-pulse bg-surface-container mb-6" />
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-48 rounded-2xl animate-pulse bg-surface-container" />
          ))}
        </div>
      </div>
    )
  }

  // ─── Error ──────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4 md:px-6 py-6 pb-24 md:pb-6">
        <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
          <div className="w-12 h-12 rounded-full bg-error-container/30 flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-6 h-6 text-error fill-none stroke-current" strokeWidth="2">
              <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" strokeLinecap="round" />
            </svg>
          </div>
          <p className="text-sm text-error">{error}</p>
          <button
            onClick={loadAlerts}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-surface-container hover:bg-surface-container-high text-on-surface transition-colors"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    )
  }

  // ─── Empty ──────────────────────────────────────────────────────────────────
  if (loans.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 md:px-6 py-6 pb-24 md:pb-6">
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-surface-container flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-8 h-8 text-on-surface-variant fill-none stroke-current" strokeWidth="1.5">
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" />
            </svg>
          </div>
          <p className="font-semibold text-on-surface">Tudo em dia</p>
          <p className="text-sm text-on-surface-variant max-w-xs">
            Nenhum empréstimo vencido ou próximo do prazo no momento.
          </p>
        </div>
      </div>
    )
  }

  // ─── Main ────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto px-4 md:px-6 py-6 pb-24 md:pb-6 text-on-surface">

      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-lg font-bold text-on-surface">Alertas</h1>
          <p className="text-sm text-on-surface-variant mt-0.5">
            {overdueCount > 0 && `${overdueCount} vencido${overdueCount > 1 ? 's' : ''}`}
            {overdueCount > 0 && warningCount > 0 && ' · '}
            {warningCount > 0 && `${warningCount} próximo${warningCount > 1 ? 's' : ''} do prazo`}
          </p>
        </div>
        <button
          onClick={loadAlerts}
          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-surface-container text-on-surface-variant transition-colors"
          title="Atualizar"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2">
            <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* Filter tabs */}
      {overdueCount > 0 && warningCount > 0 && (
        <div className="flex gap-2 mb-5">
          {([
            { key: 'all', label: `Todos (${loans.length})` },
            { key: 'overdue', label: `Vencidos (${overdueCount})` },
            { key: 'warning', label: `Atenção (${warningCount})` },
          ] as { key: typeof filter; label: string }[]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === tab.key
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Cards */}
      <div className="space-y-3">
        {filtered.map((loan) => (
          <AlertCard
            key={loan.loan_id}
            loan={loan}
            onReturn={handleReturn}
            returning={returningId === loan.loan_id}
          />
        ))}
      </div>
    </div>
  )
}