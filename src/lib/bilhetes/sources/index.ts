/**
 * Registro das fontes. Cada uma é isolada: se o parser de uma quebrar, as
 * outras seguem. Para adicionar uma fonte, crie o arquivo e liste aqui.
 */

import type { SlipSource } from '../domain/types';
import { aposta10Source } from './aposta10';
import { apostasePalpitesSource } from './apostasepalpites';
import { apwinSource } from './apwin';
import { mightyTipsSource } from './mightytips';
import { predictlixSource } from './predictlix';

export const SLIP_SOURCES: readonly SlipSource[] = [
  apostasePalpitesSource,
  aposta10Source,
  predictlixSource,
  mightyTipsSource,
  apwinSource,
];

export function findSlipSource(slug: string): SlipSource | null {
  return SLIP_SOURCES.find((source) => source.slug === slug) ?? null;
}
