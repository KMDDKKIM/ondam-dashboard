import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const publicPaths = ['/login', '/signup'];

  if (!user) {
    if (!publicPaths.includes(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // 로그인은 됐지만 원장 승인 전인 계정은 대기 화면 말고는 아무것도 못 보게 막는다.
  // staff 행이 아예 없는 경우(정상 가입 흐름을 안 거친 경우)도 같이 막는다.
  if (pathname !== '/pending-approval') {
    const { data: staff } = await supabase
      .from('staff')
      .select('status')
      .eq('id', user.id)
      .maybeSingle();

    if (staff?.status !== 'approved') {
      const url = request.nextUrl.clone();
      url.pathname = '/pending-approval';
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
