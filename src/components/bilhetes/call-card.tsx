import { cn } from '@/lib/cn';
import { Badge, type Tone } from '@/components/ui/badge';
import { IconAlert, IconCheck, IconClose, IconInfo } from '@/components/icons';
import { formatOddMilli } from '@/components/tips/format';
import type { CallView, ChannelPanel } from '@/lib/services/calls.service';

/**
 * Call avulsa de canal do Telegram.
 *
 * O card mostra o que o canal publicou e nada além. Não há odd real, margem
 * nem chance estimada: sem a partida — que o canal não escreve no texto — não
 * existe base para calcular nada disso, e inventar um número seria pior que
 * deixar em branco. Crédito e link para o post original em toda call.
 */
export function CallCard({ call, timezone }: { call: CallView; timezone: string }) {
  const hora = new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(call.postedAt));

  return (
    <article className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-3 last:border-b-0">
      <ResultBadge result={call.result} />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-ink">{call.selection}</p>
        <p className="mt-0.5 text-xs text-ink-faint">
          {call.sourceName} · {hora}
          {call.teamHint ? <> · possivelmente {call.teamHint}</> : null}
        </p>
      </div>

      <div className="text-right">
        <p className="text-num-md font-extrabold tnum text-ink">
          {call.oddMilli === null ? '—' : formatOddMilli(call.oddMilli)}
        </p>
        <p className="text-2xs text-ink-faint">
          {call.unitsCentis === null ? 'unidade não declarada' : `${call.unitsCentis / 100}u`}
          {call.bookmaker ? ` · ${call.bookmaker}` : ''}
        </p>
      </div>

      <a
        href={call.postUrl}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="shrink-0 text-xs font-bold text-ink-muted underline-offset-2 hover:text-accent hover:underline"
      >
        ver post ↗
      </a>
    </article>
  );
}

function ResultBadge({ result }: { result: CallView['result'] }) {
  const map: Record<string, { tone: Tone; label: string; icon: React.ReactNode }> = {
    GREEN: { tone: 'positive', label: 'green', icon: <IconCheck /> },
    RED: { tone: 'negative', label: 'red', icon: <IconClose /> },
    VOID: { tone: 'muted', label: 'anulada', icon: <IconInfo /> },
  };
  const item = result ? map[result] : null;
  return item ? (
    <Badge tone={item.tone}>
      {item.icon}
      {item.label}
    </Badge>
  ) : (
    <Badge tone="neutral">
      <IconAlert />
      em aberto
    </Badge>
  );
}

/**
 * Placar do canal.
 *
 * Deliberadamente mostra o TAMANHO DA AMOSTRA junto com os números e avisa
 * quando ela é pequena demais. Com 10 ou 20 apostas resolvidas, sorte e
 * habilidade são indistinguíveis, e um ROI de +70% ali não significa nada —
 * exibi-lo sem essa ressalva seria enganoso.
 */
export function ChannelScoreboard({ panel }: { panel: ChannelPanel }) {
  const { score, source } = panel;
  const confiavel = score.settled >= 100;
  const utilizavel = score.settled >= 30;

  return (
    <div className="card px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-750 uppercase tracking-[0.02em] text-ink">{source.name}</h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="underline-offset-2 hover:text-accent hover:underline"
            >
              @{source.channel}
            </a>
            {' · '}
            {score.calls} call{score.calls === 1 ? '' : 's'} desde{' '}
            {source.trackingSince
              ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(
                  new Date(source.trackingSince),
                )
              : '—'}
          </p>
        </div>
        <Badge tone={confiavel ? 'accent' : utilizavel ? 'neutral' : 'muted'}>
          {confiavel ? 'amostra sólida' : utilizavel ? 'amostra inicial' : 'amostra pequena'}
        </Badge>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        <Metric
          label="Acerto"
          value={score.hitRateBps === null ? '—' : `${(score.hitRateBps / 100).toFixed(0)}%`}
          hint={`${score.greens}G · ${score.reds}R${score.voids > 0 ? ` · ${score.voids} anulada` : ''}`}
        />
        <Metric
          label="ROI"
          value={score.roiBps === null ? '—' : `${score.roiBps > 0 ? '+' : ''}${(score.roiBps / 100).toFixed(1)}%`}
          hint="lucro ÷ arriscado"
          tone={score.roiBps === null ? undefined : score.roiBps > 0 ? 'positive' : score.roiBps < 0 ? 'negative' : undefined}
        />
        <Metric
          label="Lucro"
          value={`${score.profitCentis > 0 ? '+' : ''}${(score.profitCentis / 100).toFixed(2)}u`}
          hint={`${(score.stakedCentis / 100).toFixed(0)}u arriscadas`}
          tone={score.profitCentis > 0 ? 'positive' : score.profitCentis < 0 ? 'negative' : undefined}
        />
        <Metric
          label="Odd média"
          value={score.averageOddMilli === null ? '—' : formatOddMilli(score.averageOddMilli)}
          hint={score.pending > 0 ? `${score.pending} em aberto` : 'todas resolvidas'}
        />
      </dl>

      {!utilizavel ? (
        <p className="mt-3 border-t border-line pt-3 text-xs text-ink-faint">
          São {score.settled} aposta{score.settled === 1 ? '' : 's'} resolvida
          {score.settled === 1 ? '' : 's'}. Com essa amostra, sorte e habilidade são indistinguíveis — os números
          acima ainda não dizem se o canal presta. A partir de umas 100, começam a dizer.
        </p>
      ) : null}
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: 'positive' | 'negative';
}) {
  return (
    <div>
      <dt className="lbl">{label}</dt>
      <dd
        className={cn(
          'mt-1 text-num-lg font-extrabold tnum',
          tone === 'positive' ? 'text-positive' : tone === 'negative' ? 'text-negative' : 'text-ink',
        )}
      >
        {value}
      </dd>
      <p className="text-2xs text-ink-faint">{hint}</p>
    </div>
  );
}
