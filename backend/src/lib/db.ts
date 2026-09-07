import type { Prisma, PrismaClient } from '@prisma/client';

export type DbClient = PrismaClient | Prisma.TransactionClient;

export interface TxRunner {
  run<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    opts?: { isolationLevel?: Prisma.TransactionIsolationLevel },
  ): Promise<T>;
}

export function makeTxRunner(client: PrismaClient): TxRunner {
  return { run: (fn, opts) => client.$transaction(fn, opts) };
}
