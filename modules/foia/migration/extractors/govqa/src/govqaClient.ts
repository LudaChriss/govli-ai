/**
 * GovQA API Client with Pagination Handling
 */

import axios, { AxiosInstance } from 'axios';
import { GovQAConfig } from './types';

export class GovQAClient {
  private client: AxiosInstance;
  private config: GovQAConfig;

  constructor(config: GovQAConfig) {
    this.config = config;

    this.client = axios.create({
      baseURL: config.govqa_api_url,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        ...(config.govqa_api_key && { 'X-API-Key': config.govqa_api_key })
      }
    });

    // Add auth interceptor
    this.client.interceptors.request.use((config) => {
      if (this.config.govqa_username && this.config.govqa_password) {
        const auth = Buffer.from(
          `${this.config.govqa_username}:${this.config.govqa_password}`
        ).toString('base64');
        config.headers.Authorization = `Basic ${auth}`;
      }
      return config;
    });
  }

  /**
   * Test API connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.client.get('/api/v1/ping');
      return response.status === 200;
    } catch (error) {
      console.error('GovQA connection test failed:', error);
      return false;
    }
  }

  /**
   * Get total count of entities
   */
  async getCount(endpoint: string): Promise<number> {
    try {
      const response = await this.client.get(`${endpoint}/count`);
      return response.data.count || response.data.total || 0;
    } catch (error) {
      console.error(`Failed to get count for ${endpoint}:`, error);
      return 0;
    }
  }

  /**
   * Fetch paginated data
   */
  async *fetchPaginated<T>(
    endpoint: string,
    pageSize: number = 100,
    startPage: number = 1
  ): AsyncGenerator<T[], void, unknown> {
    let currentPage = startPage;
    let hasMore = true;

    while (hasMore) {
      try {
        const response = await this.client.get(endpoint, {
          params: {
            page: currentPage,
            per_page: pageSize,
            limit: pageSize,
            offset: (currentPage - 1) * pageSize
          }
        });

        const data = response.data.data || response.data.results || response.data;

        if (!Array.isArray(data)) {
          throw new Error(`Expected array response from ${endpoint}, got ${typeof data}`);
        }

        if (data.length === 0) {
          hasMore = false;
        } else {
          yield data as T[];
          currentPage++;

          // Check if we've reached the end
          const total = response.data.total || response.data.pagination?.total;
          if (total && currentPage * pageSize >= total) {
            hasMore = false;
          }
        }
      } catch (error) {
        console.error(`Error fetching page ${currentPage} from ${endpoint}:`, error);
        throw error;
      }
    }
  }

  /**
   * Fetch all contacts (users)
   */
  async *fetchContacts(startPage: number = 1): AsyncGenerator<any[], void, unknown> {
    yield* this.fetchPaginated('/api/v1/contacts', 100, startPage);
  }

  /**
   * Fetch all cases (requests)
   */
  async *fetchCases(startPage: number = 1): AsyncGenerator<any[], void, unknown> {
    yield* this.fetchPaginated('/api/v1/cases', 100, startPage);
  }

  /**
   * Fetch all documents
   */
  async *fetchDocuments(startPage: number = 1): AsyncGenerator<any[], void, unknown> {
    yield* this.fetchPaginated('/api/v1/documents', 100, startPage);
  }

  /**
   * Fetch all communications
   */
  async *fetchCommunications(startPage: number = 1): AsyncGenerator<any[], void, unknown> {
    yield* this.fetchPaginated('/api/v1/communications', 100, startPage);
  }

  /**
   * Fetch all fees
   */
  async *fetchFees(startPage: number = 1): AsyncGenerator<any[], void, unknown> {
    yield* this.fetchPaginated('/api/v1/fees', 100, startPage);
  }

  /**
   * Fetch all routing rules
   */
  async *fetchRoutingRules(startPage: number = 1): AsyncGenerator<any[], void, unknown> {
    yield* this.fetchPaginated('/api/v1/routing_rules', 100, startPage);
  }

  /**
   * Download document file
   */
  async downloadDocument(documentId: string | number, downloadUrl: string): Promise<Buffer> {
    try {
      const response = await this.client.get(downloadUrl, {
        responseType: 'arraybuffer'
      });
      return Buffer.from(response.data);
    } catch (error) {
      console.error(`Failed to download document ${documentId}:`, error);
      throw error;
    }
  }

  /**
   * Get inventory (count all entities)
   */
  async getInventory(): Promise<Record<string, number>> {
    const inventory: Record<string, number> = {};

    inventory.contacts = await this.getCount('/api/v1/contacts');
    inventory.cases = await this.getCount('/api/v1/cases');
    inventory.documents = await this.getCount('/api/v1/documents');
    inventory.communications = await this.getCount('/api/v1/communications');
    inventory.fees = await this.getCount('/api/v1/fees');
    inventory.routing_rules = await this.getCount('/api/v1/routing_rules');

    return inventory;
  }
}
