/* eslint-disable no-console */
/**
 * Mini-runner compartilhado pelas suítes (run.ts e sports.ts).
 * Sem framework externo — apenas node:assert.
 */
export type TestFn = () => void | Promise<void>;

const tests: { name: string; fn: TestFn }[] = [];
let currentGroup = '';

export function group(name: string): void {
  currentGroup = name;
}

export function test(name: string, fn: TestFn): void {
  tests.push({ name: `${currentGroup} › ${name}`, fn });
}

export async function run(): Promise<void> {
  let passed = 0;
  const failures: { name: string; error: unknown }[] = [];

  for (const item of tests) {
    try {
      await item.fn();
      passed += 1;
      console.log(`  ✓ ${item.name}`);
    } catch (error) {
      failures.push({ name: item.name, error });
      console.log(`  ✗ ${item.name}`);
    }
  }

  console.log(`\n${passed}/${tests.length} testes passaram.`);

  if (failures.length > 0) {
    console.log('\nFalhas:');
    for (const failure of failures) {
      console.log(`\n— ${failure.name}`);
      console.log(failure.error instanceof Error ? failure.error.message : String(failure.error));
    }
    process.exit(1);
  }
}
