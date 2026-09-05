import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { loadBankrollContext } from '@/lib/services/context';
import { loadConsensus, type ConsensusFixture } from '@/lib/services/consensus.service';
import type { ConsensusEntry } from '@/lib/bilhetes/domain/consensus';
import { SlipListEmpty } from '@/components/bilhetes/slip-card';
import { Notice } from '@/components/ui/feedback';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import { describeMarket, formatKickoffDate, formatOddMilli, formatSignedBps } from '@/components/tips/format';

export const metadata: Metadata = { title: 'Bilhetes · Consenso' };
export const dynamic = 'force-dynamic';

/**
 * O que várias origens apontam ao mesmo tempo.
 *
 * A tela responde "o que realmente compensa", cruzando os sites de bilhete
 * com o modelo do próprio app. O que ela NÃO faz é decidir por ninguém:
 * mostra quantas e quais fontes apontaram, o histórico medido de cada uma e o
 * preço de mercado. A ressalva sobre independência fica no topo, porque é a
 * maior fraqueza do método e esconder isso seria vender certeza que não há.
 */
export default async function ConsensusPage() {
  const user = await requireUser();
  const context = await loadBankrollContext(user);
  const data = await loadConsensus();
  const tz = context.bankroll.timezone;

  const { totalLegs, usableLegs, sourcesWithout } = data.coverage;
  const pct = totalLegs === 0 ? 0 : Math.round((usableLegs * 100) / totalLegs);

  return (
    <>
      <Notice tone="info" title="Como ler esta tela">
        <p>
          Aqui aparecem as seleções apontadas por mais de uma origem ao mesmo tempo — os sites de bilhete e o modelo
          do próprio app. Coincidência entre fontes é indício, não garantia.
        </p>
        <p className="mt-1.5">
          A ressalva que importa: sites de palpite copiam uns aos outros e leem as mesmas estatísticas públicas, então
          duas fontes concordando não são dois testemunhos independentes. Quando o <strong>modelo do app</strong>{' '}
          concorda, o sinal é mais forte, porque ele parte de outro método — Poisson ancorado no preço de mercado.
        </p>
      </Notice>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge tone="muted">
          {usableLegs} de {totalLegs} pernas cruzáveis ({pct}%)
        </Badge>
        {sourcesWithout.length > 0 ? (
          <Badge tone="warning">sem casamento de partida: {sourcesWithout.join(', ')}</Badge>
        ) : null}
      </div>

      {data.entries.length === 0 ? (
        <div className="mt-4">
          <SlipListEmpty reason={data.emptyReason ?? 'Nada a cruzar agora.'} />
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {data.entries.map((entry) => (
            <EntryCard key={keyOf(entry)} entry={entry} fixture={data.fixtures.get(entry.fixtureId)} tz={tz} />
          ))}
        </ul>
      )}

      {data.singles.length > 0 ? (
        <details className="mt-6 rounded-lg border border-line bg-elevated/40">
          <summary className="cursor-pointer list-none px-4 py-3 text-2xs font-extrabold uppercase tracking-wider text-ink-faint">
            {data.singles.length} seleção(ões) de uma fonte só ▾
          </summary>
          <div className="border-t border-line px-4 py-3">
            <p className="mb-3 text-xs text-ink-muted">
              Estas não são consenso — uma fonte sozinha é palpite. Ficam aqui para consulta, fora da conta principal.
            </p>
            <ul className="space-y-3">
              {data.singles.map((entry) => (
                <EntryCard key={keyOf(entry)} entry={entry} fixture={data.fixtures.get(entry.fixtureId)} tz={tz} />
              ))}
            </ul>
          </div>
        </details>
      ) : null}
    </>
  );
}

function keyOf(entry: ConsensusEntry): string {
  return `${entry.fixtureId}|${entry.market}|${entry.selection}|${entry.line ?? ''}`;
}

function EntryCard({
  entry,
  fixture,
  tz,
}: {
  entry: ConsensusEntry;
  fixture: ConsensusFixture | undefined;
  tz: string;
}) {
  if (!fixture) return null;
  const live = fixture.status === 'LIVE' || fixture.status === 'HALFTIME';

  return (
    <li className="card px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-2xs uppercase tracking-wider text-ink-faint">
            {fixture.league} · {formatKickoffDate(fixture.startTime, tz)}
            {live ? ` · ${fixture.minute ?? 0}' · ${fixture.homeScore} x ${fixture.awayScore}` : ''}
          </p>
          <h3 className="mt-0.5 text-[15px] font-750 text-ink">
            {fixture.home} <span className="text-ink-faint">x</span> {fixture.away}
          </h3>
          <p className="mt-1 text-sm font-bold text-accent">
            {describeMarket(entry.market, entry.selection, entry.line)}
          </p>
        </div>

        <div className="text-right">
          <p
            className={cn(
              'text-num-lg font-extrabold tnum',
              entry.score >= 70 ? 'text-accent' : entry.score >= 50 ? 'text-ink' : 'text-ink-muted',
            )}
          >
            {entry.score}
            <span className="text-sm font-bold text-ink-faint">/100</span>
          </p>
          <p className="text-2xs text-ink-faint">nota de consenso</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {entry.sources.map((source) => (
          <span
            key={source.slug}
            className={cn(
              'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold',
              source.kind === 'MODEL'
                ? 'border-accent/45 bg-accent/15 text-accent'
                : 'border-line bg-elevated text-ink-muted',
            )}
          >
            {source.name}
          </span>
        ))}
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 border-t border-line pt-3 sm:grid-cols-4">
        <Item
          label="Fontes"
          value={String(entry.sourceCount)}
          hint={entry.modelBacked ? 'modelo incluso' : 'só sites'}
        />
        <Item
          label="Melhor odd"
          value={entry.bestOddMilli === null ? '—' : formatOddMilli(entry.bestOddMilli)}
          hint={entry.bookmaker ?? 'sem cotação coletada'}
        />
        <Item
          label="Value"
          value={entry.valueBps === null ? '—' : formatSignedBps(entry.valueBps)}
          hint={entry.modelProbabilityBps === null ? 'modelo não avaliou' : 'contra o modelo'}
          tone={entry.valueBps === null ? undefined : entry.valueBps > 0 ? 'positive' : 'negative'}
        />
        <Item
          label="Histórico das fontes"
          value={entry.backersRoiBps === null ? '—' : formatSignedBps(entry.backersRoiBps)}
          hint={entry.backersRoiBps === null ? 'sem amostra ainda' : 'yield medido'}
          tone={entry.backersRoiBps === null ? undefined : entry.backersRoiBps > 0 ? 'positive' : 'negative'}
        />
      </dl>
    </li>
  );
}

function Item({
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
          'mt-0.5 text-num-md font-extrabold tnum',
          tone === 'positive' ? 'text-positive' : tone === 'negative' ? 'text-negative' : 'text-ink',
        )}
      >
        {value}
      </dd>
      <p className="text-2xs text-ink-faint">{hint}</p>
    </div>
  );
}
