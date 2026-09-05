import { Badge, type Tone } from '@/components/ui/badge';
import { IconAlert, IconCheck, IconClose, IconFlame, IconInfo, IconSearch, IconTarget } from '@/components/icons';
import {
  ANALYSIS_STATE_LABEL,
  LIVE_DISPLAY_LABEL,
  type AnalysisState,
  type LiveDisplayState,
  type TipConfidence,
  type TipResult,
  type TipStatus,
} from '@/lib/sports/domain/models';
import type { ReactNode } from 'react';

/**
 * Badges de estado da Central de Dicas. Cada estado carrega cor + ícone +
 * texto, para nunca depender só da cor.
 */

const LIVE_TONE: Record<LiveDisplayState, { tone: Tone; icon: ReactNode }> = {
  NORMAL: { tone: 'muted', icon: null },
  MONITORANDO: { tone: 'dashed', icon: <IconSearch /> },
  ATENCAO: { tone: 'warning', icon: <IconAlert /> },
  QUASE_ENTRADA: { tone: 'warning', icon: <IconTarget /> },
  OPORTUNIDADE: { tone: 'positive', icon: <IconFlame /> },
  ENCERRADA: { tone: 'muted', icon: null },
};

export function LiveStateBadge({ state }: { state: LiveDisplayState }) {
  const { tone, icon } = LIVE_TONE[state];
  return (
    <Badge tone={tone}>
      {icon}
      {LIVE_DISPLAY_LABEL[state]}
    </Badge>
  );
}

const ANALYSIS_TONE: Record<AnalysisState, { tone: Tone; icon: ReactNode }> = {
  OBSERVANDO: { tone: 'muted', icon: null },
  MONITORANDO: { tone: 'dashed', icon: <IconSearch /> },
  PRESSAO_DETECTADA: { tone: 'warning', icon: <IconAlert /> },
  POSSIVEL_OPORTUNIDADE: { tone: 'warning', icon: <IconTarget /> },
  ODD_AGUARDANDO: { tone: 'warning', icon: <IconInfo /> },
  VALUE_CONFIRMADO: { tone: 'positive', icon: <IconCheck /> },
  ENTRADA_IDENTIFICADA: { tone: 'positive', icon: <IconFlame /> },
  DESCARTADA: { tone: 'negative', icon: <IconClose /> },
  ENCERRADA: { tone: 'muted', icon: null },
};

export function AnalysisStateBadge({ state }: { state: AnalysisState }) {
  const { tone, icon } = ANALYSIS_TONE[state];
  return (
    <Badge tone={tone}>
      {icon}
      {ANALYSIS_STATE_LABEL[state]}
    </Badge>
  );
}

const CONFIDENCE_TONE: Record<TipConfidence, Tone> = { BAIXA: 'muted', MEDIA: 'warning', ALTA: 'positive' };
const CONFIDENCE_LABEL: Record<TipConfidence, string> = { BAIXA: 'Confiança baixa', MEDIA: 'Confiança média', ALTA: 'Confiança alta' };

export function ConfidenceBadge({ confidence }: { confidence: TipConfidence }) {
  return <Badge tone={CONFIDENCE_TONE[confidence]}>{CONFIDENCE_LABEL[confidence]}</Badge>;
}

export function TipResultBadge({ result, status }: { result: TipResult | null; status: TipStatus }) {
  if (result === 'GREEN') return <Badge tone="positive"><IconCheck />Green</Badge>;
  if (result === 'RED') return <Badge tone="negative"><IconClose />Red</Badge>;
  if (result === 'PUSH') return <Badge tone="muted">Push</Badge>;
  if (status === 'ACTIVE') return <Badge tone="dashed">Em aberto</Badge>;
  return <Badge tone="muted">{status === 'EXPIRED' ? 'Expirada' : 'Descartada'}</Badge>;
}

export function StaleBadge({ stale }: { stale: boolean }) {
  if (!stale) return null;
  return (
    <Badge tone="warning">
      <IconAlert />
      Pode estar desatualizado
    </Badge>
  );
}
