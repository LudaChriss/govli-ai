// @govli/foia-multilingual
// Built by Govli AI FOIA Build Guide v2/v3

/**
 * AI-10: Multilingual Processing
 * Translation services for FOIA requests in 10 languages
 */

export { default as multilingualRouter } from './routes';
export { TranslationService, SUPPORTED_LANGUAGES } from './services/translationService';
export type { TranslationResult, LanguageDetectionResult } from './services/translationService';
