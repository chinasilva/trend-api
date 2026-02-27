// Prisma 7 配置文件
// 数据库连接 URL 在这里配置，不再在 schema.prisma 中
import "dotenv/config";
import { defineConfig } from "prisma/config";
import path from "path";

export default defineConfig({
  schema: path.join(__dirname, "prisma/schema.prisma"),
  migrations: {
    path: path.join(__dirname, "prisma/migrations"),
  },
  datasource: {
    // 从环境变量读取数据库连接字符串
    url: process.env.DATABASE_URL!,
  },
});
