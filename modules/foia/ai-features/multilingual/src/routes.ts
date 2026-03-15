/**
 * Govli AI FOIA Module - Multilingual Processing Routes
 * AI-10: Translation API routes
 */

import { Router } from 'express';
import {
  translateRequestIntake,
  translateCommunication,
  translateDocument,
  getSupportedLanguages,
  getTranslationHistory
} from './handlers';

const router = Router();

// Translation endpoints
router.post('/request-intake', translateRequestIntake);
router.post('/communication', translateCommunication);
router.post('/document/:documentId', translateDocument);

// Utility endpoints
router.get('/languages', getSupportedLanguages);
router.get('/history/:foiaRequestId', getTranslationHistory);

export default router;
