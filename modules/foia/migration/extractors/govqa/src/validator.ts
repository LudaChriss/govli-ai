/**
 * GovQA Migration Validator
 * Validates migration and generates HTML report
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { MigrationConfig, ValidationReport, ExtractionSummary } from './types';

export class MigrationValidator {
  private config: MigrationConfig;

  constructor(config: MigrationConfig) {
    this.config = config;
  }

  /**
   * Count lines in JSONL file
   */
  private async countLines(filename: string): Promise<number> {
    const filePath = path.join(this.config.output_dir, filename);

    if (!fs.existsSync(filePath)) {
      return 0;
    }

    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let count = 0;
    for await (const line of rl) {
      if (line.trim()) {
        count++;
      }
    }

    return count;
  }

  /**
   * Get random sample of IDs from file
   */
  private async getRandomSample(filename: string, sampleSize: number): Promise<any[]> {
    const filePath = path.join(this.config.output_dir, filename);

    if (!fs.existsSync(filePath)) {
      return [];
    }

    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    const allItems: any[] = [];
    for await (const line of rl) {
      if (line.trim()) {
        allItems.push(JSON.parse(line));
      }
    }

    // Shuffle and take sample
    const shuffled = allItems.sort(() => 0.5 - Math.random());
    return shuffled.slice(0, Math.min(sampleSize, allItems.length));
  }

  /**
   * Validate migration
   */
  async validate(extractionSummaries: ExtractionSummary[]): Promise<ValidationReport> {
    console.log('\n🔍 Validating migration...\n');

    // Count source vs target entities
    const sourceCounts = {
      contacts: extractionSummaries.find(s => s.entity_type === 'contacts')?.extracted_count || 0,
      cases: extractionSummaries.find(s => s.entity_type === 'cases')?.extracted_count || 0,
      documents: extractionSummaries.find(s => s.entity_type === 'documents')?.extracted_count || 0,
      communications: extractionSummaries.find(s => s.entity_type === 'communications')?.extracted_count || 0,
      fees: extractionSummaries.find(s => s.entity_type === 'fees')?.extracted_count || 0
    };

    const targetCounts = {
      contacts: await this.countLines('govli_contacts.jsonl'),
      cases: await this.countLines('govli_requests.jsonl'),
      documents: await this.countLines('govli_documents.jsonl'),
      communications: await this.countLines('govli_communications.jsonl'),
      fees: await this.countLines('govli_fees.jsonl')
    };

    const entityCounts = {
      contacts: {
        source: sourceCounts.contacts,
        target: targetCounts.contacts,
        match: sourceCounts.contacts === targetCounts.contacts
      },
      cases: {
        source: sourceCounts.cases,
        target: targetCounts.cases,
        match: sourceCounts.cases === targetCounts.cases
      },
      documents: {
        source: sourceCounts.documents,
        target: targetCounts.documents,
        match: sourceCounts.documents === targetCounts.documents
      },
      communications: {
        source: sourceCounts.communications,
        target: targetCounts.communications,
        match: sourceCounts.communications === targetCounts.communications
      },
      fees: {
        source: sourceCounts.fees,
        target: targetCounts.fees,
        match: sourceCounts.fees === targetCounts.fees
      }
    };

    // Spot check 10 random records
    const caseSample = await this.getRandomSample('govqa_cases.jsonl', 10);
    const transformedCaseSample = await this.getRandomSample('govli_requests.jsonl', 10);

    const spotCheckResults = caseSample.slice(0, 5).map((sourceCase, idx) => {
      const transformed = transformedCaseSample[idx];

      return {
        entity_type: 'case',
        source_id: sourceCase.id,
        target_id: transformed?.legacy_id || 'NOT_FOUND',
        field_comparisons: {
          case_number: {
            source_value: sourceCase.case_number,
            target_value: transformed?.tracking_number,
            match: sourceCase.case_number === transformed?.tracking_number
          },
          requester_email: {
            source_value: sourceCase.requester_email,
            target_value: transformed?.requester?.email,
            match: sourceCase.requester_email === transformed?.requester?.email
          },
          description: {
            source_value: sourceCase.description?.substring(0, 50),
            target_value: transformed?.description?.substring(0, 50),
            match: sourceCase.description === transformed?.description
          }
        }
      };
    });

    // Check for orphaned documents
    const orphanedDocuments: string[] = [];
    const documentSample = await this.getRandomSample('govqa_documents.jsonl', 50);
    const caseLegacyIds = new Set(transformedCaseSample.map(c => c.legacy_id));

    for (const doc of documentSample) {
      if (!caseLegacyIds.has(String(doc.case_id))) {
        orphanedDocuments.push(`Document ${doc.id} references non-existent case ${doc.case_id}`);
      }
    }

    // Collect errors and warnings
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!entityCounts.contacts.match) {
      errors.push(`Contact count mismatch: ${entityCounts.contacts.source} source vs ${entityCounts.contacts.target} target`);
    }

    if (!entityCounts.cases.match) {
      errors.push(`Case count mismatch: ${entityCounts.cases.source} source vs ${entityCounts.cases.target} target`);
    }

    if (orphanedDocuments.length > 0) {
      warnings.push(`Found ${orphanedDocuments.length} potentially orphaned documents`);
    }

    const overall_status = errors.length > 0 ? 'FAIL' : warnings.length > 0 ? 'WARNING' : 'PASS';

    const report: ValidationReport = {
      migration_id: `govqa-migration-${Date.now()}`,
      source_system: 'GovQA',
      target_system: 'Govli',
      migration_date: new Date().toISOString(),
      entity_counts: entityCounts,
      spot_check_results: spotCheckResults,
      orphaned_documents: orphanedDocuments,
      errors,
      warnings,
      overall_status
    };

    console.log(`\n✅ Validation complete: ${overall_status}`);

    return report;
  }

  /**
   * Generate HTML report
   */
  generateHTMLReport(report: ValidationReport): string {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GovQA Migration Report</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      background: #f5f5f5;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      border-radius: 8px;
      margin-bottom: 20px;
    }
    .header h1 { margin: 0; }
    .header p { margin: 10px 0 0; opacity: 0.9; }
    .status {
      display: inline-block;
      padding: 6px 12px;
      border-radius: 4px;
      font-weight: bold;
      margin-top: 10px;
    }
    .status.PASS { background: #10b981; color: white; }
    .status.WARNING { background: #f59e0b; color: white; }
    .status.FAIL { background: #ef4444; color: white; }
    .card {
      background: white;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .card h2 {
      margin-top: 0;
      color: #1f2937;
      border-bottom: 2px solid #e5e7eb;
      padding-bottom: 10px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
    }
    th, td {
      text-align: left;
      padding: 12px;
      border-bottom: 1px solid #e5e7eb;
    }
    th {
      background: #f9fafb;
      font-weight: 600;
      color: #374151;
    }
    .match { color: #10b981; font-weight: bold; }
    .no-match { color: #ef4444; font-weight: bold; }
    .error { background: #fef2f2; color: #991b1b; padding: 10px; border-left: 4px solid #ef4444; margin: 10px 0; }
    .warning { background: #fffbeb; color: #92400e; padding: 10px; border-left: 4px solid #f59e0b; margin: 10px 0; }
  </style>
</head>
<body>
  <div class="header">
    <h1>GovQA Migration Report</h1>
    <p>Migration ID: ${report.migration_id}</p>
    <p>Migration Date: ${new Date(report.migration_date).toLocaleString()}</p>
    <div class="status ${report.overall_status}">${report.overall_status}</div>
  </div>

  <div class="card">
    <h2>📊 Entity Count Comparison</h2>
    <table>
      <thead>
        <tr>
          <th>Entity Type</th>
          <th>Source (GovQA)</th>
          <th>Target (Govli)</th>
          <th>Match</th>
        </tr>
      </thead>
      <tbody>
        ${Object.entries(report.entity_counts).map(([type, counts]) => `
          <tr>
            <td>${type.charAt(0).toUpperCase() + type.slice(1)}</td>
            <td>${counts.source.toLocaleString()}</td>
            <td>${counts.target.toLocaleString()}</td>
            <td class="${counts.match ? 'match' : 'no-match'}">${counts.match ? '✓ Match' : '✗ Mismatch'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>

  <div class="card">
    <h2>🔍 Spot Check Results</h2>
    ${report.spot_check_results.map(check => `
      <div style="margin-bottom: 20px; padding: 15px; background: #f9fafb; border-radius: 6px;">
        <strong>Source ID:</strong> ${check.source_id} → <strong>Target ID:</strong> ${check.target_id}
        <table style="margin-top: 10px;">
          <thead>
            <tr>
              <th>Field</th>
              <th>Source Value</th>
              <th>Target Value</th>
              <th>Match</th>
            </tr>
          </thead>
          <tbody>
            ${Object.entries(check.field_comparisons).map(([field, comparison]) => `
              <tr>
                <td>${field}</td>
                <td>${comparison.source_value || 'N/A'}</td>
                <td>${comparison.target_value || 'N/A'}</td>
                <td class="${comparison.match ? 'match' : 'no-match'}">${comparison.match ? '✓' : '✗'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `).join('')}
  </div>

  ${report.errors.length > 0 ? `
    <div class="card">
      <h2>❌ Errors</h2>
      ${report.errors.map(error => `<div class="error">${error}</div>`).join('')}
    </div>
  ` : ''}

  ${report.warnings.length > 0 ? `
    <div class="card">
      <h2>⚠️ Warnings</h2>
      ${report.warnings.map(warning => `<div class="warning">${warning}</div>`).join('')}
    </div>
  ` : ''}

  ${report.orphaned_documents.length > 0 ? `
    <div class="card">
      <h2>🔗 Orphaned Documents</h2>
      <ul>
        ${report.orphaned_documents.slice(0, 20).map(doc => `<li>${doc}</li>`).join('')}
        ${report.orphaned_documents.length > 20 ? `<li><em>...and ${report.orphaned_documents.length - 20} more</em></li>` : ''}
      </ul>
    </div>
  ` : ''}

  <div class="card" style="text-align: center; color: #6b7280;">
    Generated by Govli Migration Tool • ${new Date().toLocaleString()}
  </div>
</body>
</html>
    `.trim();

    const reportPath = path.join(this.config.output_dir, 'govqa_migration_report.html');
    fs.writeFileSync(reportPath, html);

    console.log(`\n📄 HTML report generated: ${reportPath}`);

    return reportPath;
  }
}