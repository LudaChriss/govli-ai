# Govli FOIA Spreadsheet Import Engine

**AI-powered spreadsheet import for migrating FOIA data from Excel/CSV files.**

## Overview

The Spreadsheet Import Engine enables government agencies to import historical FOIA request data from spreadsheets (.xlsx, .csv, .tsv) into Govli. The system uses Claude Haiku 4.5 to intelligently suggest column mappings, making the import process fast and accurate.

### Key Features

- **Multi-Format Support**: .xlsx (Excel), .csv, .tsv
- **AI-Powered Column Mapping**: Claude Haiku 4.5 suggests optimal column mappings with confidence scores
- **Large File Support**: Up to 50MB file size
- **Auto-Detection**: Automatically identifies date and email columns
- **Flexible Status Mapping**: Matches common status terms (open, closed, pending, etc.) to Govli statuses
- **Data Validation**: Row-by-row validation with detailed error tracking
- **Multi-Sheet Support**: Handle Excel files with multiple sheets
- **Data Preview**: See first 10 rows before importing

### Supported File Formats

- **Excel (.xlsx)**: Full support including multi-sheet workbooks
- **CSV (.csv)**: Comma-separated values
- **TSV (.tsv)**: Tab-separated values

---

## API Endpoints

All endpoints require `foia_admin` authentication.

### POST `/api/v1/foia/migration/spreadsheet/upload`

Upload and parse spreadsheet file.

**Request:**
```http
POST /api/v1/foia/migration/spreadsheet/upload
Content-Type: multipart/form-data
Authorization: Bearer <token>

file: <spreadsheet_file>
sheet_name: Sheet1 (optional, for multi-sheet .xlsx)
```

**Response:**
```json
{
  "success": true,
  "data": {
    "file_id": "550e8400-e29b-41d4-a716-446655440000",
    "sheet_names": ["Sheet1", "Sheet2"],
    "columns": ["Name", "Email", "Date Received", "Description"],
    "row_count": 150,
    "preview": [
      {
        "Name": "John Doe",
        "Email": "john@example.com",
        "Date Received": "2023-01-15",
        "Description": "Request for public records"
      }
    ],
    "detected_date_columns": ["Date Received"],
    "detected_email_columns": ["Email"]
  }
}
```

**Notes:**
- Files are stored in Redis with 1-hour TTL
- Max file size: 50MB
- Preview shows first 10 rows

---

### POST `/api/v1/foia/migration/spreadsheet/suggest-mapping`

Get AI-suggested column mappings.

**Request:**
```json
{
  "file_id": "550e8400-e29b-41d4-a716-446655440000",
  "sheet_name": "Sheet1" (optional)
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "mappings": [
      {
        "source_column": "Name",
        "target_field": "requester_name",
        "confidence": 0.95
      },
      {
        "source_column": "Email",
        "target_field": "requester_email",
        "confidence": 0.98
      },
      {
        "source_column": "Date Received",
        "target_field": "date_received",
        "confidence": 0.92
      },
      {
        "source_column": "Description",
        "target_field": "description",
        "confidence": 0.88
      },
      {
        "source_column": "Internal Notes",
        "target_field": null,
        "confidence": 0.0
      }
    ]
  }
}
```

**Target Fields:**
- `requester_name` - Name of requester
- `requester_email` - Email address
- `requester_phone` - Phone number
- `description` - Request description (required)
- `date_received` - Date request was received (required)
- `date_due` - Response due date
- `date_closed` - Date request was closed
- `department` - Department handling request
- `status` - Request status
- `response_type` - Type of response
- `notes` - Additional notes
- `tracking_number` - Legacy tracking number
- `category` - Requester category

**Confidence Scores:**
- `0.9+`: Very confident
- `0.7-0.9`: Confident
- `0.5-0.7`: Uncertain
- `< 0.5`: Guess
- `0.0`: No mapping (set `target_field` to `null`)

**Fallback:** If AI fails, heuristic matching is used based on column name keywords.

---

### POST `/api/v1/foia/migration/spreadsheet/confirm-mapping`

Confirm or adjust AI-suggested mappings.

**Request:**
```json
{
  "file_id": "550e8400-e29b-41d4-a716-446655440000",
  "mappings": [
    { "source": "Name", "target": "requester_name" },
    { "source": "Email", "target": "requester_email" },
    { "source": "Date Received", "target": "date_received" },
    { "source": "Description", "target": "description" },
    { "source": "Status", "target": "status" }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "mapping_id": "650e8400-e29b-41d4-a716-446655440000",
    "mapped_fields": [
      "requester_name",
      "requester_email",
      "date_received",
      "description",
      "status"
    ],
    "unmapped_columns": [
      "Internal Notes",
      "Legacy ID"
    ]
  }
}
```

**Validation:**
- `description` field mapping is required
- `date_received` field mapping is required
- All target fields must be valid FOIA fields
- All source columns must exist in spreadsheet

**Notes:**
- Confirmed mappings stored in Redis with 1-hour TTL
- Officers can adjust AI suggestions before confirming

---

### POST `/api/v1/foia/migration/spreadsheet/import`

Import spreadsheet data into FOIA requests.

**Request:**
```json
{
  "file_id": "550e8400-e29b-41d4-a716-446655440000",
  "mapping_id": "650e8400-e29b-41d4-a716-446655440000"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "total_rows": 150,
    "imported": 145,
    "skipped": 5,
    "errors": [
      {
        "row_number": 23,
        "error": "Missing required field: description"
      },
      {
        "row_number": 45,
        "error": "Invalid date format in column \"Date Received\": not-a-date"
      }
    ],
    "import_report_url": "/api/v1/foia/migration/reports/550e8400-e29b-41d4-a716-446655440000"
  }
}
```

**Import Process:**
1. Apply column mapping to transform each row
2. Validate required fields (description, date_received)
3. Normalize dates to ISO 8601
4. Normalize status values to Govli statuses
5. Create FOIA requests via Migration API bulk endpoint
6. Set `migration_source = 'spreadsheet'`
7. Set `legacy_id = tracking_number` (or row number if no tracking number)

**Defaults:**
- If `requester_name` missing: "Unknown"
- If `requester_email` missing: "unknown@example.com"
- If `department` missing: "General"
- If `status` missing: "SUBMITTED"

**Emits:**
- Event: `foia.migration.spreadsheet.completed`

---

## Status Normalization

The system flexibly matches status values from spreadsheets to Govli statuses:

### Status Mapping Table

| Spreadsheet Status | Govli Status |
|-------------------|--------------|
| open, new, submitted, received, pending | `SUBMITTED` |
| in progress, processing, assigned, under review | `IN_PROGRESS` |
| pending approval, awaiting approval | `PENDING_APPROVAL` |
| ready, ready for delivery, approved | `READY_FOR_DELIVERY` |
| delivered, fulfilled, completed, sent | `DELIVERED` |
| closed, complete, done | `CLOSED` |
| denied, rejected | `CLOSED` |
| withdrawn, cancelled, canceled | `WITHDRAWN` |

**Matching:**
- Case-insensitive
- Partial matches supported (e.g., "Status: In Progress" → `IN_PROGRESS`)
- Unknown statuses default to `SUBMITTED`

---

## Date Normalization

The system handles multiple date formats:

**Supported Formats:**
- ISO 8601: `2023-01-15`, `2023-01-15T10:00:00Z`
- US Format: `01/15/2023`, `1/15/23`
- European Format: `15/01/2023`
- Long Format: `January 15, 2023`, `Jan 15, 2023`

**Validation:**
- Year must be between 1900 and 2100
- Invalid dates are rejected with error

**Output:**
All dates are normalized to ISO 8601 format (`2023-01-15T00:00:00.000Z`)

---

## Error Handling

All endpoints return standardized error responses:

```json
{
  "success": false,
  "error": "Error message here"
}
```

**Common HTTP Status Codes:**
- `200` - Success
- `400` - Bad request (missing file, invalid mappings, validation errors)
- `401` - Unauthorized (authentication required)
- `403` - Forbidden (access denied to file/mapping from different tenant)
- `404` - File or mapping not found/expired
- `500` - Internal server error

**Import Error Handling:**

Import processing continues even if individual rows fail:

```json
{
  "success": true,
  "data": {
    "total_rows": 100,
    "imported": 95,
    "skipped": 5,
    "errors": [
      { "row_number": 12, "error": "Missing required field: description" },
      { "row_number": 34, "error": "Invalid date format" }
    ]
  }
}
```

---

## Data Storage

**Redis Storage:**
- Parsed spreadsheet data: 1 hour TTL
- Confirmed mappings: 1 hour TTL
- Key format: `spreadsheet:<file_id>`, `mapping:<mapping_id>`

**Why Redis:**
- Fast access for large datasets
- Automatic cleanup via TTL
- No permanent storage of uploaded files

---

## Column Detection

The system automatically detects special column types:

### Date Column Detection

**By Name:**
- Keywords: `date`, `time`, `timestamp`, `when`, `received`, `submitted`, `due`, `closed`

**By Values:**
- 70%+ of sample values match date patterns
- Checks ISO 8601, US format, long format

### Email Column Detection

**By Name:**
- Keywords: `email`, `e-mail`, `mail`, `contact`

**By Values:**
- 70%+ of sample values match email regex pattern

---

## Testing

Run tests:
```bash
npm test
```

Run with coverage:
```bash
npm test -- --coverage
```

Type checking:
```bash
npm run typecheck
```

---

## Environment Variables

Required environment variables:

```bash
# Anthropic API Key (for AI column mapping)
ANTHROPIC_API_KEY=sk-ant-...

# Redis (for temporary data storage)
REDIS_URL=redis://localhost:6379

# Migration API (for bulk import)
MIGRATION_API_URL=http://localhost:3000/api/v1/foia/migration
```

---

## Example Import Workflow

1. **Upload File**:
   ```
   POST /upload (with file)
   → Returns file_id, preview, detected columns
   ```

2. **Get AI Suggestions**:
   ```
   POST /suggest-mapping { file_id }
   → Returns AI-suggested mappings with confidence scores
   ```

3. **Review and Adjust Mappings**:
   - Officer reviews AI suggestions
   - Adjusts any incorrect mappings
   - Ensures required fields are mapped

4. **Confirm Mappings**:
   ```
   POST /confirm-mapping { file_id, mappings }
   → Returns mapping_id
   ```

5. **Import Data**:
   ```
   POST /import { file_id, mapping_id }
   → Returns import summary with errors
   ```

6. **Review Import Report**:
   - Check imported count
   - Review any errors
   - Fix source data if needed
   - Re-import if necessary

---

## AI Column Mapping

The system uses **Claude Haiku 4.5** for intelligent column mapping suggestions.

**How it Works:**
1. Extract column headers and first 5 sample rows
2. Send to Claude Haiku 4.5 with prompt describing target FOIA fields
3. AI analyzes headers and sample data
4. Returns mappings with confidence scores
5. Fallback to heuristic matching if AI fails

**Prompt Structure:**
```
Given these column headers and sample data, suggest the best mapping
for each column to FOIA request fields.

Target fields: requester_name, requester_email, description,
date_received, department, status, etc.

Return JSON with mappings and confidence scores.
```

**Benefits:**
- Handles non-standard column names
- Understands context from sample data
- Provides confidence scores for officer review
- Saves time vs manual mapping

---

## Architecture

```
User uploads .xlsx/.csv/.tsv
         ↓
File Parser (SheetJS/csv-parse)
         ↓
Redis (1hr TTL) ← Store parsed data
         ↓
AI Column Mapping (Claude Haiku 4.5)
         ↓
Officer Review & Confirm
         ↓
Redis (1hr TTL) ← Store confirmed mapping
         ↓
Row-by-Row Processing
  - Apply mapping
  - Validate required fields
  - Normalize dates & status
  - Track errors
         ↓
Migration API Bulk Import
         ↓
FOIA Requests Created
```

---

## Support

For migration support, contact: [support@govli.com](mailto:support@govli.com)

Documentation: [https://docs.govli.com/migration/spreadsheet](https://docs.govli.com/migration/spreadsheet)
