'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AllowedUser {
  email: string
  name: string | null
  created_at: string
}

interface UserFormData {
  email: string
  name: string
}

const EMPTY_FORM: UserFormData = { email: '', name: '' }
const PAGE_SIZE = 20

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function initials(name: string | null, email: string): string {
  if (name && name.trim().length > 0) {
    const parts = name.trim().split(' ')
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0][0].toUpperCase()
  }
  return email[0].toUpperCase()
}

// ─── Add User Modal ───────────────────────────────────────────────────────────

function AddUserModal({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<UserFormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (field: keyof UserFormData) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }))

  const isValidEmail = (email: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())

  const isValid = isValidEmail(form.email) && form.name.trim().length >= 2

  const handleSave = async () => {
    if (!isValid) return
    setSaving(true)
    setError(null)
    const sb = createClient()

    const { error: dbError } = await sb.from('allowed_users').insert({
      email: form.email.trim().toLowerCase(),
      name: form.name.trim(),
    })

    if (dbError) {
      if (dbError.code === '23505') {
        setError('Este e-mail já está cadastrado.')
      } else {
        setError(dbError.message || 'Erro ao adicionar usuário.')
      }
      setSaving(false)
      return
    }

    toast.success(`${form.name.trim()} adicionado com sucesso.`)
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm p-0 md:p-4">
      <div className="w-full md:max-w-md rounded-t-2xl md:rounded-2xl border border-outline-variant bg-surface overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant">
          <div>
            <p className="text-sm font-semibold text-on-surface">Adicionar usuário</p>
            <p className="text-xs mt-0.5 text-on-surface-variant">Concede acesso ao sistema</p>
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
        <div className="p-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-error-container/20 border border-error/20 text-error text-sm">
              <svg viewBox="0 0 24 24" className="w-4 h-4 flex-shrink-0 fill-none stroke-current" strokeWidth="2">
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" strokeLinecap="round" />
              </svg>
              {error}
            </div>
          )}

          {/* Nome */}
          <div>
            <label className="text-xs font-medium text-on-surface-variant mb-1.5 block">
              Nome completo <span className="text-error">*</span>
            </label>
            <input
              autoFocus
              type="text"
              placeholder="Ex: João da Silva"
              value={form.name}
              onChange={set('name')}
              className="w-full px-3 py-2.5 rounded-xl text-sm border border-outline-variant bg-surface-container outline-none focus:ring-2 focus:ring-primary/30 text-on-surface placeholder:text-on-surface-variant transition-colors"
            />
            <p className="text-[11px] mt-1 text-on-surface-variant">Mínimo 2 caracteres</p>
          </div>

          {/* E-mail */}
          <div>
            <label className="text-xs font-medium text-on-surface-variant mb-1.5 block">
              E-mail Google <span className="text-error">*</span>
            </label>
            <input
              type="email"
              placeholder="usuario@maplebeargoiania.com.br"
              value={form.email}
              onChange={set('email')}
              onKeyDown={(e) => { if (e.key === 'Enter' && isValid) handleSave() }}
              className="w-full px-3 py-2.5 rounded-xl text-sm border border-outline-variant bg-surface-container outline-none focus:ring-2 focus:ring-primary/30 text-on-surface placeholder:text-on-surface-variant transition-colors"
            />
            <p className="text-[11px] mt-1 text-on-surface-variant">
              Deve ser a conta Google usada para login
            </p>
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
                Adicionando...
              </>
            ) : (
              'Adicionar usuário'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Confirm Remove Dialog ────────────────────────────────────────────────────

function ConfirmRemoveDialog({
  user,
  onConfirm,
  onClose,
  loading,
}: {
  user: AllowedUser
  onConfirm: () => void
  onClose: () => void
  loading: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl border border-outline-variant bg-surface overflow-hidden">
        <div className="p-6">
          <p className="text-base font-semibold text-on-surface mb-2">Remover acesso?</p>
          <p className="text-sm text-on-surface-variant">
            <span className="font-medium text-on-surface">{user.name ?? user.email}</span> perderá
            o acesso ao sistema imediatamente. Esta ação pode ser desfeita adicionando o usuário novamente.
          </p>
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
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-error-container text-on-error-container hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? 'Removendo...' : 'Remover acesso'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function UsuariosPage() {
  const [users, setUsers] = useState<AllowedUser[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const [showAddModal, setShowAddModal] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<AllowedUser | null>(null)
  const [removeLoading, setRemoveLoading] = useState(false)

  const loadUsers = useCallback(async () => {
    setLoading(true)
    const sb = createClient()

    const { data, error } = await sb
      .from('allowed_users')
      .select('email, name, created_at')
      .order('name', { ascending: true })

    if (error) {
      toast.error('Erro ao carregar usuários.')
      setLoading(false)
      return
    }

    setUsers((data ?? []) as AllowedUser[])
    setLoading(false)
  }, [])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  // Reset para página 1 ao buscar
  useEffect(() => {
    setPage(1)
  }, [search])

  // Filtro
  const filtered = users.filter((u) => {
    const q = search.toLowerCase()
    return (
      u.email.toLowerCase().includes(q) ||
      (u.name ?? '').toLowerCase().includes(q)
    )
  })

  // Paginação
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // Remover
  const handleRemove = async () => {
    if (!removeTarget) return
    setRemoveLoading(true)
    const sb = createClient()

    const { error } = await sb
      .from('allowed_users')
      .delete()
      .eq('email', removeTarget.email)

    if (error) {
      toast.error('Erro ao remover usuário.')
      setRemoveLoading(false)
      return
    }

    toast.success(`Acesso de ${removeTarget.name ?? removeTarget.email} removido.`)
    setRemoveLoading(false)
    setRemoveTarget(null)
    loadUsers()
  }

  return (
    <div className="text-on-surface">
      {/* Modals */}
      {showAddModal && (
        <AddUserModal
          onClose={() => setShowAddModal(false)}
          onSaved={loadUsers}
        />
      )}
      {removeTarget && (
        <ConfirmRemoveDialog
          user={removeTarget}
          onConfirm={handleRemove}
          onClose={() => setRemoveTarget(null)}
          loading={removeLoading}
        />
      )}

      <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 pb-24 md:pb-6">

        {/* Header da página */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <p className="text-sm text-on-surface-variant mt-0.5">
              {loading ? '—' : `${users.length} usuário${users.length !== 1 ? 's' : ''} com acesso`}
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition-opacity flex-shrink-0"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
            <span className="hidden sm:inline">Adicionar usuário</span>
            <span className="sm:hidden">Adicionar</span>
          </button>
        </div>

        {/* Busca */}
        <div className="flex items-center gap-2 mb-4 px-3 py-2.5 rounded-xl border border-outline-variant bg-surface-container text-on-surface-variant">
          <svg viewBox="0 0 24 24" className="w-4 h-4 flex-shrink-0 fill-none stroke-current" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            placeholder="Buscar por nome ou e-mail..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent outline-none flex-1 text-sm placeholder:text-on-surface-variant text-on-surface"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="text-on-surface-variant hover:text-on-surface transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="2">
                <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>

        {/* ── Desktop: Tabela ── */}
        <div className="hidden md:block rounded-2xl border border-outline-variant overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-container border-b border-outline-variant">
                <th className="text-left px-5 py-3 text-xs font-semibold text-on-surface-variant uppercase tracking-wide">
                  Usuário
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-on-surface-variant uppercase tracking-wide">
                  E-mail
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-on-surface-variant uppercase tracking-wide">
                  Adicionado em
                </th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-on-surface-variant uppercase tracking-wide">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/50">
              {loading ? (
                [...Array(4)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(4)].map((_, j) => (
                      <td key={j} className="px-4 py-4">
                        <div className="h-4 rounded animate-pulse bg-surface-container-high" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-12 text-sm text-on-surface-variant opacity-50">
                    {search ? 'Nenhum usuário encontrado com essa busca.' : 'Nenhum usuário cadastrado.'}
                  </td>
                </tr>
              ) : (
                paginated.map((user) => (
                  <tr
                    key={user.email}
                    className="transition-colors hover:bg-surface-container/50"
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                          {initials(user.name, user.email)}
                        </div>
                        <p className="font-semibold text-on-surface">
                          {user.name ?? <span className="text-on-surface-variant italic">Sem nome</span>}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-xs font-mono text-on-surface-variant">{user.email}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-xs text-on-surface-variant">{formatDate(user.created_at)}</span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => setRemoveTarget(user)}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-error/70 hover:text-error hover:bg-error-container/10 transition-colors"
                      >
                        Remover
                      </button>
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
              <div key={i} className="h-20 rounded-2xl animate-pulse bg-surface-container" />
            ))
          ) : paginated.length === 0 ? (
            <div className="text-center py-12 text-sm text-on-surface-variant opacity-50">
              {search ? 'Nenhum usuário encontrado.' : 'Nenhum usuário cadastrado.'}
            </div>
          ) : (
            paginated.map((user) => (
              <div
                key={user.email}
                className="rounded-2xl border border-outline-variant bg-surface-container p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary flex-shrink-0">
                      {initials(user.name, user.email)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-on-surface truncate">
                        {user.name ?? <span className="italic text-on-surface-variant">Sem nome</span>}
                      </p>
                      <p className="text-xs font-mono text-on-surface-variant truncate">{user.email}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setRemoveTarget(user)}
                    className="flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium bg-error-container/20 hover:bg-error-container/30 text-error transition-colors"
                  >
                    Remover
                  </button>
                </div>
                <p className="text-[11px] text-on-surface-variant mt-2 pl-13">
                  Adicionado em {formatDate(user.created_at)}
                </p>
              </div>
            ))
          )}
        </div>

        {/* Paginação */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-6">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-container hover:bg-surface-container-high text-on-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Anterior
            </button>
            <span className="text-xs text-on-surface-variant">
              {page} de {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-container hover:bg-surface-container-high text-on-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Próxima
            </button>
          </div>
        )}

        {/* Rodapé com contagem */}
        {!loading && filtered.length > 0 && (
          <p className="text-xs text-on-surface-variant text-center mt-4">
            {filtered.length} usuário{filtered.length !== 1 ? 's' : ''}
            {search && ` · ${users.length} no total`}
          </p>
        )}
      </div>
    </div>
  )
}
