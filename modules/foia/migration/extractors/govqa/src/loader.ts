/**
 * GovQA Data Loader
 * Loads transformed data into Govli via Migration API
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import axios, { AxiosInstance } from 'axios';
import * as cliProgress from 'cli-progress';
import { MigrationConfig, LoadingResult } from './types';

export class GovliLoader {
  private config: MigrationConfig;
  private client: AxiosInstance;

  constructor(config: MigrationConfig) {
    this.config = config;

    this.client = axios.create({
      baseURL: config.govli.govli_api_url,
      timeout: 60000,
      headers: {
        'Content-Type': 'application/json',
        'X-Migration-Key': config.govli.govli_migration_key
      }
    });
  }

  /**
   * Read JSONL file into batches
   */
  private async *readBatches<T>(filePath: string, batchSize: number): AsyncGenerator<T[], void, unknown> {
    if (!fs.existsSync(filePath)) {
      console.warn(`File not found: ${filePath}`);
      return;
    }

    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let batch: T[] = [];

    for await (const line of rl) {
      if (line.trim()) {
        try {
          const item: T = JSON.parse(line);
          batch.push(item);

          if (batch.length >= batchSize) {
            yield batch;
            batch = [];
          }
        } catch (error) {
          console.error('Failed to parse line:', error);
        }
      }
    }

    // Yield remaining items
    if (batch.length > 0) {
      yield batch;
    }
  }

  /**
   * Load data in batches to API endpoint
   */
  private async loadBatches<T>(
    entityType: string,
    filename: string,
    endpoint: string,
    totalCount: number
  ): Promise<LoadingResult[]> {
    const filePath = path.join(this.config.output_dir, filename);
    const results: LoadingResult[] = [];

    if (!fs.existsSync(filePath)) {
      console.warn(`File not found: ${filename}, skipping`);
      return results;
    }

    let batchNumber = 0;
    let loadedCount = 0;

    const progressBar = new cliProgress.SingleBar({
      format: `${entityType} | {bar} | {percentage}% | {value}/{total} | ETA: {eta}s`,
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true
    });

    progressBar.start(totalCount, 0);

    try {
      for await (const batch of this.readBatches<T>(filePath, this.config.batch_size)) {
        batchNumber++;

        try {
          const response = await this.client.post(endpoint, {
            tenant_id: this.config.govli.tenant_id,
            items: batch
          });

          const successful = response.data.successful || batch.length;
          const failed = response.data.failed || 0;
          const errors = response.data.errors || [];

          results.push({
            entity_type: entityType,
            batch_number: batchNumber,
            total_in_batch: batch.length,
            successful,
            failed,
            errors
          });

          loadedCount += successful;
          progressBar.update(loadedCount);

          if (failed > 0) {
            console.warn(`\nBatch ${batchNumber}: ${failed}/${batch.length} failed`);
            errors.forEach((err: any) => {
              console.error(`  - ${err.source_id}: ${err.error}`);
            });
          }
        } catch (error) {
          console.error(`\nFailed to load batch ${batchNumber}:`, error);

          results.push({
            entity_type: entityType,
            batch_number: batchNumber,
            total_in_batch: batch.length,
            successful: 0,
            failed: batch.length,
            errors: [{
              source_id: 'batch',
              error: error instanceof Error ? error.message : 'Unknown error'
            }]
          });
        }
      }
    } finally {
      progressBar.stop();
    }

    return results;
  }

  /**
   * Load contacts
   */
  async loadContacts(totalCount: number): Promise<LoadingResult[]> {
    console.log('\n📇 Loading Contacts...');
    return this.loadBatches(
      'contacts',
      'govli_contacts.jsonl',
      '/api/v1/foia/migration/contacts/bulk',
      totalCount
    );
  }

  /**
   * Load requests
   */
  async loadRequests(totalCount: number): Promise<LoadingResult[]> {
    console.log('\n📋 Loading Requests...');
    return this.loadBatches(
      'requests',
      'govli_requests.jsonl',
      '/api/v1/foia/migration/requests/bulk',
      totalCount
    );
  }

  /**
   * Load documents
   */
  async loadDocuments(totalCount: number): Promise<LoadingResult[]> {
    console.log('\n📄 Loading Documents...');
    return this.loadBatches(
      'documents',
      'govli_documents.jsonl',
      '/api/v1/foia/migration/documents/bulk',
      totalCount
    );
  }

  /**
   * Load communications
   */
  async loadCommunications(totalCount: number): Promise<LoadingResult[]> {
    console.log('\n💬 Loading Communications...');
    return this.loadBatches(
      'communications',
      'govli_communications.jsonl',
      '/api/v1/foia/migration/communications/bulk',
      totalCount
    );
  }

  /**
   * Load fees
   */
  async loadFees(totalCount: number): Promise<LoadingResult[]> {
    console.log('\n💰 Loading Fees...');
    return this.loadBatches(
      'fees',
      'govli_fees.jsonl',
      '/api/v1/foia/migration/fees/bulk',
      totalCount
    );
  }

  /**
   * Load all transformed data
   */
  async loadAll(counts: {
    contacts: number;
    requests: number;
    documents: number;
    communications: number;
    fees: number;
  }): Promise<LoadingResult[]> {
    const allResults: LoadingResult[] = [];

    // Load in order: contacts first, then requests, then related entities
    const contactResults = await this.loadContacts(counts.contacts);
    allResults.push(...contactResults);

    const requestResults = await this.loadRequests(counts.requests);
    allResults.push(...requestResults);

    const documentResults = await this.loadDocuments(counts.documents);
    allResults.push(...documentResults);

    const commResults = await this.loadCommunications(counts.communications);
    allResults.push(...commResults);

    const feeResults = await this.loadFees(counts.fees);
    allResults.push(...feeResults);

    // Save loading summary
    const summaryPath = path.join(this.config.output_dir, 'loading_summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify(allResults, null, 2));

    return allResults;
  }

  /**
   * Request final validation report from Migration API
   */
  async requestValidationReport(): Promise<any> {
    try {
      const response = await this.client.post('/api/v1/foia/migration/validate', {
        tenant_id: this.config.govli.tenant_id,
        migration_source: 'govqa'
      });

      return response.data;
    } catch (error) {
      console.error('Failed to request validation report:', error);
      throw error;
    }
  }
}