import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ToastProvider } from '@/components/ui/toast';

export const metadata: Metadata = {
  title: {
    default: 'Banca — Gestão de banca esportiva',
    template: '%s · Banca',
  },
  description:
    'Sistema de gestão de banca esportiva compartilhada: entradas, metas, controle de risco, sócios e fechamento mensal.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#11100E',
  width: 'device-width',
  initialScale: 1,
  // A casca é mobile-first e tem barra fixa embaixo: o conteúdo precisa poder
  // entrar na área da faixa inferior do aparelho.
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <body className="min-h-dvh bg-canvas font-sans">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
