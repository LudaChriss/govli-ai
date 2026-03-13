# AI-5: Vaughn Index Generator

**AI-powered generation of formal Vaughn Index documents for FOIA litigation**

## Overview

The Vaughn Index Generator automatically creates formal legal documents required in FOIA litigation. A Vaughn Index describes each withheld document and justifies the exemption claimed. This feature uses Claude 3.5 Sonnet to generate legally compliant entries that meet court standards.

### Key Features

- **AI-Generated Entries**: Claude generates specific, non-conclusory explanations for each withheld document
- **Legal Compliance**: Includes statutory citations, segregability analysis, and document descriptions
- **Edit Tracking**: Full version history for all manual edits by legal counsel
- **PDF + DOCX Output**: Professional documents with cover page, TOC, and declaration page
- **Litigation Hold Integration**: Auto-prompts for Vaughn generation when holds are placed
- **AI Disclaimer**: Required notice on all documents warning of AI assistance

## Database Schema

### FoiaVaughnIndexes
Main index record for each generated Vaughn Index.

| Column | Description |
|--------|-------------|
| `id` | UUID primary key |
| `foia_request_id` | FOIA request reference |
| `request_number` | FOIA tracking number |
| `entry_count` | Number of entries |
| `status` | DRAFT, IN_REVIEW, FINALIZED, FILED, SUPERSEDED |
| `pdf_path` | Generated PDF file path |
| `docx_path` | Generated DOCX file path |
| `litigation_hold_id` | Optional litigation hold reference |
| `model_used` | AI model (claude-3-5-sonnet-20241022) |

### FoiaVaughnEntries
Individual entries within a Vaughn Index (one per withheld document).

| Column | Description |
|--------|-------------|
| `id` | UUID primary key |
| `vaughn_index_id` | Parent index |
| `entry_number` | Sequential number in index |
| `document_description` | Document details without revealing exempt content |
| `exemption_code` | FOIA exemption (b1-b9) |
| `statutory_citation` | Full legal citation |
| `exemption_explanation` | Specific, non-conclusory explanation |
| `segregability_explanation` | Why portions couldn't be released |
| `original_entry` | AI-generated entry (immutable) |
| `edited_entry` | Human-edited version (if modified) |
| `version_history` | JSONB array of all edits |

### FoiaLitigationHolds
Tracks litigation holds on FOIA requests.

| Column | Description |
|--------|-------------|
| `id` | UUID primary key |
| `foia_request_id` | Request under litigation hold |
| `reason` | Reason for hold |
| `placed_by` | User who placed hold |
| `released_at` | When hold was released (null if active) |

## API Endpoints

### Generate Vaughn Index
**`POST /api/ai/vaughn/:foiaRequestId/generate`**

Auth: `foia_supervisor+` (legal counsel)

**Request**:
```json
{
  "litigation_hold_id": "uuid",
  "include_only_document_ids": ["doc-1", "doc-2"],
  "agency_name": "Department of Justice",
  "court_name": "U.S. District Court",
  "case_number": "1:24-cv-12345"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "index": {
      "id": "index-uuid",
      "entry_count": 15,
      "status": "DRAFT",
      "generation_time_ms": 45000
    },
    "entries": [...],
    "generation_summary": {
      "total_entries": 15,
      "documents_processed": 15,
      "model_used": "claude-3-5-sonnet-20241022"
    },
    "download_urls": {
      "pdf": "/api/ai/vaughn/index-uuid/download/pdf",
      "docx": "/api/ai/vaughn/index-uuid/download/docx"
    }
  }
}
```

### Get Vaughn Index
**`GET /api/ai/vaughn/:foiaRequestId/index`**

Retrieve latest Vaughn Index for a FOIA request.

Auth: `foia_supervisor+`

### Edit Entry
**`PUT /api/ai/vaughn/:foiaRequestId/entry/:entryId/edit`**

Edit a Vaughn Index entry. Tracks full version history.

Auth: `foia_supervisor+`

**Request**:
```json
{
  "entry_text": "Updated entry with case law citation (Smith v. Dept. of Justice, 2023)",
  "edit_notes": "Added legal precedent"
}
```

### Regenerate Index
**`POST /api/ai/vaughn/:foiaRequestId/regenerate`**

Create new version of index (marks old as SUPERSEDED).

Auth: `foia_supervisor+`

**Request**:
```json
{
  "include_updated_entries": true
}
```

### Litigation Hold
**`POST /api/ai/vaughn/litigation-hold/:requestId`**

Place litigation hold and prompt for Vaughn generation.

Auth: `foia_supervisor+`

**Request**:
```json
{
  "reason": "Lawsuit filed by requester - Case #1:24-cv-12345"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "hold": {...},
    "vaughn_prompt": {
      "message": "Would you like to generate a Vaughn Index now for this request?",
      "generate_url": "/api/ai/vaughn/request-789/generate",
      "litigation_hold_id": "hold-uuid"
    }
  }
}
```

## AI Integration

### Vaughn Entry Generation

**Model**: Claude 3.5 Sonnet (`claude-3-5-sonnet-20241022`)

**System Prompt**:
```
You are a legal expert specializing in FOIA litigation and Vaughn Index preparation.

A Vaughn Index is a formal legal document required in FOIA litigation. Courts reject
vague or boilerplate entries.

Requirements:
1. DOCUMENT DESCRIPTION: Specific without revealing exempt content
2. EXEMPTION CITATION: Full statutory citation
3. EXEMPTION EXPLANATION: Specific, non-conclusory
4. SEGREGABILITY: Explain why portions cannot be released
```

**User Prompt Structure**:
- Document metadata (type, date, metadata)
- Exemption code claimed
- AI redaction reasoning (context)
- Human review notes

**Output**: JSON with `document_description`, `statutory_citation`, `exemption_explanation`, `segregability_explanation`

### Fallback Handling

If AI generation fails:
- Creates placeholder entry with `[ERROR]` marker
- Includes document metadata
- Requires manual completion by legal counsel
- Entry clearly marked as needing attention

## Document Generation

### PDF Structure

1. **AI Disclaimer** (required on all pages)
2. **Cover Page** (optional)
   - Agency name
   - FOIA request number
   - Requester name
   - Court information (if applicable)
3. **Table of Contents** (optional)
   - Entry numbers
   - Document types
   - Exemptions
4. **Vaughn Entries** (required)
   - Sequential numbering
   - Full entry details
   - Edit tracking notes
5. **Declaration Page** (optional)
   - Legal declaration template
   - Signature placeholder

### DOCX Backup

Generated alongside PDF for editing in Microsoft Word.

## Usage Example

```typescript
import { VaughnService } from './vaughn/services/vaughnService';
import { VaughnDocumentGenerator } from './vaughn/services/documentGenerator';

const vaughnService = new VaughnService(db);
const documentGenerator = new VaughnDocumentGenerator();

// Generate Vaughn Index
const result = await vaughnService.generateVaughnIndex(
  tenantId,
  userId,
  {
    foia_request_id: requestId,
    litigation_hold_id: holdId
  }
);

// Generate PDF
const pdfPath = await documentGenerator.generatePDF(
  result.index,
  result.entries,
  {
    include_cover_page: true,
    include_table_of_contents: true,
    include_declaration_page: true,
    agency_name: 'Department of Justice',
    agency_address: '950 Pennsylvania Avenue NW'
  }
);
```

## Testing

Run tests:
```bash
npm test modules/foia/ai-features/vaughn/__tests__/vaughn.test.ts
```

### Test Coverage

- ✅ Generate Vaughn Index with multiple entries
- ✅ Error handling for no withheld documents
- ✅ AI generation failure handling (placeholder entries)
- ✅ Retrieve Vaughn Index with entries
- ✅ Edit entry with version tracking
- ✅ PDF generation with all sections
- ✅ DOCX backup generation

## Legal Requirements

### Vaughn Index Standards

Per federal case law, Vaughn Index entries must:

1. **Be Specific**: No boilerplate language
2. **Be Non-Conclusory**: Explain *why*, not just *what*
3. **Address Each Document**: Individual analysis, not category-wide
4. **Address Segregability**: Explain why portions cannot be separated
5. **Include Legal Citations**: Full statutory references

### AI Disclaimer

**REQUIRED** on all generated documents:

```
⚠️  IMPORTANT: This Vaughn Index was AI-assisted.

Legal counsel must:
✓ Review all entries for accuracy
✓ Verify statutory citations
✓ Ensure explanations are specific and non-conclusory
✓ Confirm segregability analyses meet legal standards
✓ Certify accuracy before filing
```

## Best Practices

### For Legal Counsel

1. **Always Review**: Never file AI-generated entries without review
2. **Edit Liberally**: Use the edit feature to refine entries
3. **Add Case Law**: Strengthen entries with legal precedent
4. **Check Segregability**: Ensure analyses are document-specific
5. **Version Control**: Use edit notes to track reasoning

### For FOIA Officers

1. **Provide Context**: Include detailed redaction notes for AI
2. **Quality Input**: Better redaction reasoning = better Vaughn entries
3. **Flag Issues**: Mark complex exemptions for legal review
4. **Document Links**: Ensure proper linking between redactions and source documents

## Migration

Apply migration:
```bash
psql -d your_database -f modules/foia/migrations/013_vaughn_indexes.sql
```

## Configuration

No environment variables required. Uses shared AI client from `@govli/foia-shared`.

## Troubleshooting

### "No withheld documents found"

- Verify redaction decisions are approved
- Check that exemption codes are properly assigned
- Ensure documents are linked to the FOIA request

### AI generation errors

- Check Claude API credentials
- Verify shared AI client configuration
- Review logs for specific error messages
- Placeholder entries created automatically

### PDF/DOCX not generating

- Verify output directory exists and is writable
- Check file system permissions
- Review document generator logs

## Support

- Documentation: See README.md and migration SQL comments
- Issues: File on GitHub repository
- Questions: Contact FOIA module maintainers
