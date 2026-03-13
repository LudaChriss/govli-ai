/**
 * AI-7: Conversational Request Builder - Service Layer
 */

import { getSharedAIClient, emit } from '@govli/foia-shared';
import * as crypto from 'crypto';
import {
  ConversationMessage,
  ConversationRequest,
  ConversationResponse,
  AgencyContext,
  ParsedClaudeResponse,
  DraftRequest,
  ConversationServiceOptions
} from '../types';

/**
 * ConversationService
 * Handles stateless conversation flow for FOIA request building
 */
export class ConversationService {
  private model: string;
  private maxMessagesPerSession: number;

  constructor(options: ConversationServiceOptions = {}) {
    this.model = options.model || 'claude-3-5-sonnet-20241022';
    this.maxMessagesPerSession = options.max_messages_per_session || 50;
  }

  /**
   * Process a conversation message and generate AI response
   */
  async processMessage(
    request: ConversationRequest,
    tenantId?: string,
    userId?: string,
    ipAddress?: string
  ): Promise<ConversationResponse> {
    const { session_id, messages, agency_context } = request;

    // Validate message count
    if (messages.length > this.maxMessagesPerSession) {
      throw new Error(`Conversation exceeded maximum of ${this.maxMessagesPerSession} messages`);
    }

    // Build system prompt
    const systemPrompt = this.buildSystemPrompt(agency_context);

    // Call Claude
    const aiClient = getSharedAIClient();
    const startTime = Date.now();

    try {
      const response = await aiClient.callWithAudit(
        {
          prompt: this.formatConversationHistory(messages),
          systemPrompt,
          maxTokens: 1000,
          temperature: 0.7,
          model: this.model
        },
        'ai-7-convo-builder',
        tenantId || 'public',
        userId
      );

      const responseTime = Date.now() - startTime;

      // Parse Claude's response
      const parsed = this.parseClaudeResponse(response.content);

      // Build response
      const conversationResponse: ConversationResponse = {
        message: parsed.message,
        ready_to_submit: parsed.ready_to_submit,
        draft_request: parsed.draft_request,
        suggested_follow_up_questions: parsed.suggested_follow_up_questions,
        session_id,
        message_count: messages.length + 1
      };

      // Emit analytics event
      await this.emitAnalyticsEvent({
        session_id,
        event_type: parsed.ready_to_submit ? 'draft_ready' : 'message_sent',
        tenant_id: tenantId,
        message_count: messages.length + 1,
        response_time_ms: responseTime,
        ready_to_submit: parsed.ready_to_submit
      });

      return conversationResponse;
    } catch (error: any) {
      console.error('[ConversationService] AI call failed:', error);

      // Emit error event
      await this.emitAnalyticsEvent({
        session_id,
        event_type: 'message_sent',
        tenant_id: tenantId,
        message_count: messages.length + 1,
        error: error.message
      });

      throw new Error('Failed to process conversation message. Please try again.');
    }
  }

  /**
   * Build system prompt for Claude
   */
  private buildSystemPrompt(context?: AgencyContext): string {
    const agencyName = context?.agency_name || 'this agency';
    const departments = context?.departments || [];
    const recordTypes = context?.common_record_types || [];

    let prompt = `You are a friendly, helpful FOIA request assistant for ${agencyName}.

Your job is to help citizens describe what public records they are looking for and build a complete, well-scoped FOIA request.

In 3-5 conversational turns, determine:
1. What records they want (type, subject, content)
2. The time range (if applicable)
3. Which department most likely holds the records
4. Their preferred format (electronic, paper)

GUIDELINES:
- Be friendly and use simple language (grade 6 reading level)
- Never use legal jargon
- If the request is too broad, gently suggest narrowing it with specific options
- Keep responses under 3 sentences
- Be warm and encouraging

When you have enough information to draft a complete request, return a JSON object with:
{
  "ready_to_submit": true,
  "message": "Your friendly message here",
  "draft_request": {
    "description": "Complete description of requested records",
    "agencies": ["Department name(s)"],
    "date_range_start": "YYYY-MM-DD (if applicable)",
    "date_range_end": "YYYY-MM-DD (if applicable)",
    "format_preference": "electronic|paper|either"
  },
  "suggested_follow_up_questions": ["Optional refinement questions"]
}

Before that point, return:
{
  "ready_to_submit": false,
  "message": "Your friendly question or guidance",
  "suggested_follow_up_questions": ["Quick reply option 1", "Quick reply option 2", "Quick reply option 3"]
}`;

    if (departments.length > 0) {
      prompt += `\n\nAvailable departments: ${departments.join(', ')}`;
    }

    if (recordTypes.length > 0) {
      prompt += `\n\nCommon record types: ${recordTypes.join(', ')}`;
    }

    prompt += `\n\nIMPORTANT: Always return valid JSON in your response.`;

    return prompt;
  }

  /**
   * Format conversation history for Claude
   */
  private formatConversationHistory(messages: ConversationMessage[]): string {
    if (messages.length === 0) {
      return 'User is starting a new FOIA request conversation. Greet them warmly and ask what records they are looking for.';
    }

    // Get last user message
    const lastUserMessage = messages[messages.length - 1];

    // Build context from previous messages
    const previousContext = messages.slice(0, -1)
      .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join('\n');

    if (previousContext) {
      return `Previous conversation:\n${previousContext}\n\nUser's latest message: ${lastUserMessage.content}`;
    }

    return `User's message: ${lastUserMessage.content}`;
  }

  /**
   * Parse Claude's JSON response
   */
  private parseClaudeResponse(content: string): ParsedClaudeResponse {
    try {
      // Try to extract JSON from response (Claude might wrap it in markdown or text)
      const jsonMatch = content.match(/\{[\s\S]*\}/);

      if (!jsonMatch) {
        // No JSON found - treat as plain message
        return {
          message: content.trim(),
          ready_to_submit: false,
          suggested_follow_up_questions: []
        };
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        message: parsed.message || content,
        ready_to_submit: parsed.ready_to_submit === true,
        draft_request: parsed.draft_request,
        suggested_follow_up_questions: parsed.suggested_follow_up_questions || []
      };
    } catch (error) {
      console.error('[ConversationService] Failed to parse Claude response:', error);

      // Fallback: return content as message
      return {
        message: content.trim(),
        ready_to_submit: false,
        suggested_follow_up_questions: []
      };
    }
  }

  /**
   * Emit analytics event
   */
  private async emitAnalyticsEvent(data: {
    session_id: string;
    event_type: string;
    tenant_id?: string;
    message_count?: number;
    response_time_ms?: number;
    ready_to_submit?: boolean;
    error?: string;
  }): Promise<void> {
    try {
      await emit({
        id: crypto.randomUUID(),
        tenant_id: data.tenant_id || 'public',
        event_type: `foia.ai.convo-builder.${data.event_type}`,
        entity_id: data.session_id,
        entity_type: 'conversation_session',
        metadata: {
          session_id: data.session_id,
          message_count: data.message_count,
          response_time_ms: data.response_time_ms,
          ready_to_submit: data.ready_to_submit,
          error: data.error
        },
        timestamp: new Date()
      });
    } catch (error) {
      console.error('[ConversationService] Failed to emit analytics event:', error);
      // Don't throw - analytics failures shouldn't break the conversation
    }
  }

  /**
   * Validate draft request completeness
   */
  validateDraftRequest(draft: DraftRequest): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!draft.description || draft.description.trim().length < 10) {
      errors.push('Description must be at least 10 characters');
    }

    if (!draft.agencies || draft.agencies.length === 0) {
      errors.push('At least one agency/department must be specified');
    }

    if (draft.date_range_start && draft.date_range_end) {
      const start = new Date(draft.date_range_start);
      const end = new Date(draft.date_range_end);

      if (start > end) {
        errors.push('Start date must be before end date');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Start a new conversation session
   */
  async startSession(
    tenantId?: string,
    ipAddress?: string
  ): Promise<string> {
    const sessionId = crypto.randomUUID();

    // Emit session started event
    await this.emitAnalyticsEvent({
      session_id: sessionId,
      event_type: 'session_started',
      tenant_id: tenantId,
      message_count: 0
    });

    return sessionId;
  }

  /**
   * Track session completion
   */
  async completeSession(
    sessionId: string,
    submitted: boolean,
    messageCount: number,
    tenantId?: string
  ): Promise<void> {
    await this.emitAnalyticsEvent({
      session_id: sessionId,
      event_type: submitted ? 'request_submitted' : 'session_abandoned',
      tenant_id: tenantId,
      message_count: messageCount
    });
  }
}
