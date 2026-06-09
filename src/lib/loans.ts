// src/lib/loans.ts
// Helpers compartilhados entre dashboard, devolver, emprestar, sidebar e alertas.

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface ActiveLoan {
  id: string
  device_id: string
  device_name: string
  qr_code: string
  borrower_name: string
  reason: string | null
  reason_detail: string | null
  custom_deadline_hours: number | null
  loaned_at: string
}

// ---------------------------------------------------------------------------
// Categorias de motivo (fonte canônica — não duplicar em outras páginas)
// INC-62: sla_horas vira number com default 72 explícito (opção B)
// ---------------------------------------------------------------------------

export type ReasonKey =
  | 'aula_avaliacao'
  | 'projeto_pedagogico'
  | 'uso_administrativo'
  | 'suporte_tecnico'
  | 'outro'

export interface ReasonCategory {
  key: ReasonKey
  label: string
  sla_horas: number // INC-62: nunca null — suporte_tecnico/outro usam 72 como fallback
}

export const REASON_CATEGORIES: ReasonCategory[] = [
  { key: 'aula_avaliacao',     label: 'Aula em sala / Avaliação', sla_horas: 6   },
  { key: 'projeto_pedagogico', label: 'Projeto pedagógico',        sla_horas: 24  },
  { key: 'uso_administrativo', label: 'Uso administrativo',        sla_horas: 168 },
  { key: 'suporte_tecnico',    label: 'Suporte técnico',           sla_horas: 72  }, // INC-62: default 72; custom_deadline_hours sobrescreve em runtime
  { key: 'outro',              label: 'Outro',                     sla_horas: 72  }, // INC-62: default 72
]

// ---------------------------------------------------------------------------
// Labels de motivo
// ---------------------------------------------------------------------------

export const REASON_LABELS: Record<string, string> = {
  aula_avaliacao:     'Aula em sala / Avaliação',
  projeto_pedagogico: 'Projeto pedagógico',
  uso_administrativo: 'Uso administrativo',
  suporte_tecnico:    'Suporte técnico',
  outro:              'Outro',
}

export function reasonLabel(reason: string | null): string {
  if (!reason) return '—'
  return REASON_LABELS[reason] ?? reason
}

// ---------------------------------------------------------------------------
// SLA por categoria
// INC-64: deriva de REASON_CATEGORIES — fonte única de verdade
// INC-62: custom_deadline_hours sobrescreve sla_horas apenas para suporte_tecnico
// ---------------------------------------------------------------------------

export function getSlaHours(
  reason: string | null,
  customDeadlineHours?: number | null,
): number {
  const cat = REASON_CATEGORIES.find(c => c.key === reason)
  const base = cat?.sla_horas ?? 72
  if (reason === 'suporte_tecnico' && customDeadlineHours != null) {
    return customDeadlineHours
  }
  return base
}

// ---------------------------------------------------------------------------
// Horas decorridas desde o empréstimo
// ---------------------------------------------------------------------------

export function hoursElapsed(loanedAt: string): number {
  return (Date.now() - new Date(loanedAt).getTime()) / 3_600_000
}

// ---------------------------------------------------------------------------
// Formata número de horas em texto legível (ex: "2h 15min", "3d 4h")
// INC-63: uso em alertas/page.tsx e qualquer página que receba hours_elapsed (number)
// ---------------------------------------------------------------------------

export function formatHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}min`
  if (h < 24) return `${h.toFixed(1)}h`
  const days = Math.floor(h / 24)
  const rem  = Math.round(h % 24)
  return rem > 0 ? `${days}d ${rem}h` : `${days}d`
}

// ---------------------------------------------------------------------------
// Classes Tailwind para badge de status
// INC-65: tokens semânticos — sem hardcode emerald/yellow/red
// PENDÊNCIA: token success não existe em globals.css — ok usa emerald até criação do token
// ---------------------------------------------------------------------------

type StatusLevel = 'ok' | 'atencao' | 'atraso'

export function statusLevel(
  loanedAt: string,
  reason: string | null,
  customDeadlineHours?: number | null,
): StatusLevel {
  const elapsed = hoursElapsed(loanedAt)
  const sla     = getSlaHours(reason, customDeadlineHours)
  const ratio   = elapsed / sla

  if (ratio >= 1)    return 'atraso'
  if (ratio >= 0.75) return 'atencao'
  return 'ok'
}

export const STATUS_BADGE_CLASSES: Record<StatusLevel, string> = {
  // PENDÊNCIA: substituir emerald por token success quando adicionado a globals.css
  ok:      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30',
  atencao: 'bg-warning-container text-warning border-warning/25 dark:bg-warning-container dark:text-warning dark:border-warning/25',
  atraso:  'bg-error-container text-on-error-container border-error/25 dark:bg-error-container dark:text-on-error-container dark:border-error/25',
}

export function statusBadgeClasses(
  loanedAt: string,
  reason: string | null,
  customDeadlineHours?: number | null,
): string {
  return STATUS_BADGE_CLASSES[statusLevel(loanedAt, reason, customDeadlineHours)]
}

// ---------------------------------------------------------------------------
// Texto legível do tempo decorrido desde empréstimo (ex: "2h 15min", "3d 4h")
// Recebe string ISO — NÃO number. Para hours_elapsed (number) da view usar formatHours()
// ---------------------------------------------------------------------------

export function formatElapsed(loanedAt: string): string {
  const totalMinutes = Math.floor((Date.now() - new Date(loanedAt).getTime()) / 60_000)
  const days    = Math.floor(totalMinutes / 1440)
  const hours   = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60

  if (days > 0)  return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}min`
  return `${minutes}min`
}