/**
 * FOIA Response Module
 * Entry point for response generation and delivery
 */

import express from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import { createResponseRoutes } from './routes/responseRoutes';
import { authMiddleware } from './middleware/authMiddleware';

const app = express();
const PORT = process.env.PORT || 3004;

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
  res.json({ status: 'ok', service: 'foia-response' });
});

// Mount response routes with auth
app.use('/response', authMiddleware, createResponseRoutes(db));

// Start server
async function start() {
  try {
    // Test database connection
    await db.query('SELECT NOW()');
    console.log('[Response] Database connected');

    app.listen(PORT, () => {
      console.log(`[Response] FOIA Response service running on port ${PORT}`);
      console.log(`[Response] Health: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error('[Response] Failed to start:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[Response] SIGTERM received, shutting down gracefully...');
  await db.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[Response] SIGINT received, shutting down gracefully...');
  await db.end();
  process.exit(0);
});

start();

export { app, db };
