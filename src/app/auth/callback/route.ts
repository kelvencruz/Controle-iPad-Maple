import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

const BASE_URL = 'https://controle-ipads.vercel.app'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.redirect(`${BASE_URL}/login?error=no_code`)
  }

  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

  if (exchangeError) {
    console.error('[auth/callback] exchangeCodeForSession:', exchangeError.message)
    return NextResponse.redirect(`${BASE_URL}/login?error=auth_error`)
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email) {
    await supabase.auth.signOut()
    return NextResponse.redirect(`${BASE_URL}/login?error=no_email`)
  }

  const { data: allowed } = await supabase
    .from('allowed_users')
    .select('email')
    .eq('email', user.email.toLowerCase())
    .maybeSingle()

  if (!allowed) {
    await supabase.auth.signOut()
    return NextResponse.redirect(`${BASE_URL}/login?error=not_allowed`)
  }

  return NextResponse.redirect(`${BASE_URL}/dashboard`)
}