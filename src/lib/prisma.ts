import { PrismaClient } from "@/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
import type { PoolConfig } from "pg";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// 어드민과 백엔드가 같은 Cloud SQL(f1-micro)을 공유하므로 인스턴스당 풀 상한을
// 명시해 커넥션 고갈을 막는다. @prisma/adapter-pg는 connection_limit URL 파라미터를
// 무시하므로(pg 기본 max=10) pg.PoolConfig의 max로 직접 통제해야 한다.
function buildPoolConfig(): PoolConfig {
  return {
    connectionString: process.env.DATABASE_URL!,
    max: parsePositiveInt(process.env.DATABASE_CONNECTION_LIMIT, 3),
    idleTimeoutMillis: parsePositiveInt(
      process.env.DATABASE_POOL_IDLE_TIMEOUT_MS,
      10_000,
    ),
    connectionTimeoutMillis: parsePositiveInt(
      process.env.DATABASE_POOL_CONN_TIMEOUT_MS,
      10_000,
    ),
  };
}

function createPrismaClient() {
  const adapter = new PrismaPg(buildPoolConfig());
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
