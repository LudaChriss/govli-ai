# GovQA Data Extractor

CLI tool for extracting and migrating data from GovQA to Govli FOIA management system. Used by Govli migration engineers during the Discovery phase to perform complete data migrations.

## Features

- **Interactive CLI**: Step-by-step guidance through the migration process
- **Paginated Extraction**: Efficiently extracts large datasets from GovQA API
- **Smart Transformation**: Maps GovQA fields to Govli schema with configurable status mappings
- **Batch Loading**: Loads data to Govli Migration API in configurable batch sizes
- **Checkpoint Resume**: Automatically resumes from last successful page if interrupted
- **Validation & Reporting**: Generates comprehensive HTML validation reports
- **Requester Deduplication**: Matches requesters by email to prevent duplicates

## Installation

```bash
npm install
npm run build
```

## Usage

### Run Interactive CLI

```bash
npx govli-migrate-govqa
```

### Or using npm script

```bash
npm run cli
```

## Migration Workflow

The CLI guides you through 7 steps:

### 1. Configure Credentials

Prompts for:
- GovQA API URL and credentials
- Govli API URL and migration key
- Tenant ID
- Batch size (default: 500)
- Output directory (default: ./migration-data/)
- Checkpoint resume setting

Configuration is saved to `govqa-migration.config.json` for reuse.

### 2. Test Connection

Validates connection to GovQA API before proceeding.

### 3. Inventory

Counts all entities in GovQA:
- 📇 Contacts (users)
- 📋 Cases (FOIA requests)
- 📄 Documents
- 💬 Communications (notes, emails)
- 💰 Fees
- 🔀 Routing Rules

### 4. Extract Data

Streams all data from GovQA to local JSONL files:
- `govqa_contacts.jsonl`
- `govqa_cases.jsonl`
- `govqa_documents.jsonl`
- `govqa_communications.jsonl`
- `govqa_fees.jsonl`
- `govqa_routing_rules.jsonl`

Features:
- Progress bars for each entity type
- Checkpoint saving after each page
- Automatic resume if interrupted

### 5. Transform Data

Applies field mappings to convert GovQA data to Govli format:
- Status code translation (configurable mapping)
- Date normalization (ISO 8601)
- Requester deduplication (by email)
- Filename cleanup (removes GovQA prefixes)

Outputs transformed data to:
- `govli_contacts.jsonl`
- `govli_requests.jsonl`
- `govli_documents.jsonl`
- `govli_communications.jsonl`
- `govli_fees.jsonl`

### 6. Load Data

Calls Govli Migration API bulk endpoints in batches:
- `POST /api/v1/foia/migration/contacts/bulk`
- `POST /api/v1/foia/migration/requests/bulk`
- `POST /api/v1/foia/migration/documents/bulk`
- `POST /api/v1/foia/migration/communications/bulk`
- `POST /api/v1/foia/migration/fees/bulk`

Loads in order: contacts → requests → documents → communications → fees

Handles errors gracefully and logs failures while continuing processing.

### 7. Validate Migration

Performs validation checks:
- **Entity count comparison**: Source vs target counts
- **Spot checks**: Compares 10 random records field-by-field
- **Orphaned documents**: Checks for documents referencing missing cases
- **Errors and warnings**: Reports data quality issues

Generates HTML report: `govqa_migration_report.html`

## Configuration File

`govqa-migration.config.json`:

```json
{
  "govqa": {
    "govqa_api_url": "https://yourdomain.govqa.com/api",
    "govqa_username": "your-username",
    "govqa_password": "your-password",
    "govqa_api_key": "optional-api-key"
  },
  "govli": {
    "govli_api_url": "https://api.govli.ai",
    "govli_migration_key": "your-migration-api-key",
    "tenant_id": "your-tenant-id"
  },
  "status_mapping": {
    "open": "SUBMITTED",
    "pending": "IN_PROGRESS",
    "closed": "CLOSED",
    "denied": "DENIED",
    "withdrawn": "WITHDRAWN"
  },
  "batch_size": 500,
  "output_dir": "./migration-data/",
  "resume_from_checkpoint": true
}
```

## Field Mappings

### GovQA → Govli Status Mapping

| GovQA Status | Govli Status |
|--------------|--------------|
| Open, New, Submitted | SUBMITTED |
| Pending, In Progress, Processing, Assigned | IN_PROGRESS |
| Closed, Completed, Fulfilled | CLOSED |
| Denied, Rejected | DENIED |
| Withdrawn, Cancelled | WITHDRAWN |

**Note**: Status mappings are configurable in `govqa-migration.config.json`

### GovQA Case → Govli Request

| GovQA Field | Govli Field |
|-------------|-------------|
| `id` | `legacy_id` |
| `case_number` | `tracking_number` |
| `description` | `description` |
| `requester_name` | `requester.name` |
| `requester_email` | `requester.email` |
| `requester_phone` | `requester.phone` |
| `requester_organization` | `requester.organization` |
| `requester_address` | `requester.address` |
| `status` | `foia_status` (mapped) |
| `date_received` | `submitted_at` |
| `date_due` | `due_date` |
| `date_closed` | `closed_at` |
| `assigned_department` | `assigned_department` |
| `fee_amount` | `fee_amount` |
| `fee_waived` | `fee_waived` |
| `notes` | `internal_notes` |
| `custom_fields` | `custom_metadata` |

### GovQA Contact → Govli Contact

| GovQA Field | Govli Field |
|-------------|-------------|
| `id` | `legacy_id` |
| `first_name` | `first_name` |
| `last_name` | `last_name` |
| `email` | `email` |
| `phone` | `phone` |
| `organization` | `organization` |
| `address` + `city` + `state` + `zip` | `address` (concatenated) |

### GovQA Document → Govli Document

| GovQA Field | Govli Field |
|-------------|-------------|
| `id` | `legacy_id` |
| `case_id` | `request_legacy_id` |
| `filename` | `filename` (cleaned) |
| `file_size` | `file_size` |
| `mime_type` | `mime_type` |
| `download_url` | `file_url` |
| `upload_date` | `uploaded_at` |
| `uploaded_by` | `uploaded_by` |
| `document_type` | `document_type` |
| `is_public` | `is_public` |

**Filename Cleaning**: Removes `GOVQA_12345_` and `GQ_9999_` prefixes

## Data Transformations

### Date Normalization

Converts various date formats to ISO 8601:
- **ISO 8601**: `2024-01-15T10:00:00Z` → preserved
- **US format**: `01/15/2024` → `2024-01-15T08:00:00.000Z`
- **European format**: `15/01/2024` → `2024-01-15T08:00:00.000Z`
- **Invalid dates**: Defaults to current date with warning

### Requester Deduplication

When transforming cases, the system:
1. Checks if requester email matches an existing contact
2. If match found, uses contact data for requester info
3. Logs a warning for manual review
4. Prevents duplicate contact creation

### Status Code Translation

Uses configurable mapping file to translate GovQA status codes to Govli statuses. Supports:
- Exact matching (case-insensitive)
- Keyword matching (e.g., "In Progress" matches "in progress")
- Default fallback to `SUBMITTED`

## Checkpoint Resume

If extraction is interrupted:

1. **Checkpoint file** `.extraction_checkpoint.json` stores:
   - Last page extracted
   - Last entity ID
   - Total extracted count
   - Timestamp

2. **Resume behavior**:
   - Skips already extracted pages
   - Appends to existing JSONL files
   - Continues progress bar from last position

3. **Enable/disable**:
   - Set `resume_from_checkpoint: true` in config
   - Or prompt will ask during CLI setup

## Validation Report

HTML report includes:

### Entity Count Comparison

| Entity Type | Source (GovQA) | Target (Govli) | Match |
|-------------|----------------|----------------|-------|
| Contacts | 1,250 | 1,250 | ✓ Match |
| Cases | 5,432 | 5,432 | ✓ Match |
| Documents | 12,345 | 12,340 | ✗ Mismatch |

### Spot Check Results

Random sample of 10 records with field-by-field comparison showing:
- Source ID → Target ID mapping
- Field value comparisons
- Match/mismatch indicators

### Orphaned Documents

Lists documents that reference non-existent cases (up to 20 shown).

### Errors and Warnings

- **Errors**: Critical issues (e.g., count mismatches)
- **Warnings**: Non-critical issues (e.g., missing optional fields)

### Overall Status

- **PASS**: No errors
- **WARNING**: Warnings present, but no errors
- **FAIL**: Errors present

## API Endpoints

### GovQA API (Source)

The tool expects GovQA to provide these endpoints:

- `GET /api/v1/ping` - Connection test
- `GET /api/v1/contacts/count` - Contact count
- `GET /api/v1/contacts?page=1&per_page=100` - Paginated contacts
- `GET /api/v1/cases/count` - Case count
- `GET /api/v1/cases?page=1&per_page=100` - Paginated cases
- `GET /api/v1/documents/count` - Document count
- `GET /api/v1/documents?page=1&per_page=100` - Paginated documents
- `GET /api/v1/communications/count` - Communication count
- `GET /api/v1/communications?page=1&per_page=100` - Paginated communications
- `GET /api/v1/fees/count` - Fee count
- `GET /api/v1/fees?page=1&per_page=100` - Paginated fees
- `GET /api/v1/routing_rules/count` - Routing rule count
- `GET /api/v1/routing_rules?page=1&per_page=100` - Paginated routing rules

**Authentication**: Basic Auth or API Key

### Govli Migration API (Target)

Calls these Govli endpoints:

- `POST /api/v1/foia/migration/contacts/bulk`
  ```json
  {
    "tenant_id": "uuid",
    "items": [ { "legacy_id": "...", "first_name": "...", ... } ]
  }
  ```

- `POST /api/v1/foia/migration/requests/bulk`
  ```json
  {
    "tenant_id": "uuid",
    "items": [ { "legacy_id": "...", "tracking_number": "...", ... } ]
  }
  ```

- `POST /api/v1/foia/migration/documents/bulk`
  ```json
  {
    "tenant_id": "uuid",
    "items": [ { "legacy_id": "...", "request_legacy_id": "...", ... } ]
  }
  ```

- `POST /api/v1/foia/migration/communications/bulk`
  ```json
  {
    "tenant_id": "uuid",
    "items": [ { "legacy_id": "...", "request_legacy_id": "...", ... } ]
  }
  ```

- `POST /api/v1/foia/migration/fees/bulk`
  ```json
  {
    "tenant_id": "uuid",
    "items": [ { "legacy_id": "...", "request_legacy_id": "...", ... } ]
  }
  ```

- `POST /api/v1/foia/migration/validate`
  ```json
  {
    "tenant_id": "uuid",
    "migration_source": "govqa"
  }
  ```

**Authentication**: `X-Migration-Key` header

## Error Handling

### Extraction Errors

- **Connection failures**: Retries with exponential backoff
- **Pagination errors**: Logs error and continues to next page
- **Parse errors**: Skips malformed records, logs error

### Transformation Errors

- **Missing required fields**: Logs error, skips record
- **Invalid dates**: Uses current date, logs warning
- **Orphaned entities**: Logs error if foreign key missing

### Loading Errors

- **Batch failures**: Logs errors for individual records
- **API errors**: Retries failed batches once
- **Network errors**: Aborts with clear error message

All errors are logged to:
- Console (real-time)
- `extraction_summary.json`
- `loading_summary.json`
- `govqa_migration_report.html`

## Testing

Run tests:

```bash
npm test
```

Test coverage:
- GovQA client initialization
- Contact transformation
- Case transformation with status mapping
- Document transformation with filename cleaning
- Date normalization
- Error handling (missing fields, orphaned records)

## Troubleshooting

### Connection Test Fails

**Problem**: `❌ Failed to connect to GovQA API`

**Solutions**:
1. Verify API URL is correct (e.g., `https://yourdomain.govqa.com/api`)
2. Check username/password are valid
3. Confirm API key (if required) is correct
4. Test GovQA API endpoint manually with curl:
   ```bash
   curl -u username:password https://yourdomain.govqa.com/api/v1/ping
   ```

### Extraction Interrupted

**Problem**: Extraction stops mid-process

**Solution**: Re-run CLI with `resume_from_checkpoint: true`
- Tool will skip already-extracted pages
- Appends to existing JSONL files
- Progress bar resumes from last position

### Count Mismatch in Validation

**Problem**: Source count ≠ Target count

**Investigation**:
1. Check `extraction_summary.json` for failed extractions
2. Check `loading_summary.json` for failed loads
3. Review transformation warnings for skipped records
4. Examine validation report for specific errors

### Orphaned Documents

**Problem**: Documents reference non-existent cases

**Causes**:
- Case extraction failed
- Case transformation skipped due to errors
- Case loading failed

**Solution**:
1. Check `govli_requests.jsonl` for missing cases
2. Review transformation logs for case errors
3. Re-run transformation for specific cases
4. Manually create missing cases in Govli

### Requester Deduplication Issues

**Problem**: Multiple contacts for same email

**Prevention**: Tool automatically deduplicates by email during transformation

**Manual fix**:
1. Identify duplicate contacts in Govli
2. Merge using Govli admin UI
3. Update request associations

## Output Files

After migration, `./migration-data/` contains:

### Extracted Data (GovQA format)
- `govqa_contacts.jsonl`
- `govqa_cases.jsonl`
- `govqa_documents.jsonl`
- `govqa_communications.jsonl`
- `govqa_fees.jsonl`
- `govqa_routing_rules.jsonl`

### Transformed Data (Govli format)
- `govli_contacts.jsonl`
- `govli_requests.jsonl`
- `govli_documents.jsonl`
- `govli_communications.jsonl`
- `govli_fees.jsonl`

### Metadata Files
- `extraction_summary.json` - Extraction stats
- `loading_summary.json` - Loading stats
- `.extraction_checkpoint.json` - Resume checkpoint
- `govqa_migration_report.html` - Validation report

## Performance

Typical migration of 10,000 requests:

| Stage | Duration | Throughput |
|-------|----------|------------|
| Inventory | 30 sec | N/A |
| Extract Contacts (1,000) | 2 min | 8/sec |
| Extract Cases (10,000) | 20 min | 8/sec |
| Extract Documents (25,000) | 50 min | 8/sec |
| Transform All | 5 min | 120/sec |
| Load All | 10 min | 60/sec |
| Validate | 2 min | N/A |
| **Total** | **~90 min** | - |

**Factors affecting performance**:
- GovQA API rate limits
- Network latency
- Document file sizes
- Batch size configuration

## Security

### Credentials

- **Config file**: Contains passwords in plaintext
- **Recommendation**: Use environment variables for production:
  ```bash
  export GOVQA_PASSWORD="your-password"
  export GOVLI_MIGRATION_KEY="your-key"
  ```
- **File permissions**: Set restrictive permissions on config file:
  ```bash
  chmod 600 govqa-migration.config.json
  ```

### API Keys

- GovQA API key (if required)
- Govli Migration API key (required)

Both should be:
- Rotated after migration completes
- Never committed to version control
- Stored in secure credential management system

## Migration Checklist

Before starting migration:
- [ ] Obtain GovQA API credentials
- [ ] Obtain Govli migration API key and tenant ID
- [ ] Review and customize status mappings in config
- [ ] Test GovQA API access manually
- [ ] Ensure sufficient disk space (estimate: 2x source data size)
- [ ] Schedule migration during low-usage period
- [ ] Notify stakeholders of migration timeline

During migration:
- [ ] Monitor extraction progress
- [ ] Review transformation warnings
- [ ] Watch for loading errors
- [ ] Keep stakeholders updated

After migration:
- [ ] Review validation report
- [ ] Spot-check random records in Govli
- [ ] Test Govli search functionality
- [ ] Verify document access and downloads
- [ ] Train staff on Govli system
- [ ] Archive GovQA data per retention policy

## Support

For issues or questions:
- **Documentation**: https://docs.govli.ai/migration
- **GitHub Issues**: https://github.com/govli/foia-migration-tools/issues
- **Email**: migration-support@govli.ai

## License

Part of the Govli FOIA Management System. All rights reserved.
