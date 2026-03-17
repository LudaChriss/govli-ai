/**
 * FOIA Tracking Module
 * Entry point for tracking, workflow, and SLA monitoring
 */

import express from 'express';
import cors from 'cors';
import { Pool } from 'pg';
// @ts-ignore
import cron from 'node-cron';
import { createTrackingRoutes } from './routes/trackingRoutes';
import { authMiddleware } from './middleware/authMiddleware';
import { SLAService } from './services/slaService';

const app = express();
const PORT = process.env.PORT || 3003;

// Middleware
app.use(cors());
app.use(express.json());

// Database connection
const db = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'govli',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres'
});

// Health check (no auth required)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'foia-tracking' });
});

// Mount tracking routes with auth
app.use('/tracking', authMiddleware, createTrackingRoutes(db));

// Background SLA monitoring cron job
// Runs every hour to check SLA thresholds and emit warnings
const slaService = new SLAService(db);

cron.schedule('0 * * * *', async () => {
  console.log('[Cron] Running hourly SLA threshold check...');

  try {
    // Get all tenants with active requests
    const result = await db.query(`
      SELECT DISTINCT tenant_id
      FROM foia_requests
      WHERE status NOT IN ('COMPLETED', 'DENIED')
    `);

    const tenants = result.rows;
    console.log(`[Cron] Checking SLA for ${tenants.length} tenants...`);

    for (const { tenant_id } of tenants) {
      try {
        await slaService.checkSLAThresholds(tenant_id);
        console.log(`[Cron] ✓ SLA check completed for tenant ${tenant_id}`);
      } catch (error) {
        console.error(`[Cron] ✗ SLA check failed for tenant ${tenant_id}:`, error);
      }
    }

    console.log('[Cron] Hourly SLA threshold check completed');
  } catch (error) {
    console.error('[Cron] Failed to run SLA threshold check:', error);
  }
});

// Start server
async function start() {
  try {
    // Test database connection
    await db.query('SELECT NOW()');
    console.log('[Tracking] Database connected');

    app.listen(PORT, () => {
      console.log(`[Tracking] FOIA Tracking service running on port ${PORT}`);
      console.log(`[Tracking] Health: http://localhost:${PORT}/health`);
      console.log(`[Tracking] SLA cron job scheduled (hourly)`);
    });
  } catch (error) {
    console.error('[Tracking] Failed to start:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[Tracking] SIGTERM received, shutting down gracefully...');
  await db.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[Tracking] SIGINT received, shutting down gracefully...');
  await db.end();
  process.exit(0);
});

start();

export { app, db };
