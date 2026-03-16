# Email Import Engine

AI-powered email-to-FOIA request parsing system using Claude Sonnet 4.5. Enables agencies to forward incoming FOIA request emails to `import@{subdomain}.govli.ai` for automatic parsing and draft request creation.

## Features

- **Email Webhook Integration**: Receives parsed emails from SendGrid Inbound Parse or AWS SES
- **AI-Powered Parsing**: Uses Claude Sonnet 4.5 to extract structured FOIA request data from email content
- **Intelligent Classification**: Distinguishes FOIA requests from spam, marketing, and internal emails
- **Tenant Resolution**: Automatically routes emails to correct tenant based on subdomain
- **Admin Review Workflow**: Creates draft requests with `PENDING_IMPORT_REVIEW` status for human verification
- **Attachment Processing**: Validates and uploads email attachments (up to 25MB per file)
- **Quality Analytics**: Tracks AI confidence scores and false positive rates
- **Security**: Blocks dangerous file types (.exe, .bat, .cmd, etc.)

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Email Forwarding Setup                      │
│                                                                  │
│  Agency Email: foia@cityname.gov                                │
│         │                                                        │
│         ├─> Forward to: import@cityname.govli.ai                │
│         │                                                        │
│         └─> SendGrid Inbound Parse / AWS SES                    │
│                      │                                           │
│                      ▼                                           │
│            POST /api/v1/foia/migration/email/ingest             │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     AI Parsing Pipeline                          │
│                                                                  │
│  1. Extract tenant from recipient (import@cityname.govli.ai)    │
│  2. Parse email with Claude Sonnet 4.5                          │
│  3. Classify: is_foia_request (true/false)                      │
│  4. Extract: requester info, description, departments, dates    │
│  5. Assign confidence score (0.0-1.0)                           │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    Admin Review Workflow                         │
│                                                                  │
│  IF is_foia_request = true:                                     │
│    → Create draft FoiaRequest (status: PENDING_IMPORT_REVIEW)   │
│    → Upload attachments to S3                                   │
│    → Notify foia_admin                                          │
│                                                                  │
│  Admin Actions:                                                  │
│    → GET /pending - List all pending imports                    │
│    → POST /:requestId/approve - Approve and submit              │
│    → POST /:requestId/reject - Reject and delete draft          │
│                                                                  │
│  IF is_foia_request = false:                                    │
│    → Log to FoiaEmailImports (status: PENDING)                  │
│    → No draft created                                           │
└─────────────────────────────────────────────────────────────────┘
```

## API Endpoints

### 1. Ingest Email Webhook

**Endpoint**: `POST /api/v1/foia/migration/email/ingest`

**Purpose**: Receives parsed emails from SendGrid or AWS SES and creates draft FOIA requests.

**Authentication**: Webhook authentication (API key or IP whitelist)

**Request Body**:
```typescript
{
  from: string;              // "John Doe <john@example.com>"
  to: string;                // "import@cityname.govli.ai"
  subject: string;           // "FOIA Request for Police Reports"
  body_text: string;         // Plain text email body
  body_html?: string;        // HTML email body (optional)
  attachments?: [
    {
      filename: string;
      content_type: string;
      content_base64: string;
    }
  ];
}
```

**Response**:
```typescript
{
  success: true,
  data: {
    processed: true,
    request_id?: string;        // UUID of draft request (if FOIA)
    confidence: number;         // 0.0-1.0
    requires_review: boolean;   // true if draft created
    message: string;
  }
}
```

**Example**:
```bash
curl -X POST http://localhost:3000/api/v1/foia/migration/email/ingest \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-webhook-api-key" \
  -d '{
    "from": "Jane Smith <jane@example.com>",
    "to": "import@cityname.govli.ai",
    "subject": "Public Records Request - City Council Meeting Minutes",
    "body_text": "I am requesting all City Council meeting minutes from January 1, 2023 through December 31, 2023. Please provide these in PDF format.\n\nThank you,\nJane Smith\njane@example.com\n(555) 123-4567",
    "attachments": []
  }'
```

**Response Example (FOIA Request)**:
```json
{
  "success": true,
  "data": {
    "processed": true,
    "request_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "confidence": 0.92,
    "requires_review": true,
    "message": "Email parsed as FOIA request. Draft created for review."
  }
}
```

**Response Example (Non-FOIA Email)**:
```json
{
  "success": true,
  "data": {
    "processed": true,
    "confidence": 0.05,
    "requires_review": false,
    "message": "Email does not appear to be a FOIA request."
  }
}
```

**AI Parsing Logic**:

The system uses Claude Sonnet 4.5 to analyze the email and extract:

```typescript
{
  is_foia_request: boolean;           // Classification result
  requester_name: string | null;      // "Jane Smith"
  requester_email: string | null;     // "jane@example.com"
  requester_phone: string | null;     // "(555) 123-4567"
  requester_organization: string | null;
  request_description: string;        // Summarized request
  date_range_mentioned: string | null; // "January 1, 2023 - December 31, 2023"
  departments_mentioned: string[];    // ["City Council"]
  record_types_mentioned: string[];   // ["Meeting Minutes"]
  urgency_indicators: string[];       // ["expedited request", "urgent"]
  confidence: number;                 // 0.0-1.0
}
```

**Confidence Score Interpretation**:
- **0.9-1.0**: Very clear FOIA request (e.g., explicit mention of "FOIA", "public records request", specific documents)
- **0.7-0.9**: Likely FOIA request (e.g., clear document request, but no explicit FOIA mention)
- **0.5-0.7**: Unclear, needs human review (e.g., vague request, missing details)
- **0.3-0.5**: Probably not a FOIA request (e.g., general inquiry, question)
- **0.0-0.3**: Definitely not a FOIA request (e.g., spam, marketing, internal memo)

**Error Responses**:

```json
{
  "success": false,
  "error": "Missing required fields: from, to, subject, body_text"
}
```

```json
{
  "success": false,
  "error": "Invalid recipient address format. Expected: import@{subdomain}.govli.ai, got: admin@govli.ai"
}
```

```json
{
  "success": false,
  "error": "No active tenant found for subdomain: nonexistent"
}
```

---

### 2. Get Pending Reviews

**Endpoint**: `GET /api/v1/foia/migration/email/pending`

**Purpose**: Retrieves all email imports awaiting admin review.

**Authentication**: `foia_admin` role required

**Query Parameters**: None

**Response**:
```typescript
{
  success: true,
  data: {
    pending_requests: [
      {
        id: string;                    // Request UUID
        tenant_id: string;
        from_email: string;
        subject: string;
        body_text: string;
        parsed_data: ParsedFoiaRequest;
        confidence: number;
        created_at: string;            // ISO 8601
        original_email_id: string;     // Email import UUID
      }
    ],
    total: number;
  }
}
```

**Example**:
```bash
curl -X GET http://localhost:3000/api/v1/foia/migration/email/pending \
  -H "Authorization: Bearer <user-jwt-token>"
```

**Response Example**:
```json
{
  "success": true,
  "data": {
    "pending_requests": [
      {
        "id": "req-123",
        "tenant_id": "tenant-456",
        "from_email": "john@example.com",
        "subject": "FOIA Request for Police Reports",
        "body_text": "I am requesting all police reports...",
        "parsed_data": {
          "is_foia_request": true,
          "requester_name": "John Doe",
          "requester_email": "john@example.com",
          "request_description": "All police reports for January 2023",
          "confidence": 0.92
        },
        "confidence": 0.92,
        "created_at": "2026-03-15T10:30:00Z",
        "original_email_id": "email-789"
      }
    ],
    "total": 1
  }
}
```

---

### 3. Approve Request

**Endpoint**: `POST /api/v1/foia/migration/email/:requestId/approve`

**Purpose**: Approves an email-imported request and transitions it to `SUBMITTED` status.

**Authentication**: `foia_admin` role required

**Request Body**:
```typescript
{
  approved_fields?: {
    description?: string;
    requester_name?: string;
    requester_email?: string;
    requester_phone?: string;
    requester_organization?: string;
  }
}
```

**Response**:
```typescript
{
  success: true,
  data: {
    request_id: string;
    status: "SUBMITTED";
    message: string;
  }
}
```

**Example**:
```bash
curl -X POST http://localhost:3000/api/v1/foia/migration/email/req-123/approve \
  -H "Authorization: Bearer <user-jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "approved_fields": {
      "description": "All police reports from January 1-31, 2023",
      "requester_name": "John Doe"
    }
  }'
```

**Response Example**:
```json
{
  "success": true,
  "data": {
    "request_id": "req-123",
    "status": "SUBMITTED",
    "message": "Request approved and submitted"
  }
}
```

**Workflow**:
1. Verifies request is in `PENDING_IMPORT_REVIEW` status
2. Applies `approved_fields` to override AI-parsed values (if provided)
3. Transitions request from `PENDING_IMPORT_REVIEW` → `SUBMITTED`
4. Updates email import status to `APPROVED`
5. Creates audit log entry
6. Emits `foia.email.import.approved` event

---

### 4. Reject Request

**Endpoint**: `POST /api/v1/foia/migration/email/:requestId/reject`

**Purpose**: Rejects an email import and deletes the draft request.

**Authentication**: `foia_admin` role required

**Request Body**:
```typescript
{
  reason: string;  // Required
}
```

**Response**:
```typescript
{
  success: true,
  data: {
    message: string;
    reason: string;
  }
}
```

**Example**:
```bash
curl -X POST http://localhost:3000/api/v1/foia/migration/email/req-123/reject \
  -H "Authorization: Bearer <user-jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Not a valid FOIA request - spam email"
  }'
```

**Response Example**:
```json
{
  "success": true,
  "data": {
    "message": "Request rejected and deleted",
    "reason": "Not a valid FOIA request - spam email"
  }
}
```

**Workflow**:
1. Verifies request is in `PENDING_IMPORT_REVIEW` status
2. Updates email import status to `REJECTED` (keeps record for quality tracking)
3. Stores rejection reason
4. Deletes the draft `FoiaRequest`
5. Emits `foia.email.import.rejected` event

**Why Keep Rejected Emails?**
Rejected email imports are preserved in `FoiaEmailImports` table to track AI quality metrics (false positive rate).

---

### 5. Get Analytics

**Endpoint**: `GET /api/v1/foia/migration/email/analytics`

**Purpose**: Retrieves email import quality metrics for a tenant.

**Authentication**: `foia_supervisor` or higher role required

**Query Parameters**: None

**Response**:
```typescript
{
  success: true,
  data: {
    emails_received: number;
    parsed_as_foia: number;
    parsed_as_non_foia: number;
    approved: number;
    rejected: number;
    pending_review: number;
    avg_confidence: number;      // 0.0-1.0
    false_positive_rate: number; // Percentage
  }
}
```

**Example**:
```bash
curl -X GET http://localhost:3000/api/v1/foia/migration/email/analytics \
  -H "Authorization: Bearer <supervisor-jwt-token>"
```

**Response Example**:
```json
{
  "success": true,
  "data": {
    "emails_received": 100,
    "parsed_as_foia": 75,
    "parsed_as_non_foia": 25,
    "approved": 60,
    "rejected": 10,
    "pending_review": 5,
    "avg_confidence": 0.85,
    "false_positive_rate": 13.33
  }
}
```

**Metrics Explanation**:
- **emails_received**: Total emails processed by the system
- **parsed_as_foia**: Emails classified as FOIA requests by AI
- **parsed_as_non_foia**: Emails classified as non-FOIA by AI
- **approved**: Draft requests approved by admins
- **rejected**: Draft requests rejected by admins (false positives)
- **pending_review**: Draft requests awaiting admin review
- **avg_confidence**: Average AI confidence score across all emails
- **false_positive_rate**: Percentage of FOIA-classified emails that were rejected by admins
  - Formula: `(rejected / parsed_as_foia) * 100`
  - **Lower is better** (indicates AI is accurately classifying emails)

---

## Attachment Processing

### Supported File Types

**Allowed**:
- Documents: `.pdf`, `.doc`, `.docx`, `.txt`, `.rtf`
- Spreadsheets: `.xls`, `.xlsx`, `.csv`
- Images: `.jpg`, `.jpeg`, `.png`, `.gif`, `.bmp`, `.tiff`
- Archives: `.zip`, `.tar`, `.gz`
- Other: `.odt`, `.ods`, `.odp`, `.xml`, `.json`

**Blocked (Dangerous File Types)**:
- Executables: `.exe`, `.bat`, `.cmd`, `.com`, `.scr`, `.pif`
- Scripts: `.vbs`, `.js`, `.jar`, `.app`, `.deb`, `.rpm`

### Size Limits

- **Max per attachment**: 25 MB
- **Max total per email**: Unlimited (processed individually)

### Validation

Each attachment is validated before upload:

```typescript
interface ValidationResult {
  valid: boolean;
  error?: string;
}

// Examples:
{ valid: true }
{ valid: false, error: "Attachment 'large.pdf' exceeds 25MB limit" }
{ valid: false, error: "Attachment 'virus.exe' is a prohibited file type" }
```

Invalid attachments are **skipped** with a warning logged. Valid attachments are uploaded to S3 and linked to the draft request.

---

## Database Schema

### FoiaEmailImports Table

```sql
CREATE TABLE "FoiaEmailImports" (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  from_email VARCHAR(255) NOT NULL,
  to_email VARCHAR(255) NOT NULL,
  subject VARCHAR(500),
  body_text TEXT NOT NULL,
  body_html TEXT,
  parsed_data JSONB NOT NULL,        -- AI-extracted data
  is_foia BOOLEAN NOT NULL,          -- AI classification
  confidence DECIMAL(3,2) NOT NULL,  -- 0.00-1.00
  request_id UUID,                   -- FK to FoiaRequests
  status VARCHAR(20) DEFAULT 'PENDING',
  created_at TIMESTAMP DEFAULT NOW(),
  approved_at TIMESTAMP,
  rejected_at TIMESTAMP,
  rejection_reason TEXT
);
```

**Indexes**:
- `idx_email_imports_tenant` on `(tenant_id)`
- `idx_email_imports_status` on `(tenant_id, status)`
- `idx_email_imports_is_foia` on `(tenant_id, is_foia)`
- `idx_email_imports_request` on `(request_id)` WHERE `request_id IS NOT NULL`
- `idx_email_imports_analytics` on `(tenant_id, is_foia, status, created_at)`

**Status Values**:
- `PENDING`: Awaiting admin review
- `APPROVED`: Admin approved, request submitted
- `REJECTED`: Admin rejected, request deleted (false positive)

### EmailImportStats View

Analytics view for quick metrics:

```sql
CREATE VIEW "EmailImportStats" AS
SELECT
  tenant_id,
  COUNT(*) as total_emails,
  COUNT(*) FILTER (WHERE is_foia = true) as parsed_as_foia,
  COUNT(*) FILTER (WHERE is_foia = false) as parsed_as_non_foia,
  COUNT(*) FILTER (WHERE status = 'APPROVED') as approved_count,
  COUNT(*) FILTER (WHERE status = 'REJECTED') as rejected_count,
  COUNT(*) FILTER (WHERE status = 'PENDING') as pending_count,
  AVG(confidence) as avg_confidence,
  ROUND((COUNT(*) FILTER (WHERE is_foia = true AND status = 'REJECTED')::DECIMAL /
         NULLIF(COUNT(*) FILTER (WHERE is_foia = true), 0) * 100), 2) as false_positive_rate_pct
FROM "FoiaEmailImports"
GROUP BY tenant_id;
```

---

## Email Forwarding Setup

### SendGrid Inbound Parse

1. **Configure Inbound Parse Webhook**:
   - Go to SendGrid Settings → Inbound Parse
   - Add subdomain: `import.cityname.govli.ai`
   - Point to: `https://api.govli.ai/v1/foia/migration/email/ingest`
   - Authentication: Add webhook API key header

2. **Email Forwarding**:
   - Agency forwards FOIA emails to: `import@cityname.govli.ai`
   - SendGrid receives and parses the email
   - SendGrid POSTs to webhook endpoint

### AWS SES + S3 Setup

1. **Configure SES Receipt Rule**:
   - Domain: `cityname.govli.ai`
   - Recipient: `import@cityname.govli.ai`
   - Action 1: Store to S3 bucket
   - Action 2: Invoke Lambda function

2. **Lambda Function**:
   - Reads email from S3
   - Parses email headers and body
   - POSTs to webhook endpoint

### Email Format

The webhook expects this JSON payload:

```json
{
  "from": "John Doe <john@example.com>",
  "to": "import@cityname.govli.ai",
  "subject": "FOIA Request",
  "body_text": "Email body in plain text",
  "body_html": "<html>Email body in HTML</html>",
  "attachments": [
    {
      "filename": "document.pdf",
      "content_type": "application/pdf",
      "content_base64": "JVBERi0xLjQK..."
    }
  ]
}
```

---

## Testing

### Run All Tests

```bash
cd modules/foia/migration/extractors/email
npm test
```

### Test Coverage

The test suite covers:
- ✅ Email parser (tenant subdomain extraction)
- ✅ Attachment validation (size limits, dangerous file types)
- ✅ Ingest email handler (FOIA vs non-FOIA classification)
- ✅ Pending reviews handler (authentication, listing)
- ✅ Approve request handler (field overrides, status transition)
- ✅ Reject request handler (deletion, reason requirement)
- ✅ Analytics handler (metrics calculation)

### Example Test Output

```
 PASS  __tests__/email.test.ts
  Email Import Engine
    extractTenantSubdomain
      ✓ should extract subdomain from import email address
      ✓ should return null for invalid email formats
      ✓ should be case-insensitive
    validateAttachment
      ✓ should accept valid PDF attachment
      ✓ should reject attachment exceeding 25MB
      ✓ should reject dangerous file types
      ✓ should accept common document types
    ingestEmail handler
      ✓ should reject request without required fields
      ✓ should reject invalid recipient email format
      ✓ should reject email for non-existent tenant
      ✓ should process FOIA request email successfully
      ✓ should reject non-FOIA email (spam)
    getPendingReviews handler
      ✓ should require authentication
      ✓ should return list of pending reviews
    approveRequest handler
      ✓ should approve and transition request to SUBMITTED
    rejectRequest handler
      ✓ should reject and delete request
      ✓ should require rejection reason
    getAnalytics handler
      ✓ should return email import analytics

Test Suites: 1 passed, 1 total
Tests:       18 passed, 18 total
```

---

## Integration with Govli FOIA System

### Workflow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Public citizen sends email to: foia@cityname.gov             │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. Agency forwards to: import@cityname.govli.ai                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. SendGrid/SES → POST /ingest webhook                          │
│    - AI parses email using Claude Sonnet 4.5                    │
│    - Extracts requester info, description, departments          │
│    - Classifies as FOIA request (confidence: 0.92)              │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. Draft request created (PENDING_IMPORT_REVIEW)                │
│    - Requester: John Doe <john@example.com>                     │
│    - Description: "All police reports for January 2023"         │
│    - Attachments uploaded to S3                                 │
│    - Notification sent to foia_admin                            │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. Admin reviews draft (GET /pending)                           │
│    - Reviews AI-extracted fields                                │
│    - Checks confidence score                                    │
│    - Verifies requester information                             │
└────────────────────────────┬────────────────────────────────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
┌──────────────────────────┐   ┌──────────────────────────┐
│ 6a. Admin approves       │   │ 6b. Admin rejects        │
│ POST /:id/approve        │   │ POST /:id/reject         │
│                          │   │                          │
│ - Apply field edits      │   │ - Provide reason         │
│ - Transition to SUBMITTED│   │ - Delete draft           │
│ - Email import: APPROVED │   │ - Email import: REJECTED │
└──────────┬───────────────┘   └──────────┬───────────────┘
           │                              │
           ▼                              ▼
┌──────────────────────────┐   ┌──────────────────────────┐
│ 7a. Request enters normal│   │ 7b. Logged as false      │
│ FOIA workflow            │   │ positive for AI training │
│                          │   │                          │
│ - Assigned to dept       │   │ - Improves future        │
│ - Due date calculated    │   │   classification         │
│ - Tracking number issued │   │                          │
└──────────────────────────┘   └──────────────────────────┘
```

---

## Configuration

### Environment Variables

```bash
# AI Configuration
ANTHROPIC_API_KEY=sk-ant-...
EMAIL_PARSER_MODEL=claude-sonnet-4-20250514
EMAIL_PARSER_MAX_TOKENS=2048

# S3 Configuration (for attachments)
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_BUCKET=govli-foia-attachments
AWS_S3_REGION=us-west-2

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/govli_foia

# Webhook Authentication
EMAIL_WEBHOOK_API_KEY=your-secure-webhook-key
```

### Webhook Security

To prevent unauthorized access to the ingest endpoint, implement one of:

1. **API Key Authentication**:
   ```typescript
   if (req.headers['x-api-key'] !== process.env.EMAIL_WEBHOOK_API_KEY) {
     return res.status(401).json({ error: 'Unauthorized' });
   }
   ```

2. **IP Whitelist**:
   ```typescript
   const allowedIPs = ['167.89.112.0/22']; // SendGrid IP range
   if (!allowedIPs.includes(req.ip)) {
     return res.status(403).json({ error: 'Forbidden' });
   }
   ```

3. **HMAC Signature Verification** (SendGrid):
   ```typescript
   const signature = req.headers['x-twilio-email-event-webhook-signature'];
   if (!verifySignature(req.body, signature)) {
     return res.status(401).json({ error: 'Invalid signature' });
   }
   ```

---

## AI Parsing Examples

### Example 1: Clear FOIA Request

**Input Email**:
```
From: jane.smith@example.com
To: import@cityname.govli.ai
Subject: FOIA Request - City Council Meeting Minutes

Dear FOIA Officer,

Pursuant to the Freedom of Information Act, I am requesting copies of all City Council meeting minutes from January 1, 2023 through December 31, 2023.

Please provide these documents in PDF format.

Thank you,
Jane Smith
jane.smith@example.com
(555) 123-4567
```

**AI Response**:
```json
{
  "is_foia_request": true,
  "requester_name": "Jane Smith",
  "requester_email": "jane.smith@example.com",
  "requester_phone": "(555) 123-4567",
  "requester_organization": null,
  "request_description": "All City Council meeting minutes from January 1, 2023 through December 31, 2023 in PDF format",
  "date_range_mentioned": "January 1, 2023 - December 31, 2023",
  "departments_mentioned": ["City Council"],
  "record_types_mentioned": ["Meeting Minutes"],
  "urgency_indicators": [],
  "confidence": 0.98
}
```

### Example 2: Spam Email

**Input Email**:
```
From: marketing@example.com
To: import@cityname.govli.ai
Subject: Special Offer - 50% Off!

Get 50% off on our amazing products! Click here now!

Limited time offer. Don't miss out!
```

**AI Response**:
```json
{
  "is_foia_request": false,
  "requester_name": null,
  "requester_email": "marketing@example.com",
  "requester_phone": null,
  "requester_organization": null,
  "request_description": "Marketing email",
  "date_range_mentioned": null,
  "departments_mentioned": [],
  "record_types_mentioned": [],
  "urgency_indicators": [],
  "confidence": 0.02
}
```

### Example 3: Ambiguous Request (Low Confidence)

**Input Email**:
```
From: concerned.citizen@example.com
To: import@cityname.govli.ai
Subject: Question about city budget

Hi,

I'm curious about how the city spends its money. Can you tell me more?

Thanks
```

**AI Response**:
```json
{
  "is_foia_request": true,
  "requester_name": null,
  "requester_email": "concerned.citizen@example.com",
  "requester_phone": null,
  "requester_organization": null,
  "request_description": "Information about city budget and spending",
  "date_range_mentioned": null,
  "departments_mentioned": ["Finance"],
  "record_types_mentioned": ["Budget"],
  "urgency_indicators": [],
  "confidence": 0.55
}
```

**Note**: This email would create a draft request due to `is_foia_request: true`, but the low confidence score (0.55) signals to admins that this needs careful review. The admin might reject it as too vague or contact the requester for clarification.

---

## Quality Monitoring

### Metrics to Track

1. **False Positive Rate**: Percentage of emails classified as FOIA but rejected by admins
   - **Target**: < 10%
   - **Action if high**: Review rejected emails, retrain prompts

2. **Average Confidence Score**: Mean confidence across all classifications
   - **Target**: > 0.80
   - **Action if low**: Review low-confidence emails, improve prompts

3. **Pending Review Queue**: Number of drafts awaiting admin action
   - **Target**: < 10 at any time
   - **Action if high**: Increase admin staffing or review process

4. **Approval Rate**: Percentage of pending reviews that are approved
   - **Target**: > 85%
   - **Action if low**: Investigate AI classification quality

### SQL Queries for Monitoring

```sql
-- False positive rate
SELECT
  ROUND((COUNT(*) FILTER (WHERE is_foia = true AND status = 'REJECTED')::DECIMAL /
         NULLIF(COUNT(*) FILTER (WHERE is_foia = true), 0) * 100), 2) as false_positive_rate
FROM "FoiaEmailImports"
WHERE tenant_id = 'your-tenant-id';

-- Low confidence emails needing review
SELECT * FROM get_low_confidence_imports('your-tenant-id', 0.7);

-- Pending review count
SELECT get_pending_email_imports('your-tenant-id');
```

---

## Troubleshooting

### Email Not Processed

**Symptom**: Email sent to `import@cityname.govli.ai` but no draft created.

**Possible Causes**:
1. **Invalid subdomain**: Verify tenant exists with matching subdomain
   ```sql
   SELECT * FROM "Tenants" WHERE subdomain = 'cityname' AND is_active = true;
   ```

2. **Webhook not configured**: Check SendGrid/SES settings

3. **AI classified as non-FOIA**: Check `FoiaEmailImports` table
   ```sql
   SELECT * FROM "FoiaEmailImports"
   WHERE to_email = 'import@cityname.govli.ai'
   ORDER BY created_at DESC;
   ```

### High False Positive Rate

**Symptom**: Many emails classified as FOIA but rejected by admins.

**Solutions**:
1. **Review rejected emails**: Look for patterns in misclassifications
2. **Update AI prompt**: Add examples of non-FOIA emails to system prompt
3. **Adjust confidence threshold**: Consider only creating drafts for confidence > 0.70

### Attachments Not Uploading

**Symptom**: Email processed but attachments missing.

**Possible Causes**:
1. **File too large**: Check for >25MB attachments in logs
2. **Dangerous file type**: Check for blocked extensions (.exe, .bat)
3. **S3 permissions**: Verify AWS credentials and bucket permissions

---

## Future Enhancements

- [ ] **Auto-assignment**: Assign requests to departments based on `departments_mentioned`
- [ ] **Duplicate detection**: Check for similar requests before creating draft
- [ ] **Auto-approval**: Automatically approve high-confidence requests (>0.95)
- [ ] **Reply automation**: Send auto-reply to requester confirming receipt
- [ ] **Multi-language support**: Parse emails in Spanish, French, etc.
- [ ] **Custom prompts**: Allow tenants to customize AI parsing prompts
- [ ] **Training mode**: Collect feedback to fine-tune AI model
- [ ] **Batch import**: Process multiple emails in single API call

---

## License

Part of the Govli FOIA Management System. All rights reserved.
