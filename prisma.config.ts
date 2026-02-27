// Prisma 7 配置文件
// 数据库连接 URL 在这里配置，不再在 schema.prisma 中
import dotenv from "dotenv";
// 加载 .env.local (Vercel 约定)
dotenv.config({ path: ".env.local" });
// 也加载 .env 作为后备
dotenv.config();
import { defineConfig } from "prisma/config";
import path from "path";

export default defineConfig({
  schema: path.join(__dirname, "prisma/schema.prisma"),
  migrations: {
    path: path.join(__dirname, "prisma/migrations"),
  },
  datasource: {
    // Vercel Supabase 使用 Session Pooler (端口 6543)，比直连更稳定
    url: process.env.TREND_API_POSTGRES_URL || process.env.POSTGRES_URL!,
  },
});
