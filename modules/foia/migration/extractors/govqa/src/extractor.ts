/**
 * GovQA Data Extractor
 * Streams all data from GovQA to local JSONL files
 */

import * as fs from 'fs';
import * as path from 'path';
import * as cliProgress from 'cli-progress';
import { GovQAClient } from './govqaClient';
import {
  MigrationConfig,
  ExtractionCheckpoint,
  ExtractionSummary,
  GovQAContact,
  GovQACase,
  GovQADocument,
  GovQACommunication,
  GovQAFee,
  GovQARoutingRule
} from './types';

export class GovQAExtractor {
  private client: GovQAClient;
  private config: MigrationConfig;
  private checkpointFile: string;

  constructor(config: MigrationConfig) {
    this.config = config;
    this.client = new GovQAClient(config.govqa);
    this.checkpointFile = path.join(config.output_dir, '.extraction_checkpoint.json');

    // Ensure output directory exists
    if (!fs.existsSync(config.output_dir)) {
      fs.mkdirSync(config.output_dir, { recursive: true });
    }
  }

  /**
   * Get extraction checkpoint for resuming
   */
  private getCheckpoint(entityType: string): ExtractionCheckpoint | null {
    if (!this.config.resume_from_checkpoint) {
      return null;
    }

    try {
      if (fs.existsSync(this.checkpointFile)) {
        const checkpoints = JSON.parse(fs.readFileSync(this.checkpointFile, 'utf-8'));
        return checkpoints[entityType] || null;
      }
    } catch (error) {
      console.warn('Failed to read checkpoint file:', error);
    }

    return null;
  }

  /**
   * Save extraction checkpoint
   */
  private saveCheckpoint(checkpoint: ExtractionCheckpoint): void {
    try {
      let checkpoints: Record<string, ExtractionCheckpoint> = {};

      if (fs.existsSync(this.checkpointFile)) {
        checkpoints = JSON.parse(fs.readFileSync(this.checkpointFile, 'utf-8'));
      }

      checkpoints[checkpoint.entity_type] = checkpoint;

      fs.writeFileSync(this.checkpointFile, JSON.stringify(checkpoints, null, 2));
    } catch (error) {
      console.error('Failed to save checkpoint:', error);
    }
  }

  /**
   * Extract data and stream to JSONL file
   */
  private async extractToFile<T>(
    entityType: string,
    filename: string,
    fetchFunction: (startPage: number) => AsyncGenerator<T[], void, unknown>,
    totalCount: number
  ): Promise<ExtractionSummary> {
    const startTime = Date.now();
    const outputPath = path.join(this.config.output_dir, filename);

    // Get checkpoint if resuming
    const checkpoint = this.getCheckpoint(entityType);
    const startPage = checkpoint ? checkpoint.last_page + 1 : 1;
    let extractedCount = checkpoint ? checkpoint.total_extracted : 0;
    let failedCount = 0;

    // Create write stream (append if resuming)
    const writeStream = fs.createWriteStream(outputPath, {
      flags: checkpoint ? 'a' : 'w'
    });

    // Create progress bar
    const progressBar = new cliProgress.SingleBar({
      format: `${entityType} | {bar} | {percentage}% | {value}/{total} | ETA: {eta}s`,
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true
    });

    progressBar.start(totalCount, extractedCount);

    try {
      let currentPage = startPage;

      for await (const batch of fetchFunction.call(this.client, startPage)) {
        for (const item of batch) {
          try {
            writeStream.write(JSON.stringify(item) + '\n');
            extractedCount++;
            progressBar.update(extractedCount);
          } catch (error) {
            console.error(`Failed to write ${entityType} item:`, error);
            failedCount++;
          }
        }

        // Save checkpoint after each page
        this.saveCheckpoint({
          entity_type: entityType,
          last_page: currentPage,
          last_id: (batch[batch.length - 1] as any)?.id || '',
          total_extracted: extractedCount,
          timestamp: new Date().toISOString()
        });

        currentPage++;
      }
    } catch (error) {
      console.error(`\nError extracting ${entityType}:`, error);
      failedCount++;
    } finally {
      progressBar.stop();
      writeStream.end();
    }

    const endTime = Date.now();

    return {
      entity_type: entityType,
      total_count: totalCount,
      extracted_count: extractedCount,
      failed_count: failedCount,
      start_time: new Date(startTime).toISOString(),
      end_time: new Date(endTime).toISOString(),
      duration_ms: endTime - startTime
    };
  }

  /**
   * Extract all contacts
   */
  async extractContacts(totalCount: number): Promise<ExtractionSummary> {
    console.log('\n📇 Extracting Contacts...');
    return this.extractToFile<GovQAContact>(
      'contacts',
      'govqa_contacts.jsonl',
      (startPage: number) => this.client.fetchContacts(startPage),
      totalCount
    );
  }

  /**
   * Extract all cases
   */
  async extractCases(totalCount: number): Promise<ExtractionSummary> {
    console.log('\n📋 Extracting Cases...');
    return this.extractToFile<GovQACase>(
      'cases',
      'govqa_cases.jsonl',
      (startPage: number) => this.client.fetchCases(startPage),
      totalCount
    );
  }

  /**
   * Extract all documents
   */
  async extractDocuments(totalCount: number): Promise<ExtractionSummary> {
    console.log('\n📄 Extracting Documents...');
    return this.extractToFile<GovQADocument>(
      'documents',
      'govqa_documents.jsonl',
      (startPage: number) => this.client.fetchDocuments(startPage),
      totalCount
    );
  }

  /**
   * Extract all communications
   */
  async extractCommunications(totalCount: number): Promise<ExtractionSummary> {
    console.log('\n💬 Extracting Communications...');
    return this.extractToFile<GovQACommunication>(
      'communications',
      'govqa_communications.jsonl',
      (startPage: number) => this.client.fetchCommunications(startPage),
      totalCount
    );
  }

  /**
   * Extract all fees
   */
  async extractFees(totalCount: number): Promise<ExtractionSummary> {
    console.log('\n💰 Extracting Fees...');
    return this.extractToFile<GovQAFee>(
      'fees',
      'govqa_fees.jsonl',
      (startPage: number) => this.client.fetchFees(startPage),
      totalCount
    );
  }

  /**
   * Extract all routing rules
   */
  async extractRoutingRules(totalCount: number): Promise<ExtractionSummary> {
    console.log('\n🔀 Extracting Routing Rules...');
    return this.extractToFile<GovQARoutingRule>(
      'routing_rules',
      'govqa_routing_rules.jsonl',
      (startPage: number) => this.client.fetchRoutingRules(startPage),
      totalCount
    );
  }

  /**
   * Extract all data in order
   */
  async extractAll(inventory: Record<string, number>): Promise<ExtractionSummary[]> {
    const summaries: ExtractionSummary[] = [];

    // Extract in order: contacts first (needed for requester mapping)
    summaries.push(await this.extractContacts(inventory.contacts));
    summaries.push(await this.extractCases(inventory.cases));
    summaries.push(await this.extractDocuments(inventory.documents));
    summaries.push(await this.extractCommunications(inventory.communications));
    summaries.push(await this.extractFees(inventory.fees));
    summaries.push(await this.extractRoutingRules(inventory.routing_rules));

    // Save summary
    const summaryPath = path.join(this.config.output_dir, 'extraction_summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify(summaries, null, 2));

    return summaries;
  }
}