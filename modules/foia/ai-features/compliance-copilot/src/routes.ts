/**
 * AI-14: Compliance Copilot Routes
 */

import { Router } from 'express';
import * as handlers from './handlers';

const router = Router();

// Main chat endpoint
router.post('/copilot/message', handlers.sendMessage);

// History and session management
router.get('/copilot/history/:sessionId', handlers.getHistory);
router.get('/copilot/sessions', handlers.listSessions);

// Quick actions
router.post('/copilot/quick/check-exemption', handlers.checkExemption);
router.post('/copilot/quick/draft-extension', handlers.draftExtension);
router.post('/copilot/quick/explain-deadline', handlers.explainDeadline);

export default router;
