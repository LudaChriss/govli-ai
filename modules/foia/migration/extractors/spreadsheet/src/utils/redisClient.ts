/**
 * Spreadsheet Import Engine - Redis Client
 */

import { createClient, RedisClientType } from 'redis';
import { ParsedSpreadsheetData, ConfirmedMapping } from '../types';

// Redis client (singleton)
let redisClient: RedisClientType | null = null;

/**
 * Get or create Redis client
 */
export async function getRedisClient(): Promise<RedisClientType> {
  if (redisClient && redisClient.isOpen) {
    return redisClient;
  }

  redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
  });

  redisClient.on('error', (err: Error) => {
    console.error('[Redis] Error:', err);
  });

  await redisClient.connect();

  return redisClient;
}

/**
 * Store parsed spreadsheet data in Redis (1 hour TTL)
 */
export async function storeSpreadsheetData(
  data: ParsedSpreadsheetData
): Promise<void> {
  const client = await getRedisClient();
  const key = `spreadsheet:${data.file_id}`;

  await client.setEx(
    key,
    3600, // 1 hour TTL
    JSON.stringify(data)
  );
}

/**
 * Retrieve parsed spreadsheet data from Redis
 */
export async function getSpreadsheetData(
  fileId: string
): Promise<ParsedSpreadsheetData | null> {
  const client = await getRedisClient();
  const key = `spreadsheet:${fileId}`;

  const data = await client.get(key);
  if (!data) return null;

  return JSON.parse(data);
}

/**
 * Store confirmed mapping in Redis (1 hour TTL)
 */
export async function storeConfirmedMapping(
  mapping: ConfirmedMapping
): Promise<void> {
  const client = await getRedisClient();
  const key = `mapping:${mapping.mapping_id}`;

  await client.setEx(
    key,
    3600, // 1 hour TTL
    JSON.stringify(mapping)
  );
}

/**
 * Retrieve confirmed mapping from Redis
 */
export async function getConfirmedMapping(
  mappingId: string
): Promise<ConfirmedMapping | null> {
  const client = await getRedisClient();
  const key = `mapping:${mappingId}`;

  const data = await client.get(key);
  if (!data) return null;

  return JSON.parse(data);
}

/**
 * Delete spreadsheet data from Redis
 */
export async function deleteSpreadsheetData(fileId: string): Promise<void> {
  const client = await getRedisClient();
  const key = `spreadsheet:${fileId}`;

  await client.del(key);
}

/**
 * Delete confirmed mapping from Redis
 */
export async function deleteConfirmedMapping(mappingId: string): Promise<void> {
  const client = await getRedisClient();
  const key = `mapping:${mappingId}`;

  await client.del(key);
}

/**
 * Close Redis connection
 */
export async function closeRedisClient(): Promise<void> {
  if (redisClient && redisClient.isOpen) {
    await redisClient.quit();
    redisClient = null;
  }
}
