/**
 * AI-14: Compliance Copilot Service
 *
 * Provides conversational AI assistance for FOIA officers with:
 * - Jurisdiction-specific legal guidance
 * - Complexity-based model routing (Haiku vs Sonnet)
 * - Request context awareness
 * - Citation tracking and suggested actions
 */

import { Pool } from 'pg';
import { getSharedAIClient } from '@govli/foia-shared';

// Legal keywords that indicate high complexity requiring Sonnet
const LEGAL_KEYWORDS = [
  'litigation',
  'vaughn',
  'deliberative',
  'injunction',
  'in camera',
  'exemption 5',
  'foia lawsuit',
  'court',
  'appeal',
  'privilege',
  'redaction challenge',
  'discovery'
];

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface CopilotContext {
  foia_request_id?: string;
  current_screen: string;
  officer_role: string;
  tenant_id: string;
}

interface CopilotResponse {
  message: string;
  citations: Array<{
    statute: string;
    text: string;
  }>;
  suggested_actions: string[];
  model_used: string;
  session_id: string;
}

interface JurisdictionKnowledge {
  state_name: string;
  statutes: Array<{
    section: string;
    title: string;
    text: string;
  }>;
  exemptions: Array<{
    code: string;
    description: string;
    case_law?: string;
  }>;
  fee_schedule: {
    per_page_copy: number;
    per_hour_search: number;
    minimum_fee: number;
  };
  routing_rules: string[];
}

interface RequestContext {
  id: string;
  tenant_id: string;
  confirmation_number: string;
  description: string;
  status: string;
  deadline: Date;
  assigned_officer: string;
  documents_count: number;
  redaction_status?: string;
  scoping_analysis?: string;
}

interface ExemptionCheck {
  code: string;
  confidence: number;
  reason: string;
}

interface ExtensionDraft {
  extension_notice_text: string;
  new_deadline: Date;
}

interface DeadlineExplanation {
  deadline: Date;
  business_days_remaining: number;
  statutory_basis: string;
  extension_available: boolean;
}

/**
 * CopilotService provides conversational AI assistance for FOIA officers
 */
export class CopilotService {
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  /**
   * Detect complexity based on legal keywords in conversation
   */
  private detectComplexity(messages: Message[]): 'LOW' | 'HIGH' {
    const allText = messages.map(m => m.content.toLowerCase()).join(' ');

    for (const keyword of LEGAL_KEYWORDS) {
      if (allText.includes(keyword.toLowerCase())) {
        return 'HIGH';
      }
    }

    return 'LOW';
  }

  /**
   * Load jurisdiction knowledge from database (cached)
   */
  private async loadJurisdictionKnowledge(tenantId: string): Promise<JurisdictionKnowledge> {
    // TODO: In production, use promptCache for this
    // For now, load from database and mock if not found

    const result = await this.db.query(
      `SELECT jurisdiction_config FROM "FoiaTenants" WHERE id = $1`,
      [tenantId]
    );

    if (result.rows.length > 0 && result.rows[0].jurisdiction_config) {
      return result.rows[0].jurisdiction_config as JurisdictionKnowledge;
    }

    // Mock jurisdiction knowledge for development
    return {
      state_name: 'Texas',
      statutes: [
        {
          section: '§ 552.001',
          title: 'Policy; Construction',
          text: 'Public information is available to the public at a minimum...'
        },
        {
          section: '§ 552.003',
          title: 'Definitions',
          text: 'In this chapter: (1) "Governmental body" means...'
        },
        {
          section: '§ 552.221',
          title: 'Exception: Certain Personnel Information',
          text: 'Information is excepted from disclosure if it is...'
        }
      ],
      exemptions: [
        {
          code: '§ 552.101',
          description: 'Information confidential by law',
          case_law: 'See Texas Attorney General Opinion JC-0351'
        },
        {
          code: '§ 552.108',
          description: 'Certain law enforcement records',
          case_law: 'See Texas Attorney General Opinion GA-0023'
        }
      ],
      fee_schedule: {
        per_page_copy: 0.10,
        per_hour_search: 15.00,
        minimum_fee: 0
      },
      routing_rules: [
        'Requests for personnel records → HR department',
        'Requests involving litigation → Legal counsel review required'
      ]
    };
  }

  /**
   * Load request context if foia_request_id provided
   */
  private async loadRequestContext(requestId: string): Promise<RequestContext | null> {
    const result = await this.db.query(
      `SELECT
        r.id,
        r.tenant_id,
        r.confirmation_number,
        r.description,
        r.status,
        r.deadline,
        u."firstName" || ' ' || u."lastName" as assigned_officer,
        (SELECT COUNT(*) FROM "FoiaDocuments" WHERE request_id = r.id) as documents_count
      FROM "FoiaRequests" r
      LEFT JOIN "Users" u ON r.assigned_to_id = u.id
      WHERE r.id = $1`,
      [requestId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0] as RequestContext;
  }

  /**
   * Build system prompt with jurisdiction knowledge
   */
  private buildSystemPrompt(jurisdiction: JurisdictionKnowledge): string {
    return `You are a FOIA compliance expert for ${jurisdiction.state_name}. You assist FOIA officers with questions about processing public records requests.

RULES:
- Answer using ${jurisdiction.state_name}'s specific FOIA statutes ONLY
- Cite statute section numbers (e.g., § 552.003)
- If a question involves the current request, analyze its specific details
- Be concise: 2-4 sentences for simple questions
- For complex legal questions, provide balanced analysis
- Never give advice that contradicts this jurisdiction
- If you are unsure, say so explicitly
- Suggest concrete next actions when applicable

JURISDICTION KNOWLEDGE:
State: ${jurisdiction.state_name}

Key Statutes:
${jurisdiction.statutes.map(s => `${s.section} - ${s.title}: ${s.text}`).join('\n')}

Common Exemptions:
${jurisdiction.exemptions.map(e => `${e.code}: ${e.description}${e.case_law ? ' (' + e.case_law + ')' : ''}`).join('\n')}

Fee Schedule:
- Per page copy: $${jurisdiction.fee_schedule.per_page_copy}
- Per hour search: $${jurisdiction.fee_schedule.per_hour_search}
- Minimum fee: $${jurisdiction.fee_schedule.minimum_fee}

Routing Rules:
${jurisdiction.routing_rules.join('\n')}

RESPONSE FORMAT:
You MUST respond with valid JSON only (no markdown code fences). Use this exact structure:
{
  "message": "Your response text here",
  "citations": [
    {"statute": "§ 552.003", "text": "Excerpt of relevant statute text"}
  ],
  "suggested_actions": ["Action 1", "Action 2"]
}`;
  }

  /**
   * Main chat endpoint - process conversation and return response
   */
  async chat(
    sessionId: string,
    messages: Message[],
    context: CopilotContext
  ): Promise<CopilotResponse> {
    // Step 1: Load jurisdiction knowledge
    const jurisdiction = await this.loadJurisdictionKnowledge(context.tenant_id);

    // Step 2: Load request context if provided
    let requestContext: RequestContext | null = null;
    if (context.foia_request_id) {
      requestContext = await this.loadRequestContext(context.foia_request_id);
    }

    // Step 3: Detect complexity to route model
    const complexity = this.detectComplexity(messages);
    const modelName = complexity === 'HIGH' ? 'sonnet' : 'haiku';

    // Step 4: Build full conversation with context
    const systemPrompt = this.buildSystemPrompt(jurisdiction);

    let contextMessage = '';
    if (requestContext) {
      contextMessage = `\n\nCURRENT REQUEST CONTEXT:
Confirmation #: ${requestContext.confirmation_number}
Description: ${requestContext.description}
Status: ${requestContext.status}
Deadline: ${requestContext.deadline}
Assigned Officer: ${requestContext.assigned_officer}
Documents Count: ${requestContext.documents_count}
${requestContext.scoping_analysis ? 'Scoping Analysis: ' + requestContext.scoping_analysis : ''}`;
    }

    // Add context to the system prompt
    const fullSystemPrompt = systemPrompt + contextMessage;

    // Step 5: Call Claude
    const aiClient = getSharedAIClient();
    const startTime = Date.now();

    // Build conversation prompt
    const conversationPrompt = messages.map(m => `${m.role}: ${m.content}`).join('\n\n');

    const response = await aiClient.callWithAudit(
      {
        prompt: conversationPrompt,
        maxTokens: 2000,
        temperature: 0.3, // Lower temperature for legal accuracy
        systemPrompt: fullSystemPrompt
      },
      'AI-14',
      context.tenant_id
    );

    const latency = Date.now() - startTime;

    // Step 6: Parse response (strip markdown fences if present)
    let parsedResponse: {
      message: string;
      citations: Array<{ statute: string; text: string }>;
      suggested_actions: string[];
    };

    try {
      let responseText = response.content;

      // Strip markdown code fences if present
      responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '');

      parsedResponse = JSON.parse(responseText);
    } catch (error) {
      // If parsing fails, create a fallback response
      parsedResponse = {
        message: response.content,
        citations: [],
        suggested_actions: []
      };
    }

    // Step 7: Log session
    const totalTokens = response.usage.inputTokens + response.usage.outputTokens;
    await this.logSession(
      sessionId,
      context.tenant_id,
      context.officer_role,
      [...messages, { role: 'assistant', content: parsedResponse.message }],
      modelName,
      totalTokens,
      latency
    );

    return {
      message: parsedResponse.message,
      citations: parsedResponse.citations || [],
      suggested_actions: parsedResponse.suggested_actions || [],
      model_used: modelName,
      session_id: sessionId
    };
  }

  /**
   * Log copilot session to database
   */
  private async logSession(
    sessionId: string,
    tenantId: string,
    officerId: string,
    messages: Message[],
    modelUsed: string,
    totalTokens: number,
    latency: number
  ): Promise<void> {
    // Estimate cost based on model and tokens
    const costPerToken = modelUsed === 'sonnet' ? 0.000003 : 0.00000025; // Sonnet: $3/1M, Haiku: $0.25/1M
    const totalCost = totalTokens * costPerToken;

    await this.db.query(
      `INSERT INTO "FoiaCopilotSessions"
        (id, session_id, tenant_id, officer_id, messages, model_used, total_tokens, total_cost, latency_ms, created_at, updated_at)
      VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      ON CONFLICT (session_id) DO UPDATE SET
        messages = $4,
        model_used = $5,
        total_tokens = "FoiaCopilotSessions".total_tokens + $6,
        total_cost = "FoiaCopilotSessions".total_cost + $7,
        updated_at = NOW()`,
      [sessionId, tenantId, officerId, JSON.stringify(messages), modelUsed, totalTokens, totalCost, latency]
    );
  }

  /**
   * Get conversation history for a session
   */
  async getHistory(sessionId: string): Promise<Message[]> {
    const result = await this.db.query(
      `SELECT messages FROM "FoiaCopilotSessions" WHERE session_id = $1`,
      [sessionId]
    );

    if (result.rows.length === 0) {
      return [];
    }

    return result.rows[0].messages as Message[];
  }

  /**
   * List all copilot sessions for a tenant
   */
  async listSessions(
    tenantId: string,
    filters?: {
      officer_id?: string;
      date_from?: Date;
      date_to?: Date;
      model_used?: string;
    }
  ): Promise<Array<{
    session_id: string;
    officer_id: string;
    message_count: number;
    model_used: string;
    total_tokens: number;
    total_cost: number;
    created_at: Date;
    updated_at: Date;
  }>> {
    let query = `
      SELECT
        session_id,
        officer_id,
        jsonb_array_length(messages) as message_count,
        model_used,
        total_tokens,
        total_cost,
        created_at,
        updated_at
      FROM "FoiaCopilotSessions"
      WHERE tenant_id = $1
    `;
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (filters?.officer_id) {
      query += ` AND officer_id = $${paramIndex}`;
      params.push(filters.officer_id);
      paramIndex++;
    }

    if (filters?.date_from) {
      query += ` AND created_at >= $${paramIndex}`;
      params.push(filters.date_from);
      paramIndex++;
    }

    if (filters?.date_to) {
      query += ` AND created_at <= $${paramIndex}`;
      params.push(filters.date_to);
      paramIndex++;
    }

    if (filters?.model_used) {
      query += ` AND model_used = $${paramIndex}`;
      params.push(filters.model_used);
      paramIndex++;
    }

    query += ` ORDER BY updated_at DESC`;

    const result = await this.db.query(query, params);
    return result.rows;
  }

  /**
   * QUICK ACTION: Check likely exemptions for text snippet
   */
  async checkExemption(textSnippet: string, tenantId: string): Promise<ExemptionCheck[]> {
    const jurisdiction = await this.loadJurisdictionKnowledge(tenantId);

    const aiClient = getSharedAIClient();
    const prompt = `Analyze this text snippet from a public record and identify likely FOIA exemptions under ${jurisdiction.state_name} law.

Text snippet: "${textSnippet}"

Available exemptions:
${jurisdiction.exemptions.map(e => `${e.code}: ${e.description}`).join('\n')}

Respond with JSON only (no markdown):
{
  "exemptions": [
    {"code": "§ 552.101", "confidence": 0.85, "reason": "Contains information confidential by law"}
  ]
}`;

    const response = await aiClient.callWithAudit(
      {
        prompt: prompt,
        maxTokens: 1000,
        temperature: 0.2,
        systemPrompt: 'You are a FOIA exemption analyzer.'
      },
      'AI-14',
      tenantId
    );

    try {
      let responseText = response.content.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      const parsed = JSON.parse(responseText);
      return parsed.exemptions || [];
    } catch (error) {
      return [];
    }
  }

  /**
   * QUICK ACTION: Draft extension notice
   */
  async draftExtension(requestId: string, reason: string): Promise<ExtensionDraft> {
    const requestContext = await this.loadRequestContext(requestId);
    if (!requestContext) {
      throw new Error('Request not found');
    }

    const aiClient = getSharedAIClient();
    const prompt = `Draft a FOIA extension notice for this request:

Request: ${requestContext.confirmation_number}
Description: ${requestContext.description}
Current Deadline: ${requestContext.deadline}
Extension Reason: ${reason}

The notice should:
1. Be professional and cite proper statutory authority
2. Explain the reason for extension clearly
3. Provide new deadline (add 10 business days)
4. Include contact information for questions

Respond with JSON only (no markdown):
{
  "extension_notice_text": "Full text of the notice...",
  "new_deadline": "2026-04-15"
}`;

    const response = await aiClient.callWithAudit(
      {
        prompt: prompt,
        maxTokens: 1500,
        temperature: 0.5,
        systemPrompt: 'You are a FOIA extension notice drafter.'
      },
      'AI-14',
      requestContext.tenant_id
    );

    try {
      let responseText = response.content.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      const parsed = JSON.parse(responseText);
      return {
        extension_notice_text: parsed.extension_notice_text,
        new_deadline: new Date(parsed.new_deadline)
      };
    } catch (error) {
      throw new Error('Failed to parse extension draft response');
    }
  }

  /**
   * QUICK ACTION: Explain deadline for request
   */
  async explainDeadline(requestId: string): Promise<DeadlineExplanation> {
    const requestContext = await this.loadRequestContext(requestId);
    if (!requestContext) {
      throw new Error('Request not found');
    }

    // Calculate business days remaining
    const today = new Date();
    const deadline = new Date(requestContext.deadline);
    const businessDaysRemaining = this.calculateBusinessDays(today, deadline);

    return {
      deadline: deadline,
      business_days_remaining: businessDaysRemaining,
      statutory_basis: '§ 552.221 - Response deadline is 10 business days from receipt',
      extension_available: businessDaysRemaining > 0
    };
  }

  /**
   * Calculate business days between two dates
   */
  private calculateBusinessDays(startDate: Date, endDate: Date): number {
    let count = 0;
    const current = new Date(startDate);

    while (current <= endDate) {
      const dayOfWeek = current.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Not Sunday (0) or Saturday (6)
        count++;
      }
      current.setDate(current.getDate() + 1);
    }

    return count;
  }
}
