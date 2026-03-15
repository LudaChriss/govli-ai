/**
 * Govli AI FOIA Module - Translation Service
 * AI-powered translation for multilingual FOIA processing
 */

import { getSharedAIClient } from '@govli/foia-shared';

export interface TranslationResult {
  translated_text: string;
  source_language: string;
  target_language: string;
  confidence: number;
  translation_notes?: string;
  needs_professional_review: boolean;
}

export interface LanguageDetectionResult {
  detected_language: string;
  confidence: number;
}

// Supported languages
export const SUPPORTED_LANGUAGES = {
  en: 'English',
  es: 'Español (Spanish)',
  zh: '中文 (Chinese)',
  vi: 'Tiếng Việt (Vietnamese)',
  fr: 'Français (French)',
  ar: 'العربية (Arabic)',
  tl: 'Filipino (Tagalog)',
  ko: '한국어 (Korean)',
  ru: 'Русский (Russian)',
  pt: 'Português (Portuguese)'
};

/**
 * Translation Service
 */
export class TranslationService {
  private tenantId: string;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
  }

  /**
   * Detect the language of a text
   */
  async detectLanguage(text: string): Promise<LanguageDetectionResult> {
    const aiClient = getSharedAIClient();

    const prompt = `Detect the language of the following text and return ONLY a JSON object with the format:
{
  "detected_language": "ISO 639-1 code (e.g., 'es', 'zh', 'en')",
  "confidence": 0.0-1.0
}

Text to analyze:
${text.substring(0, 500)}`;

    try {
      const result = await aiClient.callWithAudit(
        {
          prompt,
          maxTokens: 100,
          temperature: 0.1,
          systemPrompt: 'You are a language detection expert. Return only valid JSON.'
        },
        'AI-10', // Feature ID for Multilingual Processing
        this.tenantId
      );

      // Parse Claude's response
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          detected_language: parsed.detected_language || 'en',
          confidence: parsed.confidence || 0.5
        };
      }
    } catch (error) {
      console.error('Error detecting language:', error);
    }

    // Fallback: assume English
    return {
      detected_language: 'en',
      confidence: 0.5
    };
  }

  /**
   * Translate FOIA request text
   */
  async translateRequest(
    text: string,
    sourceLanguage?: string,
    targetLanguage: string = 'en'
  ): Promise<TranslationResult> {
    // Detect language if not provided
    if (!sourceLanguage) {
      const detection = await this.detectLanguage(text);
      sourceLanguage = detection.detected_language;

      // If already in target language, no translation needed
      if (sourceLanguage === targetLanguage) {
        return {
          translated_text: text,
          source_language: sourceLanguage,
          target_language: targetLanguage,
          confidence: 1.0,
          needs_professional_review: false
        };
      }
    }

    const aiClient = getSharedAIClient();

    const prompt = `Translate the following FOIA request description from ${this.getLanguageName(sourceLanguage)} to ${this.getLanguageName(targetLanguage)}.

IMPORTANT:
- Preserve meaning precisely — this is a legal request
- Maintain all proper nouns, dates, and specific references
- If any terms are ambiguous or have multiple meanings, note them in translation_notes
- Be literal and accurate, not interpretive

Return ONLY a JSON object with this format:
{
  "translated_text": "The translated text here",
  "source_language": "${sourceLanguage}",
  "confidence": 0.0-1.0,
  "translation_notes": "Any ambiguities or notes (null if none)"
}

Text to translate:
${text}`;

    try {
      const result = await aiClient.callWithAudit(
        {
          prompt,
          maxTokens: 2000,
          temperature: 0.2,
          systemPrompt: 'You are a professional legal translator. Accuracy is critical. Return only valid JSON.'
        },
        'AI-10',
        this.tenantId
      );

      // Parse Claude's response
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        const confidence = parsed.confidence || 0.75;
        const needsReview = confidence < 0.85;

        return {
          translated_text: parsed.translated_text || text,
          source_language: sourceLanguage,
          target_language: targetLanguage,
          confidence,
          translation_notes: parsed.translation_notes || undefined,
          needs_professional_review: needsReview
        };
      }
    } catch (error) {
      console.error('Error translating request:', error);
    }

    // Fallback: return original with low confidence
    return {
      translated_text: text,
      source_language: sourceLanguage,
      target_language: targetLanguage,
      confidence: 0.0,
      translation_notes: 'Translation failed - original text preserved',
      needs_professional_review: true
    };
  }

  /**
   * Translate outbound communication to requester's language
   */
  async translateCommunication(
    text: string,
    targetLanguage: string,
    communicationType: 'acknowledgment' | 'status_update' | 'clarification' | 'response' | 'other'
  ): Promise<TranslationResult> {
    const aiClient = getSharedAIClient();

    const contextualGuidance = this.getCommunicationGuidance(communicationType);

    const prompt = `Translate the following ${communicationType.replace('_', ' ')} from English to ${this.getLanguageName(targetLanguage)}.

${contextualGuidance}

Return ONLY a JSON object:
{
  "translated_text": "The translated text here",
  "source_language": "en",
  "confidence": 0.0-1.0,
  "translation_notes": "Any notes (null if none)"
}

Text to translate:
${text}`;

    try {
      const result = await aiClient.callWithAudit(
        {
          prompt,
          maxTokens: 2000,
          temperature: 0.2,
          systemPrompt: 'You are a professional translator for government communications. Be clear, respectful, and accurate. Return only valid JSON.'
        },
        'AI-10',
        this.tenantId
      );

      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        return {
          translated_text: parsed.translated_text || text,
          source_language: 'en',
          target_language: targetLanguage,
          confidence: parsed.confidence || 0.75,
          translation_notes: parsed.translation_notes || undefined,
          needs_professional_review: (parsed.confidence || 0.75) < 0.85
        };
      }
    } catch (error) {
      console.error('Error translating communication:', error);
    }

    // Fallback
    return {
      translated_text: text,
      source_language: 'en',
      target_language: targetLanguage,
      confidence: 0.0,
      translation_notes: 'Translation failed - original English text preserved',
      needs_professional_review: true
    };
  }

  /**
   * Translate document in chunks (for large documents)
   */
  async translateDocument(
    text: string,
    sourceLanguage?: string,
    targetLanguage: string = 'en'
  ): Promise<TranslationResult> {
    // Detect language if not provided
    if (!sourceLanguage) {
      const detection = await this.detectLanguage(text);
      sourceLanguage = detection.detected_language;
    }

    // If already in target language, no translation needed
    if (sourceLanguage === targetLanguage) {
      return {
        translated_text: text,
        source_language: sourceLanguage,
        target_language: targetLanguage,
        confidence: 1.0,
        needs_professional_review: false
      };
    }

    // Split into chunks (max 3000 chars per chunk)
    const chunks = this.splitIntoChunks(text, 3000);
    const translatedChunks: string[] = [];
    let totalConfidence = 0;
    let allNotes: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunkResult = await this.translateChunk(
        chunks[i],
        sourceLanguage,
        targetLanguage,
        i + 1,
        chunks.length
      );

      translatedChunks.push(chunkResult.translated_text);
      totalConfidence += chunkResult.confidence;

      if (chunkResult.translation_notes) {
        allNotes.push(`Chunk ${i + 1}: ${chunkResult.translation_notes}`);
      }

      // Small delay to avoid rate limiting
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    const avgConfidence = totalConfidence / chunks.length;
    const needsReview = avgConfidence < 0.80; // Lower threshold for documents

    return {
      translated_text: translatedChunks.join('\n\n'),
      source_language: sourceLanguage,
      target_language: targetLanguage,
      confidence: avgConfidence,
      translation_notes: allNotes.length > 0 ? allNotes.join('; ') : undefined,
      needs_professional_review: needsReview
    };
  }

  /**
   * Split text into chunks
   */
  private splitIntoChunks(text: string, maxChunkSize: number): string[] {
    const chunks: string[] = [];
    const paragraphs = text.split('\n\n');
    let currentChunk = '';

    for (const paragraph of paragraphs) {
      if ((currentChunk + paragraph).length > maxChunkSize && currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = paragraph;
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  /**
   * Translate a single chunk
   */
  private async translateChunk(
    chunk: string,
    sourceLanguage: string,
    targetLanguage: string,
    chunkNum: number,
    totalChunks: number
  ): Promise<TranslationResult> {
    const aiClient = getSharedAIClient();

    const prompt = `Translate this document excerpt (chunk ${chunkNum} of ${totalChunks}) from ${this.getLanguageName(sourceLanguage)} to ${this.getLanguageName(targetLanguage)}.

Preserve formatting and meaning precisely.

Return ONLY JSON:
{
  "translated_text": "Translation here",
  "confidence": 0.0-1.0,
  "translation_notes": "Notes or null"
}

Text:
${chunk}`;

    try {
      const result = await aiClient.callWithAudit(
        {
          prompt,
          maxTokens: 2000,
          temperature: 0.2,
          systemPrompt: 'You are a document translator. Be precise and literal. Return only valid JSON.'
        },
        'AI-10',
        this.tenantId
      );

      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        return {
          translated_text: parsed.translated_text || chunk,
          source_language: sourceLanguage,
          target_language: targetLanguage,
          confidence: parsed.confidence || 0.70,
          translation_notes: parsed.translation_notes || undefined,
          needs_professional_review: false
        };
      }
    } catch (error) {
      console.error(`Error translating chunk ${chunkNum}:`, error);
    }

    return {
      translated_text: chunk,
      source_language: sourceLanguage,
      target_language: targetLanguage,
      confidence: 0.0,
      needs_professional_review: true
    };
  }

  /**
   * Get language name from code
   */
  private getLanguageName(code: string): string {
    return SUPPORTED_LANGUAGES[code as keyof typeof SUPPORTED_LANGUAGES] || code;
  }

  /**
   * Get contextual guidance for communication type
   */
  private getCommunicationGuidance(type: string): string {
    const guidance: Record<string, string> = {
      acknowledgment: 'This is a formal acknowledgment of receipt. Use professional, reassuring tone.',
      status_update: 'This is a status update for a pending request. Be clear and informative.',
      clarification: 'This is a request for additional information. Be polite and specific.',
      response: 'This is a final response. Be formal and complete.',
      other: 'This is official government communication. Be professional and clear.'
    };

    return guidance[type] || guidance.other;
  }
}
