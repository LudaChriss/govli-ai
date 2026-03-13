/**
 * AI-7: Conversational Request Builder - Test Suite
 */

import { ConversationService } from '../src/services/conversationService';
import { ConversationRateLimiter } from '../src/middleware/rateLimiter';
import { ConversationRequest, DraftRequest } from '../src/types';

// Mock the shared AI client
jest.mock('@govli/foia-shared', () => ({
  getSharedAIClient: jest.fn(),
  emit: jest.fn().mockResolvedValue(undefined)
}));

import { getSharedAIClient } from '@govli/foia-shared';

describe('AI-7: Conversational Request Builder', () => {
  let mockAIClient: any;
  let conversationService: ConversationService;

  const TENANT_ID = 'test-tenant-123';
  const USER_ID = 'user-456';
  const SESSION_ID = 'session-789';

  beforeEach(() => {
    // Mock AI client
    mockAIClient = {
      callWithAudit: jest.fn()
    };
    (getSharedAIClient as jest.Mock).mockReturnValue(mockAIClient);

    conversationService = new ConversationService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================================================
  // ConversationService Tests
  // ==========================================================================

  describe('ConversationService', () => {
    describe('processMessage', () => {
      it('should process initial message and return AI response', async () => {
        const request: ConversationRequest = {
          session_id: SESSION_ID,
          messages: [
            {
              role: 'user',
              content: 'I need police reports from last month'
            }
          ],
          agency_context: {
            agency_name: 'City of Springfield',
            departments: ['Police Department', 'Fire Department']
          }
        };

        mockAIClient.callWithAudit.mockResolvedValueOnce({
          content: JSON.stringify({
            ready_to_submit: false,
            message: 'I can help you with that! What specific incident or time period are you interested in?',
            suggested_follow_up_questions: [
              'All incidents in January',
              'A specific case number',
              'Incidents at a specific location'
            ]
          })
        });

        const response = await conversationService.processMessage(
          request,
          TENANT_ID,
          USER_ID,
          '127.0.0.1'
        );

        expect(response.message).toContain('help you');
        expect(response.ready_to_submit).toBe(false);
        expect(response.suggested_follow_up_questions).toHaveLength(3);
        expect(mockAIClient.callWithAudit).toHaveBeenCalledTimes(1);
        expect(mockAIClient.callWithAudit).toHaveBeenCalledWith(
          expect.objectContaining({
            tenantId: TENANT_ID,
            userId: USER_ID,
            feature: 'ai-7-convo-builder'
          })
        );
      });

      it('should recognize when request is ready to submit', async () => {
        const request: ConversationRequest = {
          session_id: SESSION_ID,
          messages: [
            {
              role: 'user',
              content: 'I need police reports from last month'
            },
            {
              role: 'assistant',
              content: 'What specific incident?'
            },
            {
              role: 'user',
              content: 'All traffic stops on Main Street during January 2024'
            }
          ]
        };

        mockAIClient.callWithAudit.mockResolvedValueOnce({
          content: JSON.stringify({
            ready_to_submit: true,
            message: 'Perfect! I have all the details I need. Here\'s your request:',
            draft_request: {
              description: 'All traffic stop reports on Main Street during January 2024',
              agencies: ['Police Department'],
              date_range_start: '2024-01-01',
              date_range_end: '2024-01-31',
              format_preference: 'electronic'
            }
          })
        });

        const response = await conversationService.processMessage(
          request,
          TENANT_ID,
          USER_ID,
          '127.0.0.1'
        );

        expect(response.ready_to_submit).toBe(true);
        expect(response.draft_request).toBeDefined();
        expect(response.draft_request?.description).toContain('traffic stop');
        expect(response.draft_request?.agencies).toContain('Police Department');
        expect(response.draft_request?.date_range_start).toBe('2024-01-01');
      });

      it('should handle AI response without JSON gracefully', async () => {
        const request: ConversationRequest = {
          session_id: SESSION_ID,
          messages: [
            {
              role: 'user',
              content: 'Hello'
            }
          ]
        };

        // AI returns plain text instead of JSON
        mockAIClient.callWithAudit.mockResolvedValueOnce({
          content: 'Hello! I can help you file a FOIA request. What records are you looking for?'
        });

        const response = await conversationService.processMessage(
          request,
          TENANT_ID,
          USER_ID,
          '127.0.0.1'
        );

        expect(response.message).toContain('help you file');
        expect(response.ready_to_submit).toBe(false);
      });

      it('should throw error when message count exceeds limit', async () => {
        const messages = Array.from({ length: 51 }, (_, i) => ({
          role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
          content: `Message ${i + 1}`
        }));

        const request: ConversationRequest = {
          session_id: SESSION_ID,
          messages
        };

        await expect(
          conversationService.processMessage(request, TENANT_ID, USER_ID, '127.0.0.1')
        ).rejects.toThrow('Conversation exceeded maximum');
      });

      it('should handle AI client errors', async () => {
        const request: ConversationRequest = {
          session_id: SESSION_ID,
          messages: [
            {
              role: 'user',
              content: 'Test'
            }
          ]
        };

        mockAIClient.callWithAudit.mockRejectedValueOnce(
          new Error('AI service unavailable')
        );

        await expect(
          conversationService.processMessage(request, TENANT_ID, USER_ID, '127.0.0.1')
        ).rejects.toThrow('Failed to process conversation message');
      });
    });

    describe('validateDraftRequest', () => {
      it('should validate complete draft request', () => {
        const draft: DraftRequest = {
          description: 'Police reports from January 2024 on Main Street',
          agencies: ['Police Department'],
          date_range_start: '2024-01-01',
          date_range_end: '2024-01-31',
          format_preference: 'electronic'
        };

        const result = conversationService.validateDraftRequest(draft);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should reject draft with too short description', () => {
        const draft: DraftRequest = {
          description: 'Short',
          agencies: ['Police Department']
        };

        const result = conversationService.validateDraftRequest(draft);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Description must be at least 10 characters');
      });

      it('should reject draft with no agencies', () => {
        const draft: DraftRequest = {
          description: 'Police reports from January 2024',
          agencies: []
        };

        const result = conversationService.validateDraftRequest(draft);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('At least one agency/department must be specified');
      });

      it('should reject draft with invalid date range', () => {
        const draft: DraftRequest = {
          description: 'Police reports from January 2024',
          agencies: ['Police Department'],
          date_range_start: '2024-02-01',
          date_range_end: '2024-01-01' // End before start
        };

        const result = conversationService.validateDraftRequest(draft);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Start date must be before end date');
      });
    });

    describe('startSession', () => {
      it('should generate unique session ID', async () => {
        const sessionId1 = await conversationService.startSession(TENANT_ID, '127.0.0.1');
        const sessionId2 = await conversationService.startSession(TENANT_ID, '127.0.0.1');

        expect(sessionId1).toBeDefined();
        expect(sessionId2).toBeDefined();
        expect(sessionId1).not.toBe(sessionId2);
      });
    });
  });

  // ==========================================================================
  // Rate Limiter Tests
  // ==========================================================================

  describe('ConversationRateLimiter', () => {
    let rateLimiter: ConversationRateLimiter;

    beforeEach(() => {
      // Create with low limits for testing
      rateLimiter = new ConversationRateLimiter(3, 1000); // 3 messages per second
    });

    afterEach(() => {
      rateLimiter.destroy();
    });

    it('should allow messages within limit', () => {
      const result1 = rateLimiter.checkLimit('127.0.0.1', SESSION_ID);
      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBe(2);

      const result2 = rateLimiter.checkLimit('127.0.0.1', SESSION_ID);
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(1);

      const result3 = rateLimiter.checkLimit('127.0.0.1', SESSION_ID);
      expect(result3.allowed).toBe(true);
      expect(result3.remaining).toBe(0);
    });

    it('should block messages over limit', () => {
      // Use up limit
      rateLimiter.checkLimit('127.0.0.1', SESSION_ID);
      rateLimiter.checkLimit('127.0.0.1', SESSION_ID);
      rateLimiter.checkLimit('127.0.0.1', SESSION_ID);

      // Next should be blocked
      const result = rateLimiter.checkLimit('127.0.0.1', SESSION_ID);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.reset_at).toBeDefined();
    });

    it('should track different IPs separately', () => {
      rateLimiter.checkLimit('127.0.0.1', SESSION_ID);
      rateLimiter.checkLimit('127.0.0.1', SESSION_ID);
      rateLimiter.checkLimit('127.0.0.1', SESSION_ID);

      // Different IP should have full limit
      const result = rateLimiter.checkLimit('192.168.1.1', SESSION_ID);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2);
    });

    it('should track different sessions separately', () => {
      rateLimiter.checkLimit('127.0.0.1', SESSION_ID);
      rateLimiter.checkLimit('127.0.0.1', SESSION_ID);
      rateLimiter.checkLimit('127.0.0.1', SESSION_ID);

      // Different session should have full limit
      const result = rateLimiter.checkLimit('127.0.0.1', 'session-999');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2);
    });

    it('should reset window after expiration', async () => {
      // Use up limit
      rateLimiter.checkLimit('127.0.0.1', SESSION_ID);
      rateLimiter.checkLimit('127.0.0.1', SESSION_ID);
      rateLimiter.checkLimit('127.0.0.1', SESSION_ID);

      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Should be allowed again
      const result = rateLimiter.checkLimit('127.0.0.1', SESSION_ID);
      expect(result.allowed).toBe(true);
    });
  });
});
