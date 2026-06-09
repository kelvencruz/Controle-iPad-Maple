'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase'
import {
  getSlaHours,
  reasonLabel,
  statusBadgeClasses,
  formatElapsed,
  type ActiveLoan,
} from '@/lib/loans'

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 'select' | 'confirm' | 'done'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function Row({ label, value, highlight = false }: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="flex justify-between items-baseline gap-4 text-sm">
      <span className="text-on-surface-variant flex-shrink-0">{label}</span>
      <span className={`text-right ${highlight ? 'text-error font-medium' : 'text-on-surface'}`}>
        {value}
      </span>
    </div>
  )
}

// ─── Modal de confirmação em massa ────────────────────────────────────────────

function BulkConfirmModal({
  loans,
  onConfirm,
  onCancel,
  submitting,
}: {
  loans: ActiveLoan[]
  onConfirm: () => void
  onCancel: () => void
  submitting: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-4 pb-4 sm:pb-0">
      <div className="w-full max-w-md rounded-2xl border border-outline-variant bg-surface-container overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant">
          <div>
            <p className="text-sm font-semibold text-on-surface">
              Confirmar devolução em massa
            </p>
            <p className="text-xs text-on-surface-variant mt-0.5">
              {loans.length} iPad{loans.length > 1 ? 's' : ''} serão devolvidos
            </p>
          </div>
          <button
            onClick={onCancel}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-surface-container-high text-on-surface-variant transition-colors"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2">
              <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Lista */}
        <div className="max-h-60 overflow-y-auto px-5 py-3 space-y-2">
          {loans.map((loan) => {
            const elapsed = (Date.now() - new Date(loan.loaned_at).getTime()) / 3_600_000
            const sla = getSlaHours(loan.reason, loan.custom_deadline_hours ?? undefined)
            const overSla = sla != null && elapsed >= sla
            return (
              <div key={loan.id} className="flex items-center justify-between gap-3 py-1.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-secondary-container/30 flex items-center justify-center flex-shrink-0">
                    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-on-secondary-container fill-none stroke-current" strokeWidth="1.5">
                      <path d="M12 18h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-on-surface truncate">{loan.device_name}</p>
                    <p className="text-xs text-on-surface-variant truncate">{loan.borrower_name}</p>
                  </div>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-md border flex-shrink-0 ${statusBadgeClasses(loan.loaned_at, loan.reason, loan.custom_deadline_hours)}`}>
                  {formatElapsed(loan.loaned_at)}
                  {overSla && ' ⚠'}
                </span>
              </div>
            )
          })}
        </div>

        {/* Actions */}
        <div className="flex gap-3 px-5 pb-5 pt-2">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-surface-container-high hover:bg-surface-container-highest text-on-surface transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={submitting}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-primary text-on-primary hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <svg className="w-4 h-4 animate-spin fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                  <path d="M12 2a10 10 0 0110 10" strokeLinecap="round" />
                </svg>
                Registrando...
              </>
            ) : (
              `Devolver ${loans.length}`
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DevolverPage() {
  const [loans, setLoans] = useState<ActiveLoan[]>([])
  const [filtered, setFiltered] = useState<ActiveLoan[]>([])
  const [search, setSearch] = useState('')

  // Seleção individual (fluxo antigo: select → confirm → done)
  const [selected, setSelected] = useState<ActiveLoan | null>(null)
  const [step, setStep] = useState<Step>('select')

  // Seleção em massa
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [bulkDoneLoans, setBulkDoneLoans] = useState<ActiveLoan[]>([])

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchLoans = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()

    // BUG-14: usa loans.id diretamente — NÃO usa a view active_loans
    // (que expõe o campo como loan_id). Aqui fazemos JOIN manual com devices.
    const { data, error: fetchErr } = await supabase
      .from('loans')
      .select(`
        id,
        borrower_name,
        reason,
        reason_detail,
        custom_deadline_hours,
        loaned_at,
        device_id,
        devices ( id, name, qr_code )
      `)
      .eq('status', 'active')
      .order('loaned_at', { ascending: true })

    if (fetchErr) {
      toast.error('Erro ao carregar empréstimos. Verifique a conexão.')
      setLoading(false)
      return
    }

    const mapped: ActiveLoan[] = (data ?? []).map((l: any) => ({
      id: l.id,
      device_id: l.devices?.id ?? '',
      device_name: l.devices?.name ?? '—',
      qr_code: l.devices?.qr_code ?? '',
      borrower_name: l.borrower_name ?? '—',
      loaned_at: l.loaned_at,
      reason: l.reason,
      reason_detail: l.reason_detail ?? null,
      custom_deadline_hours: l.custom_deadline_hours ?? null,
    }))

    setLoans(mapped)
    setFiltered(mapped)
    setCheckedIds(new Set())
    setLoading(false)
  }, [])

  useEffect(() => { fetchLoans() }, [fetchLoans])

  // ── Filtro de busca ────────────────────────────────────────────────────────

  useEffect(() => {
    const q = search.toLowerCase()
    if (!q) { setFiltered(loans); return }
    setFiltered(loans.filter(l =>
      l.device_name.toLowerCase().includes(q) ||
      l.borrower_name.toLowerCase().includes(q) ||
      reasonLabel(l.reason).toLowerCase().includes(q)
    ))
  }, [search, loans])

  // ── Seleção individual ─────────────────────────────────────────────────────

  async function handleConfirmSingle() {
    if (!selected) return
    setSubmitting(true)
    const supabase = createClient()

    const { error: loanErr } = await supabase
      .from('loans')
      .update({ status: 'returned', returned_at: new Date().toISOString() })
      .eq('id', selected.id) // BUG-14: loans.id direto
      .eq('status', 'active')

    if (loanErr) {
      toast.error('Erro ao registrar devolução. Tente novamente.')
      setSubmitting(false)
      return
    }

    setStep('done')
    setSubmitting(false)
  }

  // ── Seleção em massa ───────────────────────────────────────────────────────

  const toggleCheck = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setCheckedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (checkedIds.size === filtered.length) {
      setCheckedIds(new Set())
    } else {
      setCheckedIds(new Set(filtered.map(l => l.id)))
    }
  }

  const checkedLoans = loans.filter(l => checkedIds.has(l.id))

  async function handleBulkConfirm() {
    if (checkedLoans.length === 0) return
    setSubmitting(true)
    const supabase = createClient()

    const now = new Date().toISOString()
    const ids = checkedLoans.map(l => l.id)

    const { error: bulkErr } = await supabase
      .from('loans')
      .update({ status: 'returned', returned_at: now })
      .in('id', ids) // BUG-14: loans.id direto
      .eq('status', 'active')

    if (bulkErr) {
      toast.error(bulkErr.message || 'Erro ao registrar devoluções.')
      setSubmitting(false)
      return
    }

    setBulkDoneLoans(checkedLoans)
    setShowBulkModal(false)
    setStep('done')
    setSubmitting(false)
  }

  // ── Reset ──────────────────────────────────────────────────────────────────

  function reset() {
    setSelected(null)
    setBulkDoneLoans([])
    setStep('select')
    setSearch('')
    fetchLoans()
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP: done
  // ══════════════════════════════════════════════════════════════════════════

  if (step === 'done') {
    const isBulk = bulkDoneLoans.length > 0
    const displayLoans = isBulk ? bulkDoneLoans : selected ? [selected] : []

    return (
      <div className="text-on-surface flex items-start md:items-center justify-center p-4 md:p-6 pb-24 md:pb-6">
        <div className="max-w-md w-full text-center space-y-5 pt-6 md:pt-0">

          <div className="mx-auto w-16 h-16 rounded-full bg-success/20 border-2 border-success/30 flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-8 h-8 text-success fill-none stroke-current" strokeWidth="2">
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" />
            </svg>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-on-surface">
              {isBulk
                ? `${displayLoans.length} devoluções registradas`
                : 'Devolução registrada'}
            </h2>
            {!isBulk && selected && (
              <p className="text-sm text-on-surface-variant mt-1">
                <span className="font-medium text-on-surface">{selected.device_name}</span>{' '}
                devolvido por{' '}
                <span className="font-medium text-on-surface">{selected.borrower_name}</span>
              </p>
            )}
          </div>

          {/* Detalhes individual */}
          {!isBulk && selected && (
            <div className="rounded-xl border border-outline-variant bg-surface-container p-4 text-left space-y-2">
              <Row label="iPad"          value={selected.device_name} />
              <Row label="Responsável"   value={selected.borrower_name} />
              <Row label="Motivo"        value={reasonLabel(selected.reason)} />
              {selected.reason_detail && <Row label="Detalhe" value={selected.reason_detail} />}
              <Row label="Emprestado em" value={formatDate(selected.loaned_at)} />
              <Row label="Tempo total"   value={formatElapsed(selected.loaned_at)} />
            </div>
          )}

          {/* Lista em massa */}
          {isBulk && (
            <div className="rounded-xl border border-outline-variant bg-surface-container p-4 text-left space-y-2">
              {displayLoans.map(l => (
                <div key={l.id} className="flex items-center justify-between gap-3 py-1">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-on-surface truncate">{l.device_name}</p>
                    <p className="text-xs text-on-surface-variant truncate">{l.borrower_name}</p>
                  </div>
                  <svg viewBox="0 0 24 24" className="w-4 h-4 text-success fill-none stroke-current flex-shrink-0" strokeWidth="2.5">
                    <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={reset}
            className="w-full py-3 rounded-xl bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            Registrar outra devolução
          </button>
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP: confirm (individual)
  // ══════════════════════════════════════════════════════════════════════════

  if (step === 'confirm' && selected) {
    const sla     = getSlaHours(selected.reason, selected.custom_deadline_hours ?? undefined)
    const elapsed = (Date.now() - new Date(selected.loaned_at).getTime()) / 3_600_000
    const overSla = sla != null && elapsed >= sla

    return (
      <div className="text-on-surface flex items-start md:items-center justify-center p-4 md:p-6 pb-24 md:pb-6">
        <div className="max-w-md w-full space-y-5 pt-2 md:pt-0">

          <div>
            <button
              onClick={() => setStep('select')}
              className="text-on-surface-variant text-sm flex items-center gap-1 mb-4 hover:opacity-70 transition-opacity"
            >
              <svg className="w-4 h-4 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Voltar
            </button>
            <h1 className="text-xl font-semibold text-on-surface">Confirmar devolução</h1>
            <p className="text-sm mt-1 text-on-surface-variant">Verifique os dados antes de confirmar.</p>
          </div>

          <div className="rounded-xl border border-outline-variant bg-surface-container p-4 md:p-5 space-y-3">
            <div className="flex items-center gap-3 pb-3 border-b border-outline-variant">
              <div className="w-9 h-9 rounded-lg bg-secondary-container/30 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-on-secondary-container fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-sm text-on-surface">{selected.device_name}</p>
                <p className="text-xs text-on-surface-variant">{selected.qr_code}</p>
              </div>
            </div>
            <Row label="Responsável"             value={selected.borrower_name} />
            <Row label="Motivo"                  value={reasonLabel(selected.reason)} />
            {selected.reason_detail && <Row label="Detalhe" value={selected.reason_detail} />}
            {selected.custom_deadline_hours && (
              <Row label="Prazo definido" value={`${selected.custom_deadline_hours}h`} />
            )}
            <Row label="Emprestado em"           value={formatDate(selected.loaned_at)} />
            <Row label="Tempo com o dispositivo" value={formatElapsed(selected.loaned_at)} highlight={overSla} />
          </div>

          {overSla && (
            <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-error-container/20 border border-error/20 text-sm text-error">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              SLA excedido — empréstimo passou de {sla}h para esta categoria.
            </div>
          )}

          <button
            onClick={handleConfirmSingle}
            disabled={submitting}
            className="w-full py-3 rounded-xl bg-primary text-on-primary font-semibold text-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <svg className="w-4 h-4 animate-spin fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                  <path d="M12 2a10 10 0 0110 10" strokeLinecap="round" />
                </svg>
                Registrando...
              </>
            ) : 'Confirmar devolução'}
          </button>
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP: select
  // ══════════════════════════════════════════════════════════════════════════

  const allChecked = filtered.length > 0 && filtered.every(l => checkedIds.has(l.id))
  const someChecked = checkedIds.size > 0

  return (
    <div className="text-on-surface px-4 md:px-6 py-4 md:py-6 pb-24 md:pb-6">

      {/* Modal em massa */}
      {showBulkModal && (
        <BulkConfirmModal
          loans={checkedLoans}
          onConfirm={handleBulkConfirm}
          onCancel={() => setShowBulkModal(false)}
          submitting={submitting}
        />
      )}

      <div className="max-w-2xl mx-auto space-y-4">

        {/* Busca + marcar todos */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-surface-container border border-outline-variant flex-1">
            <svg className="w-4 h-4 text-on-surface-variant flex-shrink-0 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              type="text"
              placeholder="iPad ou responsável..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-transparent outline-none w-full placeholder:text-on-surface-variant text-on-surface"
            />
          </div>
          <span className="text-xs text-on-surface-variant whitespace-nowrap">
            {loading ? '…' : `${loans.length} ativo${loans.length !== 1 ? 's' : ''}`}
          </span>
        </div>

        {/* Toolbar seleção */}
        {!loading && filtered.length > 0 && (
          <div className="flex items-center justify-between py-1">
            <button
              onClick={toggleAll}
              className="flex items-center gap-2 text-xs font-medium text-on-surface-variant hover:text-on-surface transition-colors"
            >
              <span className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                allChecked
                  ? 'bg-primary border-primary'
                  : someChecked
                  ? 'bg-primary/30 border-primary/50'
                  : 'border-outline-variant bg-surface'
              }`}>
                {allChecked && (
                  <svg viewBox="0 0 24 24" className="w-3 h-3 text-on-primary fill-none stroke-current" strokeWidth="3">
                    <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                {!allChecked && someChecked && (
                  <span className="w-1.5 h-0.5 bg-primary rounded" />
                )}
              </span>
              {allChecked ? 'Desmarcar todos' : 'Marcar todos'}
            </button>
            {someChecked && (
              <span className="text-xs text-on-surface-variant">
                {checkedIds.size} selecionado{checkedIds.size > 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}

        {/* Lista */}
        <div className="space-y-2 md:space-y-3">
          {loading ? (
            [...Array(4)].map((_, i) => (
              <div key={i} className="h-[72px] animate-pulse rounded-xl bg-surface-container" />
            ))
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-sm text-on-surface-variant opacity-50">
              {search ? 'Nenhum resultado para a busca' : 'Nenhum empréstimo ativo'}
            </div>
          ) : (
            filtered.map(loan => {
              const isChecked = checkedIds.has(loan.id)
              return (
                <div
                  key={loan.id}
                  className={`rounded-xl border overflow-hidden flex transition-colors ${
                    isChecked
                      ? 'border-primary/50 bg-primary/5'
                      : 'border-outline-variant bg-surface-container'
                  }`}
                >
                  {/* Coluna do checkbox */}
                  <button
                    onClick={e => toggleCheck(loan.id, e)}
                    aria-label={isChecked ? 'Desmarcar' : 'Selecionar'}
                    className={`w-11 flex-shrink-0 flex items-center justify-center border-r transition-colors ${
                      isChecked
                        ? 'bg-primary/10 border-primary/30'
                        : 'bg-surface-container-high border-outline-variant'
                    }`}
                  >
                    <span className={`w-[18px] h-[18px] rounded-[5px] border-[1.5px] flex items-center justify-center transition-all ${
                      isChecked
                        ? 'bg-primary border-primary'
                        : 'border-outline bg-surface'
                    }`}>
                      {isChecked && (
                        <svg viewBox="0 0 11 11" className="w-2.5 h-2.5 fill-none stroke-white" strokeWidth="2">
                          <path d="M2 5.5l2.8 2.8L9 3" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                  </button>

                  {/* Corpo */}
                  <button
                    onClick={() => { setSelected(loan); setStep('confirm') }}
                    className="flex-1 flex items-center justify-between gap-3 p-3 md:p-4 min-w-0 hover:opacity-80 transition-opacity"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 border transition-colors ${
                        isChecked
                          ? 'bg-primary/10 border-primary/20'
                          : 'bg-secondary-container/30 border-outline-variant/50'
                      }`}>
                        <svg className={`w-4 h-4 fill-none stroke-current transition-colors ${
                          isChecked ? 'text-primary' : 'text-on-secondary-container'
                        }`} viewBox="0 0 24 24" strokeWidth="1.5">
                          <rect x="5" y="2" width="14" height="20" rx="2" strokeLinecap="round" strokeLinejoin="round" />
                          <circle cx="12" cy="17.5" r="1" fill="currentColor" stroke="none" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate text-on-surface">{loan.device_name}</p>
                        <p className="text-xs truncate text-on-surface-variant">{loan.borrower_name}</p>
                        {loan.reason && (
                          <p className="text-xs truncate text-on-surface-variant opacity-60 mt-0.5">
                            {reasonLabel(loan.reason)}
                            {loan.reason_detail ? ` — ${loan.reason_detail}` : ''}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className={`text-xs font-medium px-2 py-1 rounded-md border ${statusBadgeClasses(loan.loaned_at, loan.reason, loan.custom_deadline_hours)}`}>
                        {formatElapsed(loan.loaned_at)}
                      </span>
                      <svg className="w-4 h-4 text-on-surface-variant fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </button>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Barra flutuante de devolução em massa */}
      {someChecked && (
        <div className="fixed bottom-20 md:bottom-6 left-0 right-0 flex justify-center px-4 z-40 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-2xl bg-surface-container border border-outline-variant shadow-xl max-w-sm w-full">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-on-surface">
                {checkedIds.size} iPad{checkedIds.size > 1 ? 's' : ''} selecionado{checkedIds.size > 1 ? 's' : ''}
              </p>
              <p className="text-xs text-on-surface-variant truncate">
                {checkedLoans.map(l => l.device_name).join(', ')}
              </p>
            </div>
            <button
              onClick={() => setShowBulkModal(true)}
              className="flex-shrink-0 px-4 py-2 rounded-xl bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition-opacity whitespace-nowrap"
            >
              Devolver {checkedIds.size}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
