'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Device {
  id: string
  name: string
  qr_code: string
  serial: string | null
  location: string | null
  notes: string | null
  active: boolean
  created_at: string
  // joined
  active_loan: boolean
}

interface DeviceFormData {
  name: string
  qr_code: string
  serial: string
  location: string
  notes: string
}

const EMPTY_FORM: DeviceFormData = {
  name: '',
  qr_code: '',
  serial: '',
  location: '',
  notes: '',
}

const PAGE_SIZE = 15

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ device }: { device: Device }) {
  if (!device.active) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface-variant">
        <span className="w-1.5 h-1.5 rounded-full bg-on-surface-variant/50" />
        Inativo
      </span>
    )
  }
  if (device.active_loan) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-secondary-container/30 text-on-secondary-container border-l-2 border-secondary-container">
        <span className="w-1.5 h-1.5 rounded-full bg-on-secondary-container animate-pulse" />
        Emprestado
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 border-l-2 border-green-500">
      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
      Disponível
    </span>
  )
}

// ─── Pagination ───────────────────────────────────────────────────────────────

function Pagination({
  page,
  totalPages,
  onPage,
}: {
  page: number
  totalPages: number
  onPage: (p: number) => void
}) {
  if (totalPages <= 1) return null

  return (
    <div className="flex items-center justify-center gap-1 mt-4">
      <button
        onClick={() => onPage(page - 1)}
        disabled={page === 1}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-container disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2">
          <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
        const isEdge = p === 1 || p === totalPages
        const isNear = Math.abs(p - page) <= 1
        if (!isEdge && !isNear) {
          if (p === 2 || p === totalPages - 1) {
            return <span key={p} className="w-8 text-center text-xs text-on-surface-variant">…</span>
          }
          return null
        }
        return (
          <button
            key={p}
            onClick={() => onPage(p)}
            className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
              p === page
                ? 'bg-primary text-on-primary'
                : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
            }`}
          >
            {p}
          </button>
        )
      })}

      <button
        onClick={() => onPage(page + 1)}
        disabled={page === totalPages}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-container disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2">
          <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function DeviceModal({
  device,
  onClose,
  onSaved,
}: {
  device: Device | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = device !== null
  const [form, setForm] = useState<DeviceFormData>(
    isEdit
      ? {
          name: device.name,
          qr_code: device.qr_code,
          serial: device.serial ?? '',
          location: device.location ?? '',
          notes: device.notes ?? '',
        }
      : EMPTY_FORM
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (field: keyof DeviceFormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }))

  const isValid = form.name.trim().length >= 2 && form.qr_code.trim().length >= 1

  const handleSave = async () => {
    if (!isValid) return
    setSaving(true)
    setError(null)
    const sb = createClient()

    const payload = {
      name: form.name.trim(),
      qr_code: form.qr_code.trim(),
      serial: form.serial.trim() || null,
      location: form.location.trim() || null,
      notes: form.notes.trim() || null,
    }

    const { error: dbError } = isEdit
      ? await sb.from('devices').update(payload).eq('id', device.id)
      : await sb.from('devices').insert(payload)

    if (dbError) {
      if (dbError.code === '23505') {
        setError('Já existe um dispositivo com esse nome ou QR Code.')
      } else {
        setError(dbError.message || 'Erro ao salvar dispositivo.')
      }
      setSaving(false)
      return
    }

    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm p-0 md:p-4">
      <div className="w-full md:max-w-lg rounded-t-2xl md:rounded-2xl border border-outline-variant bg-surface overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant">
          <div>
            <p className="text-sm font-semibold text-on-surface">
              {isEdit ? 'Editar dispositivo' : 'Novo dispositivo'}
            </p>
            <p className="text-xs mt-0.5 text-on-surface-variant">
              {isEdit ? `Editando ${device.name}` : 'Preencha os dados do iPad'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-surface-container text-on-surface-variant"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2">
              <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {error && (
            <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-error-container/20 border border-error/20 text-error text-sm">
              <svg viewBox="0 0 24 24" className="w-4 h-4 flex-shrink-0 fill-none stroke-current" strokeWidth="2">
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" strokeLinecap="round" />
              </svg>
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-on-surface-variant mb-1.5 block">
                Nome <span className="text-error">*</span>
              </label>
              <input
                autoFocus
                type="text"
                placeholder="Ex: iPad 01"
                value={form.name}
                onChange={set('name')}
                className="w-full px-3 py-2.5 rounded-xl text-sm border border-outline-variant bg-surface-container outline-none focus:ring-2 focus:ring-primary/30 text-on-surface placeholder:text-on-surface-variant transition-colors"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-on-surface-variant mb-1.5 block">
                QR Code <span className="text-error">*</span>
              </label>
              <input
                type="text"
                placeholder="Ex: QR001"
                value={form.qr_code}
                onChange={set('qr_code')}
                className="w-full px-3 py-2.5 rounded-xl text-sm border border-outline-variant bg-surface-container outline-none focus:ring-2 focus:ring-primary/30 text-on-surface placeholder:text-on-surface-variant transition-colors"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-on-surface-variant mb-1.5 block">Serial</label>
              <input
                type="text"
                placeholder="Número de série Apple"
                value={form.serial}
                onChange={set('serial')}
                className="w-full px-3 py-2.5 rounded-xl text-sm border border-outline-variant bg-surface-container outline-none focus:ring-2 focus:ring-primary/30 text-on-surface placeholder:text-on-surface-variant transition-colors"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-on-surface-variant mb-1.5 block">Localização</label>
              <input
                type="text"
                placeholder="Ex: Sala 3, Biblioteca"
                value={form.location}
                onChange={set('location')}
                className="w-full px-3 py-2.5 rounded-xl text-sm border border-outline-variant bg-surface-container outline-none focus:ring-2 focus:ring-primary/30 text-on-surface placeholder:text-on-surface-variant transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-on-surface-variant mb-1.5 block">Observações</label>
            <textarea
              rows={2}
              placeholder="Notas adicionais sobre o dispositivo..."
              value={form.notes}
              onChange={set('notes')}
              className="w-full px-3 py-2.5 rounded-xl text-sm border border-outline-variant bg-surface-container outline-none focus:ring-2 focus:ring-primary/30 text-on-surface placeholder:text-on-surface-variant resize-none transition-colors"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 py-4 border-t border-outline-variant">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-sm font-medium bg-surface-container hover:bg-surface-container-high text-on-surface transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!isValid || saving}
            className="flex-1 px-4 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <svg className="w-4 h-4 animate-spin fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                  <path d="M12 2a10 10 0 0110 10" strokeLinecap="round" />
                </svg>
                Salvando...
              </>
            ) : (
              isEdit ? 'Salvar alterações' : 'Cadastrar dispositivo'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  confirmClass,
  onConfirm,
  onClose,
  loading,
}: {
  title: string
  message: string
  confirmLabel: string
  confirmClass: string
  onConfirm: () => void
  onClose: () => void
  loading: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl border border-outline-variant bg-surface overflow-hidden">
        <div className="p-6">
          <p className="text-base font-semibold text-on-surface mb-2">{title}</p>
          <p className="text-sm text-on-surface-variant">{message}</p>
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-surface-container hover:bg-surface-container-high text-on-surface transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-50 ${confirmClass}`}
          >
            {loading ? 'Aguarde...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type ConfirmAction =
  | { type: 'deactivate'; device: Device }
  | { type: 'reactivate'; device: Device }
  | { type: 'delete'; device: Device }

export default function DispositivosPage() {
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'available' | 'loaned' | 'inactive'>('all')
  const [page, setPage] = useState(1)

  const [modalDevice, setModalDevice] = useState<Device | null | 'new'>(null)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  const loadDevices = useCallback(async () => {
    setLoading(true)
    const sb = createClient()

    const { data: devicesData } = await sb
      .from('devices')
      .select('id, name, qr_code, serial, location, notes, active, created_at')
      .order('name')

    const { data: activeLoans } = await sb
      .from('loans')
      .select('device_id')
      .eq('status', 'active')

    const activeIds = new Set((activeLoans ?? []).map((l: { device_id: string }) => l.device_id))

    const mapped: Device[] = (devicesData ?? []).map((d: {
      id: string
      name: string
      qr_code: string
      serial: string | null
      location: string | null
      notes: string | null
      active: boolean
      created_at: string
    }) => ({
      ...d,
      active_loan: activeIds.has(d.id),
    }))

    setDevices(mapped)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadDevices()
  }, [loadDevices])

  // Reset para página 1 quando filtros mudam
  useEffect(() => {
    setPage(1)
  }, [search, filterStatus])

  // Métricas
  const total = devices.length
  const available = devices.filter((d) => d.active && !d.active_loan).length
  const loaned = devices.filter((d) => d.active && d.active_loan).length
  const inactive = devices.filter((d) => !d.active).length

  // Filtro
  const filtered = devices.filter((d) => {
    const matchSearch =
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.qr_code.toLowerCase().includes(search.toLowerCase()) ||
      (d.serial ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (d.location ?? '').toLowerCase().includes(search.toLowerCase())

    const matchStatus =
      filterStatus === 'all' ||
      (filterStatus === 'available' && d.active && !d.active_loan) ||
      (filterStatus === 'loaned' && d.active && d.active_loan) ||
      (filterStatus === 'inactive' && !d.active)

    return matchSearch && matchStatus
  })

  // Paginação
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  // Ações
  const handleConfirmAction = async () => {
    if (!confirmAction) return
    setActionLoading(true)
    const sb = createClient()

    if (confirmAction.type === 'deactivate') {
      await sb.from('devices').update({ active: false }).eq('id', confirmAction.device.id)
    } else if (confirmAction.type === 'reactivate') {
      await sb.from('devices').update({ active: true }).eq('id', confirmAction.device.id)
    } else if (confirmAction.type === 'delete') {
      await sb.from('devices').delete().eq('id', confirmAction.device.id)
    }

    setActionLoading(false)
    setConfirmAction(null)
    loadDevices()
  }

  const confirmConfig = confirmAction
    ? confirmAction.type === 'deactivate'
      ? {
          title: 'Desativar dispositivo?',
          message: `"${confirmAction.device.name}" ficará invisível para novos empréstimos, mas o histórico será preservado.`,
          confirmLabel: 'Desativar',
          confirmClass: 'bg-surface-container-highest text-on-surface hover:opacity-80',
        }
      : confirmAction.type === 'reactivate'
      ? {
          title: 'Reativar dispositivo?',
          message: `"${confirmAction.device.name}" voltará a aparecer na lista de dispositivos disponíveis.`,
          confirmLabel: 'Reativar',
          confirmClass: 'bg-primary text-on-primary hover:opacity-90',
        }
      : {
          title: 'Excluir permanentemente?',
          message: `Esta ação não pode ser desfeita. "${confirmAction.device.name}" e todo o seu histórico de empréstimos serão removidos.`,
          confirmLabel: 'Excluir permanentemente',
          confirmClass: 'bg-error-container text-on-error-container hover:opacity-90',
        }
    : null

  return (
    <div className="text-on-surface">
      {/* Modals */}
      {modalDevice !== null && (
        <DeviceModal
          device={modalDevice === 'new' ? null : modalDevice}
          onClose={() => setModalDevice(null)}
          onSaved={loadDevices}
        />
      )}
      {confirmAction && confirmConfig && (
        <ConfirmDialog
          {...confirmConfig}
          onConfirm={handleConfirmAction}
          onClose={() => setConfirmAction(null)}
          loading={actionLoading}
        />
      )}

      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 pb-24 md:pb-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-xl font-bold text-on-surface">Dispositivos</h1>
            <p className="text-sm text-on-surface-variant mt-0.5">Gerencie o inventário de iPads da escola</p>
          </div>
          <button
            onClick={() => setModalDevice('new')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition-opacity flex-shrink-0"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
            <span className="hidden sm:inline">Novo dispositivo</span>
            <span className="sm:hidden">Novo</span>
          </button>
        </div>

        {/* Métricas */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Total', value: total, color: 'text-on-surface' },
            { label: 'Disponíveis', value: available, color: 'text-green-600 dark:text-green-400' },
            { label: 'Emprestados', value: loaned, color: 'text-on-secondary-container' },
            { label: 'Inativos', value: inactive, color: 'text-on-surface-variant' },
          ].map((m) => (
            <div key={m.label} className="rounded-xl border border-outline-variant bg-surface-container p-4">
              <p className={`text-2xl font-bold font-mono ${m.color}`}>{loading ? '—' : m.value}</p>
              <p className="text-xs text-on-surface-variant mt-0.5">{m.label}</p>
            </div>
          ))}
        </div>

        {/* Busca + Filtros */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="flex items-center gap-2 flex-1 px-3 py-2.5 rounded-xl border border-outline-variant bg-surface-container text-on-surface-variant">
            <svg viewBox="0 0 24 24" className="w-4 h-4 flex-shrink-0 fill-none stroke-current" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              placeholder="Buscar por nome, QR Code, serial ou localização..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent outline-none flex-1 text-sm placeholder:text-on-surface-variant text-on-surface"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-on-surface-variant hover:text-on-surface transition-colors">
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="2">
                  <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>

          <div className="flex gap-1.5 p-1 rounded-xl border border-outline-variant bg-surface-container">
            {([
              { key: 'all', label: 'Todos' },
              { key: 'available', label: 'Disponíveis' },
              { key: 'loaned', label: 'Emprestados' },
              { key: 'inactive', label: 'Inativos' },
            ] as const).map((f) => (
              <button
                key={f.key}
                onClick={() => setFilterStatus(f.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  filterStatus === f.key
                    ? 'bg-primary text-on-primary'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Desktop: Tabela ── */}
        <div className="hidden md:block rounded-2xl border border-outline-variant overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-container border-b border-outline-variant">
                <th className="text-left px-5 py-3 text-xs font-semibold text-on-surface-variant uppercase tracking-wide">iPad</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-on-surface-variant uppercase tracking-wide">QR Code</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-on-surface-variant uppercase tracking-wide">Serial</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-on-surface-variant uppercase tracking-wide">Localização</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-on-surface-variant uppercase tracking-wide">Status</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-on-surface-variant uppercase tracking-wide">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/50">
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(6)].map((_, j) => (
                      <td key={j} className="px-4 py-4">
                        <div className="h-4 rounded animate-pulse bg-surface-container-high" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-sm text-on-surface-variant opacity-50">
                    {search || filterStatus !== 'all' ? 'Nenhum dispositivo encontrado com esses filtros.' : 'Nenhum dispositivo cadastrado.'}
                  </td>
                </tr>
              ) : (
                paginated.map((device) => (
                  <tr key={device.id} className={`transition-colors hover:bg-surface-container/50 ${!device.active ? 'opacity-50' : ''}`}>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-secondary-container/30 flex items-center justify-center flex-shrink-0">
                          <svg viewBox="0 0 24 24" className="w-4 h-4 text-on-secondary-container fill-none stroke-current" strokeWidth="1.8">
                            <rect x="5" y="2" width="14" height="20" rx="2" />
                            <line x1="12" y1="18" x2="12" y2="18.01" strokeLinecap="round" />
                          </svg>
                        </div>
                        <div>
                          <p className="font-semibold text-on-surface">{device.name}</p>
                          {device.notes && (
                            <p className="text-xs text-on-surface-variant truncate max-w-[140px]">{device.notes}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="font-mono text-xs text-on-surface-variant">{device.qr_code}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="font-mono text-xs text-on-surface-variant">{device.serial ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-xs text-on-surface-variant">{device.location ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge device={device} />
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setModalDevice(device)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
                        >
                          Editar
                        </button>
                        <span className="text-outline-variant">·</span>
                        {device.active ? (
                          <button
                            onClick={() => setConfirmAction({ type: 'deactivate', device })}
                            disabled={device.active_loan}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title={device.active_loan ? 'Devolva o iPad antes de desativar' : ''}
                          >
                            Desativar
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => setConfirmAction({ type: 'reactivate', device })}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
                            >
                              Reativar
                            </button>
                            <span className="text-outline-variant">·</span>
                            <button
                              onClick={() => setConfirmAction({ type: 'delete', device })}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-error/70 hover:text-error hover:bg-error-container/10 transition-colors"
                            >
                              Excluir
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── Mobile: Cards ── */}
        <div className="md:hidden space-y-2">
          {loading ? (
            [...Array(4)].map((_, i) => (
              <div key={i} className="h-28 rounded-2xl animate-pulse bg-surface-container" />
            ))
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-sm text-on-surface-variant opacity-50">
              {search || filterStatus !== 'all' ? 'Nenhum dispositivo encontrado.' : 'Nenhum dispositivo cadastrado.'}
            </div>
          ) : (
            paginated.map((device) => (
              <div
                key={device.id}
                className={`rounded-2xl border border-outline-variant bg-surface-container p-4 transition-opacity ${!device.active ? 'opacity-50' : ''}`}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-secondary-container/30 flex items-center justify-center flex-shrink-0">
                      <svg viewBox="0 0 24 24" className="w-4.5 h-4.5 text-on-secondary-container fill-none stroke-current" strokeWidth="1.8">
                        <rect x="5" y="2" width="14" height="20" rx="2" />
                        <line x1="12" y1="18" x2="12" y2="18.01" strokeLinecap="round" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-on-surface">{device.name}</p>
                      <p className="text-xs font-mono text-on-surface-variant">{device.qr_code}</p>
                    </div>
                  </div>
                  <StatusBadge device={device} />
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3 text-xs text-on-surface-variant">
                  {device.serial && (
                    <span className="font-mono">S/N: {device.serial}</span>
                  )}
                  {device.location && (
                    <span>📍 {device.location}</span>
                  )}
                  {device.notes && (
                    <span className="truncate w-full italic">{device.notes}</span>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-3 border-t border-outline-variant/50">
                  <button
                    onClick={() => setModalDevice(device)}
                    className="flex-1 py-2 rounded-xl text-xs font-medium bg-surface-container-high hover:bg-surface-container-highest text-on-surface transition-colors text-center"
                  >
                    Editar
                  </button>
                  {device.active ? (
                    <button
                      onClick={() => setConfirmAction({ type: 'deactivate', device })}
                      disabled={device.active_loan}
                      className="flex-1 py-2 rounded-xl text-xs font-medium bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant transition-colors text-center disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      Desativar
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => setConfirmAction({ type: 'reactivate', device })}
                        className="flex-1 py-2 rounded-xl text-xs font-medium bg-surface-container-high hover:bg-surface-container-highest text-on-surface transition-colors text-center"
                      >
                        Reativar
                      </button>
                      <button
                        onClick={() => setConfirmAction({ type: 'delete', device })}
                        className="flex-1 py-2 rounded-xl text-xs font-medium bg-error-container/20 hover:bg-error-container/30 text-error transition-colors text-center"
                      >
                        Excluir
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Paginação + rodapé */}
        {!loading && filtered.length > 0 && (
          <>
            <Pagination page={safePage} totalPages={totalPages} onPage={setPage} />
            <p className="text-xs text-on-surface-variant text-center mt-3">
              {filtered.length} dispositivo{filtered.length !== 1 ? 's' : ''}
              {(search || filterStatus !== 'all') && ` · ${total} no total`}
              {totalPages > 1 && ` · página ${safePage} de ${totalPages}`}
            </p>
          </>
        )}

      </div>
    </div>
  )
}
