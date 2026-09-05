import { z } from 'zod';
import { parseMoneyToCents } from '@/lib/money';
import { parseOddToMilli, parsePercentToBps } from '@/lib/numbers';
import { isIsoDate } from '@/lib/datetime';


/**
 * Toda entrada de dados do usuário passa por aqui antes de tocar o banco.
 * Os campos monetários chegam como texto em pt-BR e saem como centavos —
 * o cliente nunca envia valores já calculados.
 */

const trimmed = (max: number) => z.string().trim().max(max);

export const moneyField = (options: { min?: number; max?: number; label?: string } = {}) =>
  z
    .string()
    .transform((value, ctx) => {
      const cents = parseMoneyToCents(value);
      if (cents === null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Informe um valor válido.' });
        return z.NEVER;
      }
      return cents;
    })
    .superRefine((cents, ctx) => {
      if (options.min !== undefined && cents < options.min) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Valor abaixo do mínimo permitido.' });
      }
      if (options.max !== undefined && cents > options.max) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Valor acima do máximo permitido.' });
      }
    });

export const optionalMoneyField = z
  .string()
  .optional()
  .transform((value, ctx) => {
    if (value === undefined || value.trim() === '') return null;
    const cents = parseMoneyToCents(value);
    if (cents === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Informe um valor válido.' });
      return z.NEVER;
    }
    return cents;
  });

export const percentField = (min = 1, max = 10_000) =>
  z.string().transform((value, ctx) => {
    const bps = parsePercentToBps(value);
    if (bps === null || bps < min || bps > max) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Informe um percentual válido.' });
      return z.NEVER;
    }
    return bps;
  });

export const isoDateField = z.string().refine(isIsoDate, 'Informe uma data válida.');

export const timeField = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Informe um horário válido (HH:MM).');

export const uuidField = z.string().uuid('Identificador inválido.');

/**
 * Checkbox de formulário HTML. Um checkbox desmarcado simplesmente não é
 * enviado, então cada formulário coloca um `<input type="hidden" value="false">`
 * imediatamente antes do checkbox: assim o valor final é sempre explícito.
 */
export const checkboxField = z
  .string()
  .optional()
  .transform((value) => value === 'on' || value === 'true' || value === '1');

// ---------------------------------------------------------------------------
// Autenticação
// ---------------------------------------------------------------------------
/** Nick de acesso: 3 a 32 caracteres, letras, números, ponto, hífen e sublinhado. */
export const usernameField = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9._-]{3,32}$/, 'Use de 3 a 32 letras, números, ponto, hífen ou sublinhado.');

export const optionalUsernameField = z
  .string()
  .optional()
  .transform((value) => (value && value.trim() !== '' ? value.trim() : null))
  .refine((value) => value === null || /^[A-Za-z0-9._-]{3,32}$/.test(value), {
    message: 'Use de 3 a 32 letras, números, ponto, hífen ou sublinhado.',
  });

export const loginSchema = z.object({
  login: z.string().trim().min(1, 'Informe seu usuário ou e-mail.').max(200),
  password: z.string().min(1, 'Informe sua senha.'),
});

const newPasswordField = z
  .string()
  .min(8, 'A nova senha deve ter pelo menos 8 caracteres.')
  .max(200, 'Senha muito longa.');

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Informe a senha atual.'),
    newPassword: newPasswordField,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'As senhas não conferem.',
  });

/** "Esqueci a senha": nick + senha padrão + nova senha. */
export const recoverPasswordSchema = z
  .object({
    login: z.string().trim().min(1, 'Informe seu usuário.').max(200),
    currentPassword: z.string().min(1, 'Informe a senha padrão.'),
    newPassword: newPasswordField,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'As senhas não conferem.',
  });

// ---------------------------------------------------------------------------
// Entradas
// ---------------------------------------------------------------------------
export const entrySchema = z
  .object({
    memberId: uuidField,
    occurredOn: isoDateField,
    occurredAtTime: timeField,
    sport: trimmed(60).min(1, 'Informe o esporte.'),
    event: trimmed(200).min(1, 'Informe o evento.'),
    market: trimmed(200).min(1, 'Informe o mercado.'),
    odd: z.string().transform((value, ctx) => {
      const milli = parseOddToMilli(value);
      if (milli === null || milli <= 1000) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'A odd deve ser maior que 1,00.' });
        return z.NEVER;
      }
      return milli;
    }),
    stake: moneyField({ min: 1 }),
    status: z.enum(['OPEN', 'GREEN', 'RED', 'VOID', 'CASHOUT']),
    payout: optionalMoneyField,
    note: trimmed(1000).optional().transform((v) => (v && v !== '' ? v : null)),
    riskOverrideReason: trimmed(300).optional().transform((v) => (v && v !== '' ? v : null)),
    confirmRisk: checkboxField,
  })
  .superRefine((data, ctx) => {
    if (data.status === 'CASHOUT' && data.payout === null) {
      ctx.addIssue({
        path: ['payout'],
        code: z.ZodIssueCode.custom,
        message: 'Informe o retorno recebido no cashout.',
      });
    }
    if (data.payout !== null && data.payout < 0) {
      ctx.addIssue({ path: ['payout'], code: z.ZodIssueCode.custom, message: 'Retorno inválido.' });
    }
  });

export type EntryInput = z.infer<typeof entrySchema>;

// ---------------------------------------------------------------------------
// Movimentações
// ---------------------------------------------------------------------------
export const transactionSchema = z.object({
  kind: z.enum(['CONTRIBUTION', 'WITHDRAWAL']),
  amount: moneyField({ min: 1 }),
  occurredOn: isoDateField,
  memberId: z
    .string()
    .optional()
    .transform((value) => (value && value !== '' ? value : null))
    .refine((value) => value === null || z.string().uuid().safeParse(value).success, {
      message: 'Sócio inválido.',
    }),
  note: trimmed(1000).optional().transform((v) => (v && v !== '' ? v : null)),
});

// ---------------------------------------------------------------------------
// Sócios e usuários
// ---------------------------------------------------------------------------
export const memberSchema = z.object({
  displayName: trimmed(120).min(2, 'Informe o nome do sócio.'),
  share: percentField(0, 10_000),
  initialContribution: moneyField({ min: 0 }),
  canCreateEntries: checkboxField,
  isActive: checkboxField,
  joinedOn: isoDateField,
  userId: z
    .string()
    .optional()
    .transform((value) => (value && value !== '' ? value : null))
    .refine((value) => value === null || z.string().uuid().safeParse(value).success, {
      message: 'Usuário inválido.',
    }),
});

export const userSchema = z.object({
  name: trimmed(120).min(2, 'Informe o nome.'),
  email: z.string().trim().toLowerCase().email('Informe um e-mail válido.'),
  username: optionalUsernameField,
  role: z.enum(['ADMIN', 'PARTNER']),
  isActive: checkboxField,
});

/** Usuário novo nasce com a senha padrão e troca obrigatória no primeiro acesso. */
export const newUserSchema = userSchema;

export const resetPasswordSchema = z.object({
  userId: uuidField,
  newPassword: z
    .string()
    .min(8, 'A senha deve ter pelo menos 8 caracteres.')
    .max(200, 'Senha muito longa.'),
});

// ---------------------------------------------------------------------------
// Configurações
// ---------------------------------------------------------------------------
export const settingsSchema = z
  .object({
    bankrollName: trimmed(120).min(2, 'Informe o nome da banca.'),
    timezone: trimmed(60).min(1, 'Informe o fuso horário.'),
    initialBankroll: moneyField({ min: 0 }),
    monthlyGoal: moneyField({ min: 0 }),
    targetBankroll: moneyField({ min: 0 }),
    activeDays: z.coerce.number().int().min(1, 'Mínimo de 1 dia.').max(31, 'Máximo de 31 dias.'),
    dailyGoalMode: z.enum(['AUTO', 'MANUAL']),
    dailyGoal: moneyField({ min: 0 }),
    riskBase: z.enum(['CURRENT', 'MONTH_START', 'INITIAL']),
    maxRiskPerEntry: percentField(1, 10_000),
    maxStakeCap: optionalMoneyField,
    dailyStop: percentField(1, 10_000),
    weeklyStop: percentField(1, 10_000),
    monthlyStop: percentField(1, 10_000),
    stakeLimitPolicy: z.enum(['BLOCK', 'WARN']),
    stopLimitPolicy: z.enum(['BLOCK', 'WARN']),
    partnersCanCreateEntries: checkboxField,
  })
  .superRefine((data, ctx) => {
    if (data.maxStakeCap !== null && data.maxStakeCap <= 0) {
      ctx.addIssue({
        path: ['maxStakeCap'],
        code: z.ZodIssueCode.custom,
        message: 'O teto absoluto deve ser maior que zero (ou vazio para não usar).',
      });
    }
    if (data.weeklyStop < data.dailyStop) {
      ctx.addIssue({
        path: ['weeklyStop'],
        code: z.ZodIssueCode.custom,
        message: 'O stop semanal não deveria ser menor que o diário.',
      });
    }
    if (data.monthlyStop < data.weeklyStop) {
      ctx.addIssue({
        path: ['monthlyStop'],
        code: z.ZodIssueCode.custom,
        message: 'O stop mensal não deveria ser menor que o semanal.',
      });
    }
  });

export const monthlyGoalSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2200),
  month: z.coerce.number().int().min(1).max(12),
  goal: moneyField({ min: 0 }),
  activeDays: z.coerce.number().int().min(1).max(31),
  targetBankroll: moneyField({ min: 0 }),
});

export const periodSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2200),
  month: z.coerce.number().int().min(1).max(12),
});

/** Converte os erros do Zod no formato usado pelos formulários. */
export function fieldErrors(error: z.ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    const list = result[key] ?? [];
    list.push(issue.message);
    result[key] = list;
  }
  return result;
}

/** Lê um FormData em um objeto simples de strings. */
export function formToObject(formData: FormData): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') result[key] = value;
  }
  return result;
}
