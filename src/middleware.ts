import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const AUTH_ROUTES = ['/login', '/auth']

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Sempre usar getUser() no middleware — valida o JWT contra o servidor Supabase.
  // Nunca usar getSession() aqui.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isAuthRoute = AUTH_ROUTES.some((r) =>
    request.nextUrl.pathname.startsWith(r)
  )

  // Não autenticado tentando acessar rota protegida → /login
  if (!user && !isAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Autenticado: verificar se o e-mail está em allowed_users
  if (user && !isAuthRoute) {
    if (!user.email) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('error', 'no_email')
      return NextResponse.redirect(url)
    }

    const { data: allowed } = await supabase
      .from('allowed_users')
      .select('email')
      .eq('email', user.email)
      .maybeSingle()

    if (!allowed) {
      // Encerra a sessão e redireciona com erro
      await supabase.auth.signOut()
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('error', 'not_allowed')
      return NextResponse.redirect(url)
    }
  }

  // Já autenticado tentando acessar /login → /dashboard
  if (user && request.nextUrl.pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}