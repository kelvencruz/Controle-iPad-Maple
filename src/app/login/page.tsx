'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const ERROR_MESSAGES: Record<string, string> = {
  not_allowed: 'Seu e-mail não está autorizado. Entre em contato com o administrador.',
  auth_error:  'Erro de autenticação. Tente novamente.',
  no_email:    'Não foi possível obter o e-mail da conta Google.',
  no_code:     'Código de autorização inválido. Tente novamente.',
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}

function LoginForm() {
  const searchParams = useSearchParams()
  const errorKey = searchParams.get('error')
  const errorMsg = errorKey ? (ERROR_MESSAGES[errorKey] ?? 'Erro desconhecido.') : null

  async function handleGoogleLogin() {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        // queryParams: { hd: 'suadomain.com.br' }, // ← descomentar para restringir ao domínio Google Workspace
      },
    })
  }

  return (
    <div className="flex h-dvh items-center justify-center px-4">
      <div className="w-full max-w-xs space-y-8">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-[--color-on-surface]">
            Controle de iPads
          </h1>
          <p className="mt-2 text-sm text-[--color-on-surface-variant]">
            Use sua conta institucional Google para entrar
          </p>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="rounded-xl bg-[--color-error-container] px-4 py-3 text-sm text-[--color-on-error-container]"
          >
            {errorMsg}
          </div>
        )}

        <button
          onClick={handleGoogleLogin}
          className="flex w-full items-center justify-center gap-3 rounded-xl border border-[--color-outline-variant] bg-[--color-surface-container] px-4 py-3 text-sm font-medium text-[--color-on-surface] transition-colors hover:bg-[--color-surface-container-high] active:bg-[--color-surface-container-highest]"
        >
          <GoogleIcon />
          Entrar com Google
        </button>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}