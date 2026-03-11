/**
 * AI-2: Autonomous Document Triage Module
 * Entry point for document triage service
 * Built by Govli AI FOIA Build Guide v2/v3 - Phase 4b
 */

import express from 'express';
import { Pool } from 'pg';
import { createTriageRoutes } from './routes/triageRoutes';

const app = express();
const PORT = process.env.TRIAGE_PORT || 3011;

// Middleware
app.use(express.json());

// Database connection
const db = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'govli',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres'
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'foia-triage' });
});

// Mount triage routes
app.use('/ai/triage', createTriageRoutes(db));

// Start server
async function start() {
  try {
    // Test database connection
    await db.query('SELECT NOW()');
    console.log('[Triage] Database connected');

    app.listen(PORT, () => {
      console.log(`[Triage] AI-2 Triage service running on port ${PORT}`);
      console.log(`[Triage] Health: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error('[Triage] Failed to start:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[Triage] SIGTERM received, shutting down gracefully...');
  await db.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[Triage] SIGINT received, shutting down gracefully...');
  await db.end();
  process.exit(0);
});

// Only start if run directly (not when imported for testing)
if (require.main === module) {
  start();
}

export { app, db };
export { TriageService } from './services/triageService';
export * from './types';
export * from './events/eventHandlers';
