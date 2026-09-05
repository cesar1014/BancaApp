'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { closeMonthAction, reopenMonthAction } from '@/actions/closing';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { IconClosing, IconUnlock } from '@/components/icons';
import { formatMonthLabel } from '@/lib/datetime';
import { formatMoney } from '@/lib/money';

export function CloseMonthButton({
  year,
  month,
  openEntries,
  closingBankrollCents,
  profitCents,
}: {
  year: number;
  month: number;
  openEntries: number;
  closingBankrollCents: number;
  profitCents: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const confirm = (allowOpenEntries: boolean) => {
    startTransition(async () => {
      const result = await closeMonthAction({ year, month, allowOpenEntries });
      if (result.ok) {
        toast.success(`${formatMonthLabel(year, month)} fechado.`);
        setOpen(false);
        router.refresh();
      } else if (result.code === 'CONFLICT' && !allowOpenEntries) {
        toast.warning('Confirme o fechamento', result.error);
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <IconClosing /> Fechar {formatMonthLabel(year, month)}
      </Button>

      <ConfirmDialog
        open={open}
        tone="primary"
        title={`Fechar ${formatMonthLabel(year, month)}`}
        description={
          <div className="space-y-3">
            <p>
              O mês será gravado como uma fotografia imutável: banca final{' '}
              <strong className="text-ink">{formatMoney(closingBankrollCents)}</strong> e resultado das
              entradas <strong className="text-ink">{formatMoney(profitCents)}</strong>.
            </p>
            <p>
              Depois disso, entradas e movimentações desse período ficam bloqueadas para edição, e
              mudanças futuras nas configurações não alteram estes números.
            </p>
            {openEntries > 0 ? (
              <p className="text-warning">
                Existem {openEntries} entrada(s) em aberto. Elas não entram no resultado do mês e
                continuarão em aberto depois do fechamento.
              </p>
            ) : null}
          </div>
        }
        confirmLabel="Fechar o mês"
        loading={pending}
        onConfirm={() => confirm(openEntries > 0)}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}

export function ReopenMonthButton({ year, month }: { year: number; month: number }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const confirm = () => {
    startTransition(async () => {
      const result = await reopenMonthAction({ year, month });
      if (result.ok) {
        toast.success(`${formatMonthLabel(year, month)} reaberto.`);
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <IconUnlock /> Reabrir mês
      </Button>

      <ConfirmDialog
        open={open}
        title={`Reabrir ${formatMonthLabel(year, month)}`}
        description="A fotografia gravada será descartada e o período volta a aceitar edições. A ação fica registrada na auditoria. Ao fechar novamente, os números serão recalculados com os dados atuais."
        confirmLabel="Reabrir"
        loading={pending}
        onConfirm={confirm}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
