import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { loadBankrollContext } from '@/lib/services/context';
import { loadFixtureDetail } from '@/lib/services/sports/tips.service';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/feedback';
import { IconChevronLeft } from '@/components/icons';
import { AnalysisStateBadge, LiveStateBadge, StaleBadge } from '@/components/tips/badges';
import { OpportunityBlock } from '@/components/tips/opportunity-block';
import { PressureBars } from '@/components/tips/score-meter';
import { TipCard } from '@/components/tips/tip-card';
import { LiveAutoRefresh } from '@/components/tips/live-auto-refresh';
import { describeMarket, formatAgo, formatKickoffDate, formatMinute, formatOddMilli } from '@/components/tips/format';
import { formatDateTimeBR } from '@/lib/datetime';
import { PROVIDER_LABEL, type MarketKey, type Selection } from '@/lib/sports/domain/models';
import { STRATEGY_CONFIGS } from '@/lib/sports/config/strategy-config';

export const metadata: Metadata = { title: 'Dicas · Partida' };
export const dynamic = 'force-dynamic';

export default async function FixtureDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const context = await loadBankrollContext(user);
  const { id } = await params;
  const data = await loadFixtureDetail(decodeURIComponent(id));
  if (!data) notFound();

  const { fixture, raw } = data;
  const live = fixture.status === 'LIVE' || fixture.status === 'HALFTIME';
  const now = new Date();
  const strategyName = (key: string) => STRATEGY_CONFIGS.find((s) => s.key === key)?.name ?? key;
  const events = raw.events.filter((e) => e.type !== 'SUBSTITUTION');

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href="/dicas/ao-vivo">
          <Button variant="ghost" size="sm">
            <IconChevronLeft /> Voltar
          </Button>
        </Link>
        {live ? <LiveAutoRefresh intervalMs={45_000} /> : null}
      </div>

      <Card>
        <CardBody>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-2xs font-extrabold uppercase text-ink-faint">
                {fixture.league.name} · {fixture.league.country} · {formatKickoffDate(fixture.startTime, context.bankroll.timezone)}
              </p>
              <h2 className="mt-2 text-[22px] font-extrabold tracking-[-0.03em] text-ink sm:text-[26px]">
                {fixture.homeName}
                <span className="mx-3 tnum text-accent">
                  {fixture.score.home} x {fixture.score.away}
                </span>
                {fixture.awayName}
              </h2>
              <p className="mt-1 text-sm text-ink-muted">
                <span className="font-extrabold text-ink">{formatMinute(fixture.status, fixture.minute) || 'Agendada'}</span>
                {raw.halftimeScore ? ` · intervalo ${raw.halftimeScore.home} x ${raw.halftimeScore.away}` : ''}
                <span className="text-ink-faint"> · atualizado {formatAgo(fixture.lastUpdated, now)}</span>
              </p>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              {live ? <LiveStateBadge state={fixture.liveState} /> : <AnalysisStateBadge state={fixture.analysisState} />}
              <StaleBadge stale={fixture.stale} />
              <span className="text-2xs text-ink-faint">
                fonte: {fixture.sources.map((s) => PROVIDER_LABEL[s]).join(' + ')} · confiança {fixture.confidence.toLowerCase()}
              </span>
            </div>
          </div>

          {fixture.pressure.home !== null || fixture.pressure.away !== null ? (
            <div className="mt-5">
              <PressureBars home={fixture.pressure.home} away={fixture.pressure.away} />
            </div>
          ) : null}
        </CardBody>
      </Card>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          {fixture.activeTips.length > 0 ? (
            <section>
              <h3 className="lbl mb-3">Dicas ativas</h3>
              <div className="grid gap-4">
                {fixture.activeTips.map((tip) => (
                  <TipCard key={tip.id} tip={tip} timezone={context.bankroll.timezone} now={now} />
                ))}
              </div>
            </section>
          ) : null}

          <section>
            <h3 className="lbl mb-3">Análise por mercado</h3>
            {fixture.candidates.length === 0 ? (
              <Card>
                <CardBody>
                  <p className="text-sm text-ink-muted">Esta partida ainda não foi avaliada pelo motor (fora do funil ou sem dados suficientes).</p>
                </CardBody>
              </Card>
            ) : (
              <div className="grid gap-3">
                {fixture.candidates
                  .filter((c) => c.applicable)
                  .sort((a, b) => b.score - a.score)
                  .map((candidate) => (
                    <div key={`${candidate.strategyKey}:${candidate.selection}`}>
                      <p className="mb-1.5 text-xs font-bold text-ink-muted">{strategyName(candidate.strategyKey)}</p>
                      <OpportunityBlock candidate={candidate} now={now} showBreakdown />
                    </div>
                  ))}
                {fixture.candidates.some((c) => !c.applicable) ? (
                  <details className="text-xs text-ink-faint">
                    <summary className="cursor-pointer font-bold">Mercados não aplicáveis agora</summary>
                    <ul className="mt-2 space-y-1">
                      {fixture.candidates
                        .filter((c) => !c.applicable)
                        .map((c) => (
                          <li key={`${c.strategyKey}:${c.selection}`}>
                            {strategyName(c.strategyKey)} — {c.reason ?? 'não aplicável'}
                          </li>
                        ))}
                    </ul>
                  </details>
                ) : null}
              </div>
            )}
          </section>

          {data.tips.filter((tip) => tip.status !== 'ACTIVE').length > 0 ? (
            <section>
              <h3 className="lbl mb-3">Dicas encerradas</h3>
              <div className="grid gap-4">
                {data.tips
                  .filter((tip) => tip.status !== 'ACTIVE')
                  .map((tip) => (
                    <TipCard key={tip.id} tip={tip} timezone={context.bankroll.timezone} now={now} />
                  ))}
              </div>
            </section>
          ) : null}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Estatísticas" description={raw.statistics ? `Fonte: ${PROVIDER_LABEL[raw.statistics.source ?? 'mock']}` : undefined} />
            <CardBody className="pt-0">
              {fixture.stats.length === 0 ? (
                <p className="text-xs text-ink-faint">Sem estatísticas disponíveis.</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-line">
                    {fixture.stats.map((line) => (
                      <tr key={line.label}>
                        <td className="py-1.5 text-right tnum font-bold text-ink">{line.home}</td>
                        <td className="px-3 py-1.5 text-center text-xs text-ink-faint">{line.label}</td>
                        <td className="py-1.5 text-left tnum font-bold text-ink">{line.away}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardBody>
          </Card>

          {events.length > 0 ? (
            <Card>
              <CardHeader title="Eventos" />
              <CardBody className="pt-0">
                <ul className="space-y-1.5 text-xs">
                  {events.map((event, index) => (
                    <li key={index} className="flex items-center gap-2">
                      <span className="w-9 shrink-0 tnum font-bold text-ink">{event.minute}&apos;</span>
                      <Badge tone={event.type.includes('GOAL') ? 'positive' : event.type === 'RED_CARD' ? 'negative' : 'muted'}>
                        {event.type === 'GOAL' || event.type === 'PENALTY_GOAL' ? 'Gol' : event.type === 'OWN_GOAL' ? 'Gol contra' : event.type === 'YELLOW_CARD' ? 'Amarelo' : event.type === 'RED_CARD' ? 'Vermelho' : event.type === 'PENALTY_MISSED' ? 'Pênalti perdido' : 'VAR'}
                      </Badge>
                      <span className="truncate text-ink-muted">
                        {event.team === 'HOME' ? fixture.homeName : fixture.awayName}
                        {event.player ? ` · ${event.player}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}

          {raw.odds && raw.odds.quotes.length > 0 ? (
            <Card>
              <CardHeader title="Odds por casa" description={`Atualizadas ${formatAgo(raw.odds.lastUpdated, now)}${raw.odds.stale ? ' · podem estar desatualizadas' : ''}`} />
              <CardBody className="pt-0">
                <OddsTable quotes={raw.odds.quotes} timezone={context.bankroll.timezone} />
              </CardBody>
            </Card>
          ) : null}

          {data.snapshots.length > 0 ? (
            <Card>
              <CardHeader title="Linha do tempo da análise" description="Snapshots gravados a cada 5 minutos de jogo." />
              <CardBody className="pt-0">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="table-head">
                      <th className="py-2 text-left">Min</th>
                      <th className="py-2 text-left">Placar</th>
                      <th className="py-2 text-right">Score</th>
                      <th className="py-2 text-right">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.snapshots.map((s) => (
                      <tr key={s.minute}>
                        <td className="py-1.5 tnum font-bold text-ink">{s.minute}&apos;</td>
                        <td className="py-1.5 tnum text-ink-muted">
                          {s.score.home} x {s.score.away}
                        </td>
                        <td className="py-1.5 text-right tnum font-bold text-ink">{s.bestScore}</td>
                        <td className="py-1.5 text-right">
                          <AnalysisStateBadge state={s.state} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>

      <Notice tone="info" className="mt-6" title="Sobre os números">
        O score combina pressão, xG, finalizações, contexto e valor da odd com pesos configuráveis. Quando um dado não existe para esta partida, o peso dele é redistribuído — a nota nunca é punida por um provedor não fornecer uma estatística. Última avaliação: {data.fixture.candidates.length > 0 ? formatDateTimeBR(now, context.bankroll.timezone) : '—'}.
      </Notice>
    </>
  );
}

function OddsTable({ quotes, timezone }: { quotes: { market: MarketKey; selection: Selection; line: number | null; oddMilli: number; bookmaker: string; capturedAt: string }[]; timezone: string }) {
  // Agrupa por mercado/seleção/linha e mostra a melhor odd em destaque.
  const groups = new Map<string, typeof quotes>();
  for (const quote of quotes) {
    const key = `${quote.market}:${quote.selection}:${quote.line ?? ''}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(quote);
  }
  return (
    <div className="space-y-3">
      {[...groups.entries()].slice(0, 12).map(([key, list]) => {
        const sorted = [...list].sort((a, b) => b.oddMilli - a.oddMilli);
        const first = sorted[0]!;
        return (
          <div key={key}>
            <p className="text-xs font-bold text-ink">{describeMarket(first.market, first.selection, first.line)}</p>
            <ul className="mt-1 space-y-0.5 text-xs">
              {sorted.map((quote, index) => (
                <li key={`${quote.bookmaker}-${index}`} className="flex items-center justify-between gap-2 text-ink-muted">
                  <span className="truncate">
                    {quote.bookmaker}
                    {index === 0 ? <Badge tone="accent" className="ml-2">melhor</Badge> : null}
                  </span>
                  <span className="shrink-0 tnum">
                    <span className={index === 0 ? 'font-extrabold text-ink' : ''}>{formatOddMilli(quote.oddMilli)}</span>
                    <span className="ml-2 text-ink-faint">{formatDateTimeBR(quote.capturedAt, timezone).slice(-5)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
