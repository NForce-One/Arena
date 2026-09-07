import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

export const prisma = new PrismaClient({ adapter });

export async function dbPing(): Promise<number> {
  const start = performance.now();
  await prisma.$queryRaw`SELECT 1`;
  return Math.round(performance.now() - start);
}
