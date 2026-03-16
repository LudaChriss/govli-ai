#!/usr/bin/env node

/**
 * GovQA Migration CLI
 * Interactive CLI for extracting and migrating data from GovQA to Govli
 */

import * as fs from 'fs';
import * as path from 'path';
import * as inquirer from 'inquirer';
import chalk from 'chalk';
import { GovQAClient } from './govqaClient';
import { GovQAExtractor } from './extractor';
import { GovQATransformer } from './transformer';
import { GovliLoader } from './loader';
import { MigrationValidator } from './validator';
import { MigrationConfig } from './types';

const CONFIG_FILE = 'govqa-migration.config.json';

/**
 * Load configuration from file
 */
function loadConfig(): MigrationConfig | null {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      return config;
    }
  } catch (error) {
    console.error('Failed to load config file:', error);
  }
  return null;
}

/**
 * Save configuration to file
 */
function saveConfig(config: MigrationConfig): void {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    console.log(chalk.green(`\n✅ Configuration saved to ${CONFIG_FILE}`));
  } catch (error) {
    console.error('Failed to save config file:', error);
  }
}

/**
 * Step 1: Configure GovQA and Govli credentials
 */
async function configureCredentials(): Promise<MigrationConfig> {
  console.log(chalk.bold('\n📋 Step 1: Configure Credentials\n'));

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'govqa_api_url',
      message: 'GovQA API URL:',
      default: 'https://yourdomain.govqa.com/api',
      validate: (input: string) => input.startsWith('http') || 'Please enter a valid URL'
    },
    {
      type: 'input',
      name: 'govqa_username',
      message: 'GovQA Username:',
      validate: (input: string) => input.length > 0 || 'Username is required'
    },
    {
      type: 'password',
      name: 'govqa_password',
      message: 'GovQA Password:',
      mask: '*',
      validate: (input: string) => input.length > 0 || 'Password is required'
    },
    {
      type: 'input',
      name: 'govqa_api_key',
      message: 'GovQA API Key (optional):',
      default: ''
    },
    {
      type: 'input',
      name: 'govli_api_url',
      message: 'Govli API URL:',
      default: 'https://api.govli.ai',
      validate: (input: string) => input.startsWith('http') || 'Please enter a valid URL'
    },
    {
      type: 'input',
      name: 'govli_migration_key',
      message: 'Govli Migration API Key:',
      validate: (input: string) => input.length > 0 || 'Migration API key is required'
    },
    {
      type: 'input',
      name: 'tenant_id',
      message: 'Govli Tenant ID:',
      validate: (input: string) => input.length > 0 || 'Tenant ID is required'
    },
    {
      type: 'input',
      name: 'batch_size',
      message: 'Batch size for loading:',
      default: '500',
      validate: (input: string) => !isNaN(parseInt(input)) || 'Please enter a number'
    },
    {
      type: 'input',
      name: 'output_dir',
      message: 'Output directory for extracted data:',
      default: './migration-data/'
    },
    {
      type: 'confirm',
      name: 'resume_from_checkpoint',
      message: 'Enable checkpoint resume (for interrupted extractions)?',
      default: true
    }
  ]);

  const config: MigrationConfig = {
    govqa: {
      govqa_api_url: answers.govqa_api_url,
      govqa_username: answers.govqa_username,
      govqa_password: answers.govqa_password,
      govqa_api_key: answers.govqa_api_key || undefined
    },
    govli: {
      govli_api_url: answers.govli_api_url,
      govli_migration_key: answers.govli_migration_key,
      tenant_id: answers.tenant_id
    },
    status_mapping: {
      'open': 'SUBMITTED',
      'pending': 'IN_PROGRESS',
      'closed': 'CLOSED',
      'denied': 'DENIED',
      'withdrawn': 'WITHDRAWN'
    },
    batch_size: parseInt(answers.batch_size),
    output_dir: answers.output_dir,
    resume_from_checkpoint: answers.resume_from_checkpoint
  };

  saveConfig(config);

  return config;
}

/**
 * Step 2: Test connection to GovQA
 */
async function testConnection(config: MigrationConfig): Promise<boolean> {
  console.log(chalk.bold('\n🔌 Step 2: Test Connection\n'));

  const client = new GovQAClient(config.govqa);

  console.log('Testing connection to GovQA...');
  const connected = await client.testConnection();

  if (connected) {
    console.log(chalk.green('✅ Successfully connected to GovQA API'));
    return true;
  } else {
    console.log(chalk.red('❌ Failed to connect to GovQA API'));
    console.log(chalk.yellow('Please check your credentials and try again'));
    return false;
  }
}

/**
 * Step 3: Get inventory (count all entities)
 */
async function getInventory(config: MigrationConfig): Promise<Record<string, number>> {
  console.log(chalk.bold('\n📊 Step 3: Inventory\n'));

  const client = new GovQAClient(config.govqa);

  console.log('Fetching entity counts from GovQA...');
  const inventory = await client.getInventory();

  console.log(chalk.green('\n✅ Inventory complete:'));
  console.log(`  📇 Contacts: ${inventory.contacts.toLocaleString()}`);
  console.log(`  📋 Cases: ${inventory.cases.toLocaleString()}`);
  console.log(`  📄 Documents: ${inventory.documents.toLocaleString()}`);
  console.log(`  💬 Communications: ${inventory.communications.toLocaleString()}`);
  console.log(`  💰 Fees: ${inventory.fees.toLocaleString()}`);
  console.log(`  🔀 Routing Rules: ${inventory.routing_rules.toLocaleString()}`);

  const total = Object.values(inventory).reduce((sum, count) => sum + count, 0);
  console.log(chalk.bold(`\n  📦 Total entities: ${total.toLocaleString()}`));

  return inventory;
}

/**
 * Step 4: Extract all data
 */
async function extractData(config: MigrationConfig, inventory: Record<string, number>) {
  console.log(chalk.bold('\n📥 Step 4: Extract Data\n'));

  const extractor = new GovQAExtractor(config);

  const summaries = await extractor.extractAll(inventory);

  console.log(chalk.green('\n✅ Extraction complete!'));
  summaries.forEach(summary => {
    const duration = (summary.duration_ms / 1000).toFixed(1);
    console.log(`  ${summary.entity_type}: ${summary.extracted_count}/${summary.total_count} (${duration}s)`);
  });

  return summaries;
}

/**
 * Step 5: Transform data
 */
async function transformData(config: MigrationConfig) {
  console.log(chalk.bold('\n🔄 Step 5: Transform Data\n'));

  const transformer = new GovQATransformer(config);

  await transformer.transformAll();

  console.log(chalk.green('\n✅ Transformation complete!'));
}

/**
 * Step 6: Load data into Govli
 */
async function loadData(config: MigrationConfig) {
  console.log(chalk.bold('\n📤 Step 6: Load Data into Govli\n'));

  const loader = new GovliLoader(config);

  // Count transformed files
  const counts = {
    contacts: 0,
    requests: 0,
    documents: 0,
    communications: 0,
    fees: 0
  };

  // Load all data
  const results = await loader.loadAll(counts);

  const totalSuccessful = results.reduce((sum, r) => sum + r.successful, 0);
  const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);

  console.log(chalk.green('\n✅ Loading complete!'));
  console.log(`  ✓ Successful: ${totalSuccessful.toLocaleString()}`);
  if (totalFailed > 0) {
    console.log(chalk.yellow(`  ⚠ Failed: ${totalFailed.toLocaleString()}`));
  }

  return results;
}

/**
 * Step 7: Validate migration
 */
async function validateMigration(config: MigrationConfig, extractionSummaries: any[]) {
  console.log(chalk.bold('\n✅ Step 7: Validate Migration\n'));

  const validator = new MigrationValidator(config);

  const report = await validator.validate(extractionSummaries);
  const reportPath = validator.generateHTMLReport(report);

  console.log(chalk.green(`\n✅ Validation complete: ${report.overall_status}`));
  console.log(`  📄 Report: ${reportPath}`);

  if (report.errors.length > 0) {
    console.log(chalk.red('\n  ❌ Errors:'));
    report.errors.forEach(error => console.log(chalk.red(`    - ${error}`)));
  }

  if (report.warnings.length > 0) {
    console.log(chalk.yellow('\n  ⚠️  Warnings:'));
    report.warnings.forEach(warning => console.log(chalk.yellow(`    - ${warning}`)));
  }
}

/**
 * Main CLI function
 */
async function main() {
  console.log(chalk.bold.blue('\n╔═══════════════════════════════════════╗'));
  console.log(chalk.bold.blue('║   GovQA to Govli Migration Tool      ║'));
  console.log(chalk.bold.blue('╚═══════════════════════════════════════╝\n'));

  // Try to load existing config
  let config = loadConfig();

  if (config) {
    const { useExisting } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'useExisting',
        message: 'Found existing configuration. Use it?',
        default: true
      }
    ]);

    if (!useExisting) {
      config = null;
    }
  }

  // Step 1: Configure credentials
  if (!config) {
    config = await configureCredentials();
  }

  // Step 2: Test connection
  const connected = await testConnection(config);
  if (!connected) {
    console.log(chalk.red('\nMigration aborted due to connection failure.'));
    process.exit(1);
  }

  // Step 3: Get inventory
  const inventory = await getInventory(config);

  const { proceed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'proceed',
      message: 'Proceed with extraction?',
      default: true
    }
  ]);

  if (!proceed) {
    console.log(chalk.yellow('\nMigration cancelled.'));
    process.exit(0);
  }

  // Step 4: Extract
  const extractionSummaries = await extractData(config, inventory);

  // Step 5: Transform
  await transformData(config);

  const { loadNow } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'loadNow',
      message: 'Load data into Govli now?',
      default: true
    }
  ]);

  if (loadNow) {
    // Step 6: Load
    await loadData(config);

    // Step 7: Validate
    await validateMigration(config, extractionSummaries);
  }

  console.log(chalk.bold.green('\n🎉 Migration process complete!\n'));
}

// Run CLI
main().catch(error => {
  console.error(chalk.red('\n❌ Migration failed:'), error);
  process.exit(1);
});
