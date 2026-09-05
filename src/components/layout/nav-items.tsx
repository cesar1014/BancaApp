import type { ReactNode } from 'react';
import {
  IconAudit,
  IconChart,
  IconClosing,
  IconDashboard,
  IconEntries,
  IconHistory,
  IconSettings,
  IconTarget,
  IconTicket,
  IconTips,
  IconTransfer,
  IconUsers,
} from '@/components/icons';

export interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  group: 'Operação' | 'Acompanhamento' | 'Administração';
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: <IconDashboard />, group: 'Operação' },
  { href: '/entradas', label: 'Entradas', icon: <IconEntries />, group: 'Operação' },
  { href: '/dicas', label: 'Dicas', icon: <IconTips />, group: 'Operação' },
  { href: '/bilhetes', label: 'Bilhetes', icon: <IconTicket />, group: 'Operação' },
  { href: '/metas', label: 'Metas diárias', icon: <IconTarget />, group: 'Operação' },

  { href: '/historico', label: 'Histórico', icon: <IconHistory />, group: 'Acompanhamento' },
  { href: '/estatisticas', label: 'Estatísticas', icon: <IconChart />, group: 'Acompanhamento' },
  { href: '/socios', label: 'Sócios', icon: <IconUsers />, group: 'Acompanhamento' },
  { href: '/movimentacoes', label: 'Movimentações', icon: <IconTransfer />, group: 'Acompanhamento' },

  { href: '/fechamento', label: 'Fechamento', icon: <IconClosing />, group: 'Administração' },
  { href: '/configuracoes', label: 'Configurações', icon: <IconSettings />, group: 'Administração' },
  { href: '/auditoria', label: 'Auditoria', icon: <IconAudit />, group: 'Administração' },
];

export const NAV_GROUPS = ['Operação', 'Acompanhamento', 'Administração'] as const;

/**
 * Os quatro destinos da barra inferior no celular — é por onde os sócios
 * conferem a banca no dia a dia. O resto do menu mora no "Mais".
 */
export const PRIMARY_TABS: readonly string[] = ['/dashboard', '/entradas', '/dicas', '/metas'];

/** Rótulo curto para caber na barra inferior sem quebrar linha. */
export const TAB_LABEL: Record<string, string> = {
  '/dashboard': 'Início',
  '/entradas': 'Entradas',
  '/dicas': 'Dicas',
  '/metas': 'Metas',
};
