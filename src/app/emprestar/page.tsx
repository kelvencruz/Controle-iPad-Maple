'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import jsQR from 'jsqr'
import { createClient } from '@/lib/supabase'
import {
  REASON_CATEGORIES,
  type ReasonKey,
  type ReasonCategory,
} from '@/lib/loans'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Device {
  id: string
  name: string
  qr_code: string
}

// ─── QR Scanner ───────────────────────────────────────────────────────────────

function QRScanner({
  onDetected,
  onClose,
}: {
  onDetected: (value: string) => void
  onClose: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number>(0)
  const [error, setError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [lastScan, setLastScan] = useState<string | null>(null)

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  useEffect(() => {
    // BUG-13 FECHADO: jsQR importado via npm (jsqr@1.4.0).
    // CDN jsdelivr.net e script tag dinâmica removidos.
    // INC-50 FECHADO: script tag duplicada em StrictMode não ocorre mais.
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
        })
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play()
          setScanning(true)
          tick()
        }
      } catch {
        setError('Não foi possível acessar a câmera. Verifique as permissões.')
      }
    }

    function tick() {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas) return
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        })
        if (code?.data) {
          setLastScan(code.data)
          stopCamera()
          onDetected(code.data)
          return
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    startCamera()

    return () => {
      stopCamera()
    }
  }, [onDetected, stopCamera])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-sm mx-4 rounded-2xl overflow-hidden border bg-surface-container border-outline-variant">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-secondary-container/30 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-4 h-4 text-on-secondary-container fill-none stroke-current" strokeWidth="2">
                <path d="M12 4H6a2 2 0 00-2 2v6M4 16v2a2 2 0 002 2h2M16 4h2a2 2 0 012 2v2M20 16v2a2 2 0 01-2 2h-2M8 8h2v2H8zM14 8h2v2h-2zM8 14h2v2H8z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-on-surface">Escanear QR Code</p>
              <p className="text-[10px] text-on-surface-variant">Aponte para a etiqueta do iPad</p>
            </div>
          </div>
          <button
            onClick={() => { stopCamera(); onClose() }}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-surface-container-high text-on-surface-variant"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2">
              <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Camera */}
        <div className="relative bg-black aspect-[4/3] overflow-hidden">
          {error ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-error-container/30 flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="w-6 h-6 text-error fill-none stroke-current" strokeWidth="2">
                  <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" strokeLinecap="round" />
                </svg>
              </div>
              <p className="text-sm text-error">{error}</p>
            </div>
          ) : (
            <>
              <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
              <canvas ref={canvasRef} className="hidden" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative w-48 h-48">
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-on-secondary-container rounded-tl-lg" />
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-on-secondary-container rounded-tr-lg" />
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-on-secondary-container rounded-bl-lg" />
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-on-secondary-container rounded-br-lg" />
                  {scanning && (
                    <div className="absolute left-2 right-2 h-0.5 bg-on-secondary-container/80"
                      style={{ animation: 'scan 2s ease-in-out infinite' }} />
                  )}
                </div>
              </div>
              {scanning && (
                <div className="absolute bottom-3 left-0 right-0 flex justify-center">
                  <span className="text-xs text-white/70 bg-black/50 px-3 py-1 rounded-full">Escaneando...</span>
                </div>
              )}
            </>
          )}
        </div>

        {lastScan && (
          <div className="px-5 py-3 flex items-center gap-2">
            <svg viewBox="0 0 24 24" className="w-4 h-4 text-success fill-none stroke-current flex-shrink-0" strokeWidth="2">
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" />
            </svg>
            <p className="text-sm font-medium text-success">Detectado: {lastScan}</p>
          </div>
        )}
      </div>

      <style>{`
        @keyframes scan {
          0%   { top: 8px; }
          50%  { top: calc(100% - 8px); }
          100% { top: 8px; }
        }
      `}</style>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EmprestimosPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [devices, setDevices] = useState<Device[]>([])

  const [borrowerName, setBorrowerName] = useState('')
  const [selectedDevices, setSelectedDevices] = useState<string[]>([])
  const [reason, setReason] = useState<ReasonKey | ''>('')
  const [reasonDetail, setReasonDetail] = useState('')
  const [customDeadlineHours, setCustomDeadlineHours] = useState('')

  const [deviceSearch, setDeviceSearch] = useState('')
  const [showQR, setShowQR] = useState(false)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  const loadDevices = useCallback(async () => {
    setLoading(true)
    const sb = createClient()

    const { data: activeLoans, error: networkErr } = await sb
      .from('loans')
      .select('device_id')
      .eq('status', 'active')

    if (networkErr) {
      toast.error('Não foi possível carregar os iPads. Verifique a conexão.')
      setLoading(false)
      return
    }

    const activeIds = (activeLoans ?? []).map((l: { device_id: string }) => l.device_id).filter(Boolean)

    let query = sb.from('devices').select('id, name, qr_code').order('name')
    if (activeIds.length > 0) {
      query = query.not('id', 'in', `(${activeIds.join(',')})`)
    }

    const { data, error: devicesErr } = await query

    if (devicesErr) {
      toast.error('Erro ao carregar dispositivos.')
      setLoading(false)
      return
    }

    setDevices((data ?? []) as Device[])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (step === 2) loadDevices()
  }, [step, loadDevices])

  const handleQRDetected = useCallback(
    (value: string) => {
      setShowQR(false)
      const device = devices.find((d) => d.qr_code === value)
      if (device) {
        setSelectedDevices((prev) => prev.includes(device.id) ? prev : [...prev, device.id])
        toast.success(`${device.name} adicionado`)
      } else {
        toast.error(`QR Code "${value}" não encontrado ou iPad indisponível.`)
      }
    },
    [devices]
  )

  const toggleDevice = (id: string) => {
    setSelectedDevices((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  const isReasonValid = (): boolean => {
    if (!reason) return false
    if (reason === 'suporte_tecnico') {
      const h = parseInt(customDeadlineHours)
      return !isNaN(h) && h >= 1
    }
    if (reason === 'outro') return reasonDetail.trim().length >= 10
    return true
  }

  const handleSubmit = async () => {
    if (!borrowerName.trim() || selectedDevices.length === 0 || !isReasonValid()) return
    setSubmitting(true)
    const sb = createClient()

    try {
      const now = new Date().toISOString()
      const loans = selectedDevices.map((device_id) => ({
        device_id,
        borrower_name: borrowerName.trim(),
        reason: reason || null,
        reason_detail: reason === 'outro' ? reasonDetail.trim() : null,
        custom_deadline_hours: reason === 'suporte_tecnico' ? parseInt(customDeadlineHours) : null,
        loaned_at: now,
      }))

      const { error: loanError } = await sb.from('loans').insert(loans)

      if (loanError) {
        if (loanError.code === '23505') {
          toast.error('Um ou mais iPads já estão emprestados. Atualize a lista e tente novamente.')
        } else {
          toast.error(loanError.message || 'Erro ao registrar empréstimo.')
        }
        setSubmitting(false)
        return
      }

      setSuccess(true)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao registrar empréstimo.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleReset = () => {
    setStep(1)
    setBorrowerName('')
    setSelectedDevices([])
    setReason('')
    setReasonDetail('')
    setCustomDeadlineHours('')
    setDeviceSearch('')
    setSuccess(false)
  }

  const filteredDevices = devices.filter((d) =>
    d.name.toLowerCase().includes(deviceSearch.toLowerCase())
  )

  const selectedDeviceObjects = devices.filter((d) => selectedDevices.includes(d.id))
  const currentReasonLabel = REASON_CATEGORIES.find((c: ReasonCategory) => c.key === reason)?.label ?? ''

  // ─── Success ──────────────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="flex items-center justify-center py-16 pb-24 md:pb-16 text-on-surface">
        <div className="text-center max-w-sm mx-4">
          <div className="w-20 h-20 rounded-full bg-success/20 border-2 border-success/30 flex items-center justify-center mx-auto mb-6">
            <svg viewBox="0 0 24 24" className="w-10 h-10 text-success fill-none stroke-current" strokeWidth="2">
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold mb-2 text-on-surface">Empréstimo registrado!</h1>
          <p className="text-sm mb-2 text-on-surface-variant">
            {selectedDevices.length} iPad{selectedDevices.length > 1 ? 's' : ''} emprestado{selectedDevices.length > 1 ? 's' : ''} para
          </p>
          <p className="font-semibold text-lg text-on-surface">{borrowerName}</p>
          <div className="mt-4 p-3 rounded-xl border border-outline-variant bg-surface-container">
            <div className="flex flex-wrap gap-2 justify-center">
              {selectedDeviceObjects.map((d) => (
                <span key={d.id} className="text-xs px-2.5 py-1 rounded-full font-medium bg-secondary-container/30 text-on-secondary-container">
                  {d.name}
                </span>
              ))}
            </div>
          </div>
          <div className="flex gap-3 mt-8">
            <button
              onClick={handleReset}
              className="flex-1 px-4 py-3 rounded-xl bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              Novo empréstimo
            </button>
            <a
              href="/dashboard"
              className="flex-1 px-4 py-3 rounded-xl text-sm font-semibold text-center bg-surface-container hover:bg-surface-container-high text-on-surface transition-colors"
            >
              Ver dashboard
            </a>
          </div>
        </div>
      </div>
    )
  }

  // ─── Main ─────────────────────────────────────────────────────────────────────
  return (
    <div className="text-on-surface">
      {showQR && (
        <QRScanner onDetected={handleQRDetected} onClose={() => setShowQR(false)} />
      )}

      <div className="max-w-2xl mx-auto px-4 md:px-6 py-6 pb-24 md:pb-6">

        {/* Steps indicator */}
        <div className="flex items-center gap-2 mb-6 md:mb-8">
          {[
            { n: 1, label: 'Responsável' },
            { n: 2, label: 'iPads' },
            { n: 3, label: 'Confirmar' },
          ].map((s, i) => (
            <div key={s.n} className="flex items-center gap-2 flex-1">
              <div className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  step === s.n
                    ? 'bg-primary text-on-primary'
                    : step > s.n
                    ? 'bg-success text-white'
                    : 'bg-surface-container text-on-surface-variant'
                }`}>
                  {step > s.n ? (
                    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="3">
                      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : s.n}
                </div>
                <span className={`text-xs font-medium hidden sm:block ${step === s.n ? 'text-on-surface' : 'text-on-surface-variant'}`}>
                  {s.label}
                </span>
              </div>
              {i < 2 && <div className="flex-1 h-px mx-2 bg-outline-variant" />}
            </div>
          ))}
        </div>

        {/* ── STEP 1: Nome do responsável ── */}
        {step === 1 && (
          <div className="rounded-2xl border border-outline-variant bg-surface-container">
            <div className="px-5 py-4 border-b border-outline-variant">
              <h2 className="font-semibold text-sm text-on-surface">Quem está pegando o iPad?</h2>
              <p className="text-xs mt-0.5 text-on-surface-variant">Digite o nome do aluno ou professor</p>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-on-surface-variant mb-1.5 block">
                  Nome completo <span className="text-error">*</span>
                </label>
                <input
                  autoFocus
                  type="text"
                  placeholder="Ex: Ana Paula Silva"
                  value={borrowerName}
                  onChange={(e) => setBorrowerName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && borrowerName.trim().length >= 2) {
                      setStep(2)
                    }
                  }}
                  className="w-full px-3 py-2.5 rounded-xl text-sm border border-outline-variant bg-surface outline-none focus:ring-2 focus:ring-primary/30 text-on-surface placeholder:text-on-surface-variant transition-colors"
                />
                <p className="text-[11px] mt-1.5 text-on-surface-variant">Mínimo 2 caracteres</p>
              </div>
              <button
                onClick={() => setStep(2)}
                disabled={borrowerName.trim().length < 2}
                className="w-full py-3 rounded-xl bg-primary text-on-primary text-sm font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              >
                Continuar
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: Selecionar iPads + Motivo ── */}
        {step === 2 && (
          <div>
            {/* Chip do responsável */}
            <div className="flex items-center gap-3 p-4 rounded-xl border border-outline-variant bg-surface-container mb-4">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary flex-shrink-0">
                {borrowerName.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-on-surface truncate">{borrowerName}</p>
                <p className="text-xs text-on-surface-variant">Responsável pelo empréstimo</p>
              </div>
              <button
                onClick={() => {
                  setStep(1)
                  setSelectedDevices([])
                }}
                className="text-xs text-on-surface-variant font-medium hover:text-on-surface transition-colors flex-shrink-0"
              >
                Trocar
              </button>
            </div>

            <div className="rounded-2xl border border-outline-variant bg-surface-container">
              <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant">
                <div>
                  <h2 className="font-semibold text-sm text-on-surface">Selecionar iPads</h2>
                  <p className="text-xs mt-0.5 text-on-surface-variant">
                    {devices.length} disponíveis
                    {selectedDevices.length > 0 && ` · ${selectedDevices.length} selecionado${selectedDevices.length > 1 ? 's' : ''}`}
                  </p>
                </div>
                <button
                  onClick={() => setShowQR(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-container-high hover:bg-surface-container-highest text-on-surface transition-colors"
                >
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="2">
                    <path d="M12 4H6a2 2 0 00-2 2v6M4 16v2a2 2 0 002 2h2M16 4h2a2 2 0 012 2v2M20 16v2a2 2 0 01-2 2h-2M8 8h2v2H8zM14 8h2v2h-2zM8 14h2v2H8z" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  QR Code
                </button>
              </div>

              {/* Busca */}
              <div className="mx-4 mt-4 flex items-center gap-2 px-3 py-2 rounded-lg border border-outline-variant bg-surface text-on-surface-variant">
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 flex-shrink-0 fill-none stroke-current" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" strokeLinecap="round" />
                </svg>
                <input
                  type="text"
                  placeholder="Filtrar iPads..."
                  className="bg-transparent outline-none flex-1 text-sm placeholder:text-on-surface-variant text-on-surface"
                  value={deviceSearch}
                  onChange={(e) => setDeviceSearch(e.target.value)}
                />
              </div>

              <div className="px-4 pt-3 pb-1 flex items-center justify-between">
                <span className="text-xs text-on-surface-variant">{filteredDevices.length} iPads disponíveis</span>
                <button
                  onClick={() => {
                    const all = filteredDevices.map((d) => d.id)
                    const allSelected = all.every((id) => selectedDevices.includes(id))
                    setSelectedDevices(allSelected
                      ? selectedDevices.filter((id) => !all.includes(id))
                      : [...new Set([...selectedDevices, ...all])])
                  }}
                  className="text-xs font-medium text-on-secondary-container hover:opacity-70 transition-opacity"
                >
                  {filteredDevices.every((d) => selectedDevices.includes(d.id)) ? 'Desmarcar todos' : 'Marcar todos'}
                </button>
              </div>

              <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
                {loading ? (
                  [...Array(6)].map((_, i) => (
                    <div key={i} className="h-14 rounded-xl animate-pulse bg-surface-container-high" />
                  ))
                ) : filteredDevices.length === 0 ? (
                  <div className="col-span-2 md:col-span-3 text-center py-8 text-sm text-on-surface-variant opacity-50">
                    Nenhum iPad disponível
                  </div>
                ) : (
                  filteredDevices.map((device) => {
                    const isSelected = selectedDevices.includes(device.id)
                    return (
                      <button
                        key={device.id}
                        onClick={() => toggleDevice(device.id)}
                        className={`relative flex flex-col items-center justify-center gap-1 p-3 rounded-xl border text-center transition-all ${
                          isSelected
                            ? 'bg-primary text-on-primary border-primary shadow-lg'
                            : 'bg-surface-container-high border-outline-variant hover:bg-surface-container-highest text-on-surface'
                        }`}
                      >
                        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-none stroke-current" strokeWidth="1.8">
                          <rect x="5" y="2" width="14" height="20" rx="2" />
                          <line x1="12" y1="18" x2="12" y2="18.01" strokeLinecap="round" />
                        </svg>
                        <span className="text-xs font-semibold leading-tight">{device.name}</span>
                        {isSelected && (
                          <div className="absolute top-1.5 right-1.5 w-3.5 h-3.5 rounded-full bg-on-primary/20 flex items-center justify-center">
                            <svg viewBox="0 0 24 24" className="w-2.5 h-2.5 fill-none stroke-current stroke-[3]">
                              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </div>
                        )}
                      </button>
                    )
                  })
                )}
              </div>

              {/* Motivo */}
              <div className="mx-4 mb-4 border-t border-outline-variant pt-4">
                <label className="text-xs font-medium mb-2 block text-on-surface-variant">
                  Motivo do empréstimo <span className="text-error">*</span>
                </label>

                <select
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value as ReasonKey | '')
                    setReasonDetail('')
                    setCustomDeadlineHours('')
                  }}
                  className="w-full px-3 py-2 rounded-lg text-sm border border-outline-variant bg-surface text-on-surface outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
                >
                  <option value="" disabled>Selecione uma categoria...</option>
                  {REASON_CATEGORIES.map((cat: ReasonCategory) => (
                    <option key={cat.key} value={cat.key}>{cat.label}</option>
                  ))}
                </select>

                {reason === 'suporte_tecnico' && (
                  <div className="mt-3">
                    <label className="text-xs font-medium mb-1.5 block text-on-surface-variant">
                      Prazo em horas <span className="text-error">*</span>
                    </label>
                    <input
                      type="number"
                      min={1}
                      placeholder="Ex: 48"
                      value={customDeadlineHours}
                      onChange={(e) => setCustomDeadlineHours(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-sm border border-outline-variant bg-surface text-on-surface placeholder:text-on-surface-variant outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
                    />
                    <p className="text-[11px] mt-1 text-on-surface-variant">Prazo mínimo de 1 hora</p>
                  </div>
                )}

                {reason === 'outro' && (
                  <div className="mt-3">
                    <label className="text-xs font-medium mb-1.5 block text-on-surface-variant">
                      Descreva o motivo <span className="text-error">*</span>
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Descreva o motivo do empréstimo (mín. 10 caracteres)..."
                      value={reasonDetail}
                      onChange={(e) => setReasonDetail(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-sm border border-outline-variant bg-surface text-on-surface placeholder:text-on-surface-variant outline-none focus:ring-2 focus:ring-primary/30 resize-none transition-colors"
                    />
                    <p className="text-[11px] mt-1 text-on-surface-variant">
                      {reasonDetail.trim().length}/10 caracteres mínimos
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setStep(1)}
                className="px-4 py-3 rounded-xl text-sm font-medium bg-surface-container hover:bg-surface-container-high text-on-surface transition-colors"
              >
                Voltar
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={selectedDevices.length === 0 || !isReasonValid()}
                className="flex-1 px-4 py-3 rounded-xl bg-primary text-on-primary text-sm font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity flex items-center justify-center gap-2"
              >
                Continuar
                {selectedDevices.length > 0 && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full font-bold bg-on-primary/20">
                    {selectedDevices.length}
                  </span>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Confirmação ── */}
        {step === 3 && (
          <div>
            <div className="rounded-2xl border border-outline-variant bg-surface-container">
              <div className="px-5 py-4 border-b border-outline-variant">
                <h2 className="font-semibold text-sm text-on-surface">Confirmar empréstimo</h2>
                <p className="text-xs mt-0.5 text-on-surface-variant">Revise os dados antes de confirmar</p>
              </div>

              <div className="p-5 space-y-4">
                <div>
                  <p className="text-xs font-medium mb-2 uppercase tracking-wide text-on-surface-variant">Responsável</p>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary flex-shrink-0">
                      {borrowerName.charAt(0).toUpperCase()}
                    </div>
                    <p className="text-sm font-semibold text-on-surface">{borrowerName}</p>
                  </div>
                </div>

                <div className="border-t border-outline-variant" />

                <div>
                  <p className="text-xs font-medium mb-2 uppercase tracking-wide text-on-surface-variant">
                    iPads ({selectedDevices.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {selectedDeviceObjects.map((d) => (
                      <div
                        key={d.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-outline-variant bg-surface-container-high text-on-surface"
                      >
                        <svg viewBox="0 0 24 24" className="w-3 h-3 fill-none stroke-current" strokeWidth="2">
                          <rect x="5" y="2" width="14" height="20" rx="2" />
                        </svg>
                        {d.name}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t border-outline-variant" />

                <div>
                  <p className="text-xs font-medium mb-1.5 uppercase tracking-wide text-on-surface-variant">Motivo</p>
                  <p className="text-sm font-medium text-on-surface">{currentReasonLabel}</p>
                  {reason === 'suporte_tecnico' && customDeadlineHours && (
                    <p className="text-xs mt-0.5 text-on-surface-variant">Prazo: {customDeadlineHours}h</p>
                  )}
                  {reason === 'outro' && reasonDetail && (
                    <p className="text-xs mt-0.5 text-on-surface-variant">{reasonDetail}</p>
                  )}
                </div>

                <div className="border-t border-outline-variant" />

                <div>
                  <p className="text-xs font-medium mb-1.5 uppercase tracking-wide text-on-surface-variant">Data e hora</p>
                  <p className="text-sm font-mono text-on-surface">
                    {new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setStep(2)}
                className="px-4 py-3 rounded-xl text-sm font-medium bg-surface-container hover:bg-surface-container-high text-on-surface transition-colors"
              >
                Voltar
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 px-4 py-3 rounded-xl bg-primary text-on-primary text-sm font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity flex items-center justify-center gap-2"
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
                  <>
                    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2.5">
                      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Confirmar empréstimo
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
