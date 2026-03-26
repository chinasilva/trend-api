// Prisma 7 配置文件
// 数据库连接 URL 在这里配置，不再在 schema.prisma 中
import dotenv from 'dotenv';
// 加载 .env.local (Vercel 约定)
dotenv.config({ path: '.env.local' });
// 也加载 .env 作为后备
dotenv.config();
import { defineConfig } from 'prisma/config';
import path from 'path';

function resolveDatabaseUrl() {
  const rawConnectionString =
    process.env.TREND_API_POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.TREND_API_POSTGRES_URL ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL;

  if (!rawConnectionString) {
    throw new Error(
      'Database URL is not configured. Set TREND_API_POSTGRES_URL_NON_POOLING, POSTGRES_URL_NON_POOLING, TREND_API_POSTGRES_URL, POSTGRES_URL, or DATABASE_URL.'
    );
  }

  const url = new URL(rawConnectionString);

  if (!url.searchParams.has('sslmode')) {
    url.searchParams.set('sslmode', 'require');
  }
  if (!url.searchParams.has('uselibpqcompat')) {
    url.searchParams.set('uselibpqcompat', 'true');
  }
  if (!url.searchParams.has('preparedStatements')) {
    url.searchParams.set('preparedStatements', 'false');
  }

  return url.toString();
}

export default defineConfig({
  schema: path.join(__dirname, 'prisma/schema.prisma'),
  migrations: {
    path: path.join(__dirname, 'prisma/migrations'),
  },
  datasource: {
    // Prisma CLI 优先使用 non-pooling 直连，避免 migrate/status 走 pgbouncer。
    url: resolveDatabaseUrl(),
  },
});
