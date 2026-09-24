import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import { errorHandler, notFound } from './middleware/error';

import authRoutes from './modules/auth';
import productRoutes from './modules/products';
import inventoryRoutes from './modules/inventory';
import tableRoutes from './modules/tables';
import salesRoutes from './modules/sales';
import shiftRoutes from './modules/shifts';
import customerRoutes from './modules/customers';
import purchasingRoutes from './modules/purchasing';
import expenseRoutes from './modules/expenses';
import adminRoutes from './modules/admin';
import reportRoutes from './modules/reports';
import dashboardRoutes from './modules/dashboard';
import recommendationRoutes from './modules/recommendations';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.corsOrigin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  if (env.nodeEnv !== 'test') app.use(morgan('dev'));

  app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'pub-system', time: new Date().toISOString() }));

  app.use('/api/auth', authRoutes);
  app.use(
    '/api',
    productRoutes,
    inventoryRoutes,
    tableRoutes,
    salesRoutes,
    shiftRoutes,
    customerRoutes,
    purchasingRoutes,
    expenseRoutes,
    adminRoutes,
    reportRoutes,
    dashboardRoutes,
    recommendationRoutes,
  );

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
