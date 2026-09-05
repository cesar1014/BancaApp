import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/token';

/**
 * Primeira barreira de autenticação: valida a assinatura do cookie antes de a
 * rota sequer ser renderizada.
 *
 * Isto NÃO substitui a verificação no servidor — cada página e cada Server
 * Action revalida a sessão contra o banco (usuário ativo, token_version,
 * permissões). O middleware só evita renderizar páginas privadas para quem
 * claramente não está autenticado.
 */
const PUBLIC_PATHS = new Set(['/login', '/esqueci-senha']);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  const secret = process.env.AUTH_SECRET;
  const claims = token && secret ? await verifySessionToken(token, secret) : null;

  if (PUBLIC_PATHS.has(pathname)) {
    if (claims) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    return NextResponse.next();
  }

  if (!claims) {
    const loginUrl = new URL('/login', request.url);
    if (pathname !== '/') loginUrl.searchParams.set('redirect', pathname);

    const response = NextResponse.redirect(loginUrl);
    if (token) response.cookies.delete(SESSION_COOKIE);
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Todas as rotas exceto arquivos estáticos, a rota de saúde e os workers
     * (que têm autenticação própria por segredo).
     */
    '/((?!_next/static|_next/image|favicon.ico|api/health|api/workers|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
