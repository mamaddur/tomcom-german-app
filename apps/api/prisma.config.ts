// Prisma 7 configuration. Prisma no longer reads .env files itself.
import { defineConfig } from 'prisma/config';

try {
  process.loadEnvFile('.env.local');
} catch {
  // No .env.local (CI, containers): DATABASE_URL comes from the environment.
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // `generate` needs no database, so a missing URL is only an error for migrate commands.
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
