# AI-10: Multilingual Processing

## Overview

The Multilingual Processing feature enables FOIA requesters to submit requests and receive communications in 10 different languages. Using Claude AI for translation, the system automatically detects languages, translates content, and tracks translation quality with professional review workflows.

## Supported Languages

- 🇺🇸 **English** (en) - Default
- 🇪🇸 **Spanish** (es) - Español
- 🇨🇳 **Chinese** (zh) - 中文
- 🇻🇳 **Vietnamese** (vi) - Tiếng Việt
- 🇫🇷 **French** (fr) - Français
- 🇸🇦 **Arabic** (ar) - العربية (with RTL support)
- 🇵🇭 **Filipino** (tl) - Tagalog
- 🇰🇷 **Korean** (ko) - 한국어
- 🇷🇺 **Russian** (ru) - Русский
- 🇧🇷 **Portuguese** (pt) - Português

## Features

### Three-Layer Translation Architecture

1. **Request Intake Translation**
   - Auto-detect language of submitted requests
   - Translate to English for staff processing
   - Preserve original text alongside translation
   - Flag low-confidence translations for professional review

2. **Communication Translation**
   - Translate outgoing communications to requester's language
   - Context-aware translation by communication type:
     - Acknowledgments
     - Status updates
     - Clarification requests
     - Final responses
   - Professional, clear government communication tone

3. **Document Translation**
   - Chunked translation for large documents (3000 chars/chunk)
   - Maintain formatting and context
   - Average confidence scoring across chunks
   - Review workflow for complex documents

### Quality Assurance

- **Confidence Scoring**: AI-generated confidence (0.0-1.0)
- **Review Thresholds**:
  - Requests: < 0.85 confidence → Review flagged
  - Documents: < 0.80 confidence → Review flagged
- **Professional Review Workflow**: Staff can approve/reject translations
- **Translation Notes**: AI provides notes on ambiguities or challenges
- **Quality Metrics Dashboard**: Track accuracy by language pair

## Architecture

### Backend Components

1. **TranslationService** (`src/services/translationService.ts`)
   - `detectLanguage()` - Auto-detect language with confidence
   - `translateRequest()` - Translate FOIA request descriptions
   - `translateCommunication()` - Translate outgoing communications
   - `translateDocument()` - Chunked document translation
   - Automatic review flagging based on confidence

2. **Handlers** (`src/handlers.ts`)
   - `translateRequestIntake`: POST /ai/translate/request-intake
   - `translateCommunication`: POST /ai/translate/communication
   - `translateDocument`: POST /ai/translate/document/:documentId
   - `getSupportedLanguages`: GET /ai/translate/languages
   - `getTranslationHistory`: GET /ai/translate/history/:foiaRequestId

### Frontend Components

1. **Language Selector** (`frontend/js/language-selector.js`)
   - Dropdown with all 10 languages
   - Persistent language preference (localStorage)
   - Dynamic UI translation
   - RTL support for Arabic
   - Translation button for form fields

2. **I18n System** (`frontend/i18n/*.json`)
   - JSON translation files for each language
   - Nested key structure (e.g., `foia.title`)
   - Parameter replacement (e.g., `{{min}}`, `{{max}}`)
   - Fallback to English if translation missing

### Database Schema

**FoiaTranslations Table:**
```sql
- id: UUID
- foia_request_id: UUID (FK)
- translation_type: REQUEST_INTAKE | COMMUNICATION | DOCUMENT
- source_language: VARCHAR(10)
- target_language: VARCHAR(10)
- original_text: TEXT
- translated_text: TEXT
- confidence: DECIMAL(3,2)
- needs_professional_review: BOOLEAN
- translation_notes: TEXT
- communication_type: VARCHAR(50) (optional)
- document_id: UUID (optional, FK)
- reviewed_by: UUID (optional)
- reviewed_at: TIMESTAMP
- review_notes: TEXT
- approved: BOOLEAN
```

**FoiaRequests Additions:**
```sql
- original_language: VARCHAR(10)
- preferred_language: VARCHAR(10)
- translation_available: BOOLEAN
```

## API Endpoints

### POST /ai/translate/request-intake

Translate incoming FOIA request description.

**Request:**
```json
{
  "foia_request_id": "uuid",
  "description": "Solicito información sobre...",
  "source_language": "es",  // optional (auto-detected)
  "target_language": "en"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "translated_text": "I request information about...",
    "source_language": "es",
    "target_language": "en",
    "confidence": 0.92,
    "needs_professional_review": false,
    "translation_notes": null
  }
}
```

### POST /ai/translate/communication

Translate outgoing communication.

**Request:**
```json
{
  "foia_request_id": "uuid",
  "communication_text": "Your request has been received and is being processed.",
  "target_language": "es",
  "communication_type": "acknowledgment"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "translation_id": "uuid",
    "translated_text": "Su solicitud ha sido recibida y está siendo procesada.",
    "source_language": "en",
    "target_language": "es",
    "confidence": 0.95,
    "needs_professional_review": false
  }
}
```

### POST /ai/translate/document/:documentId

Translate document content.

**Request:**
```json
{
  "source_language": "es",  // optional
  "target_language": "en"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "translation_id": "uuid",
    "document_id": "uuid",
    "translated_text": "Translated document content...",
    "confidence": 0.88,
    "needs_professional_review": false,
    "translation_notes": "Some technical terms may need verification"
  }
}
```

### GET /ai/translate/languages

Get list of supported languages.

**Response:**
```json
{
  "success": true,
  "data": {
    "languages": [
      { "code": "en", "name": "English" },
      { "code": "es", "name": "Español (Spanish)" },
      ...
    ],
    "total": 10
  }
}
```

### GET /ai/translate/history/:foiaRequestId

Get translation history for a request.

**Response:**
```json
{
  "success": true,
  "data": {
    "translations": [
      {
        "id": "uuid",
        "translation_type": "REQUEST_INTAKE",
        "source_language": "es",
        "target_language": "en",
        "confidence": 0.92,
        "needs_professional_review": false,
        "created_at": "2026-03-13T10:00:00Z"
      }
    ],
    "total": 1
  }
}
```

## Frontend Integration

### HTML Setup

```html
<!-- Include language selector CSS -->
<link rel="stylesheet" href="/css/language-selector.css">

<!-- Include language selector script -->
<script src="/js/language-selector.js"></script>

<!-- Language selector container -->
<div id="languageSelectorHeader" class="language-selector-container"></div>

<!-- Translatable content -->
<h1 data-i18n="foia.title">FOIA Request Portal</h1>
<input type="text" data-i18n-placeholder="foia.request_description">
```

### JavaScript Usage

```javascript
// Change language programmatically
Govli.changeLanguage('es');

// Get translated string
const title = Govli.t('foia.title');

// Get translated string with parameters
const error = Govli.t('validation.min_length', { min: 10 });

// Add translation button to form field
Govli.addTranslationButton('descriptionField');

// Listen for language changes
window.addEventListener('languageChanged', (e) => {
  console.log('Language changed to:', e.detail.language);
});
```

## Professional Review Workflow

1. **Automatic Flagging**
   - Low confidence translations automatically flagged
   - View in staff dashboard: `RequestsNeedingTranslationReview`

2. **Review Process**
   ```sql
   UPDATE "FoiaTranslations"
   SET reviewed_by = 'staff-user-id',
       reviewed_at = NOW(),
       approved = true,
       review_notes = 'Translation verified as accurate'
   WHERE id = 'translation-id';
   ```

3. **Quality Metrics**
   ```sql
   SELECT * FROM "TranslationQualityMetrics"
   WHERE source_language = 'es' AND target_language = 'en';
   ```

## Configuration

No additional configuration required. Uses:
- Shared AI client from `@govli/foia-shared`
- Existing database connection pool
- Standard Express middleware

## Database Migration

Apply migration:
```bash
psql -d your_database -f modules/foia/migrations/016_multilingual.sql
```

Creates:
- `FoiaTranslations` table
- Translation tracking columns in `FoiaRequests`
- `TranslationQualityMetrics` view
- `RequestsNeedingTranslationReview` view
- Automatic flagging triggers

## Testing

Run tests:
```bash
cd modules/foia/ai-features/multilingual
npm test
```

Test scenarios:
- Language detection (10 languages)
- Request translation with auto-detection
- Communication translation by type
- Document chunking and translation
- Confidence scoring and review flags
- I18n file loading
- Language selector functionality

## Best Practices

### For Agencies

1. **Monitor Translation Quality**: Review flagged translations promptly
2. **Track Patterns**: Identify commonly problematic terms or phrases
3. **Professional Review**: Have bilingual staff review critical communications
4. **Cultural Sensitivity**: Be aware of cultural nuances in different languages
5. **Legal Accuracy**: Ensure legal terms are translated correctly

### For Developers

1. **Always Preserve Original**: Store both original and translated text
2. **Confidence Thresholds**: Tune based on your quality requirements
3. **Chunk Size**: Adjust 3000-char chunks if needed for your documents
4. **Fallback to English**: Always provide English fallback in UI
5. **RTL Support**: Test Arabic interface thoroughly
6. **Character Encoding**: Ensure UTF-8 support throughout

## Security Considerations

- **No PII in Translations**: Don't translate exempt or sensitive content
- **Rate Limiting**: Consider rate limits on translation API endpoints
- **Input Validation**: Sanitize all translated content before display
- **Audit Trail**: All translations logged with confidence scores

## Metrics & Analytics

Track:
- **Usage by Language**: Which languages are most common?
- **Translation Quality**: Average confidence by language pair
- **Review Rates**: % of translations needing professional review
- **Processing Time**: How long do translations take?
- **User Satisfaction**: Did translation help or hinder?

## Roadmap

### Phase 2 Enhancements

- [ ] Voice input for accessibility
- [ ] Contextual translation (preserve FOIA terminology)
- [ ] Translation memory for consistency
- [ ] Machine learning to improve confidence scoring
- [ ] Real-time translation chat support
- [ ] Dialect support (e.g., Cantonese vs. Mandarin)

## Support

- **Documentation**: See README and inline code comments
- **Issues**: File on GitHub repository
- **Translation Quality**: Contact FOIA staff for review

---

**Built with**: Claude 3.5 Sonnet, PostgreSQL, TypeScript, Vanilla JS
**Feature ID**: AI-10
**Status**: Production Ready
