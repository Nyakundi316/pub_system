import dotenv from 'dotenv';

dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  databaseUrl: required('DATABASE_URL', 'postgresql://pub:pub@localhost:5432/pub_system?schema=public'),
  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET', 'dev-access-secret'),
    refreshSecret: required('JWT_REFRESH_SECRET', 'dev-refresh-secret'),
    accessTtl: process.env.ACCESS_TOKEN_TTL ?? '15m',
    refreshTtl: process.env.REFRESH_TOKEN_TTL ?? '7d',
  },
  business: {
    defaultTaxRate: Number(process.env.DEFAULT_TAX_RATE ?? 0.16),
    loyaltyPointsPerUnit: Number(process.env.LOYALTY_POINTS_PER_UNIT ?? 1),
    safetyStockDays: Number(process.env.SAFETY_STOCK_DAYS ?? 3),
  },
};

export const isProd = env.nodeEnv === 'production';
