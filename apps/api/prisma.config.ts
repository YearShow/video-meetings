import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Prisma 7 не читает .env сам: подгружаем так же, как AppModule
// (apps/api/.env, затем корневой .env). Уже заданные переменные не перезаписываются.
for (const file of ['.env', '../../.env']) {
  if (existsSync(file)) process.loadEnvFile(file);
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL },
});
