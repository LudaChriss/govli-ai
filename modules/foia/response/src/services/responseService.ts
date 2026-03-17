/**
 * FOIA Response Service
 * Manages response generation, editing, approval, and delivery
 */

import { Pool } from 'pg';
import crypto from 'crypto';
// @ts-ignore
import { diffLines } from 'diff';
import { getSharedAIClient } from '@govli/foia-shared';
import { emit } from '@govli/foia-shared';
import {
  FoiaResponse,
  ResponseType,
  DraftRequest,
  EditRequest,
  ApproveRequest,
  DeliverRequest,
  TemplateData
} from '../types';
import { TemplateService } from './templateService';
import { EmailService } from './emailService';

/**
 * Response Service
 */
export class ResponseService {
  private db: Pool;
  private templateService: TemplateService;
  private emailService: EmailService;

  constructor(db: Pool) {
    this.db = db;
    this.templateService = new TemplateService();
    this.emailService = new EmailService();
  }

  /**
   * Draft a response using AI
   */
  async draftResponse(
    tenant_id: string,
    foia_request_id: string,
    user_id: string,
    request: DraftRequest
  ): Promise<FoiaResponse> {
    // Get FOIA request details
    const requestResult = await this.db.query(
      `SELECT * FROM foia_requests WHERE id = $1 AND tenant_id = $2`,
      [foia_request_id, tenant_id]
    );

    if (requestResult.rows.length === 0) {
      throw new Error('FOIA request not found');
    }

    const foiaRequest = requestResult.rows[0];

    // Get tenant/agency info
    const tenantResult = await this.db.query(
      `SELECT * FROM tenants WHERE id = $1`,
      [tenant_id]
    );

    const tenant = tenantResult.rows[0];

    // Build AI prompt
    const prompt = this.buildAIPrompt(foiaRequest, request, tenant);
    const systemPrompt = this.buildSystemPrompt(request.response_type);

    // Call AI to draft response
    const aiClient = getSharedAIClient();

    const result = await aiClient.callWithAudit(
      {
        prompt,
        systemPrompt,
        maxTokens: 4000,
        model: 'claude-3-5-sonnet-20250122'
      },
      'AI-4', // Response Generation feature
      tenant_id,
      foia_request_id,
      {
        foia_request_id,
        score: 70, // Response generation is high complexity
        factors: {
          date_range_years: 0,
          agency_count: 1,
          estimated_volume: 'MEDIUM',
          requester_category: 'OTHER',
          keyword_complexity: 70
        },
        calculated_at: new Date()
      }
    );

    const body_text = result.content;

    // Create response record
    const responseId = crypto.randomUUID();

    const insertResult = await this.db.query(
      `INSERT INTO foia_responses (
        id, tenant_id, foia_request_id, response_type, status,
        subject, body_text, original_body_text,
        ai_generated, ai_model_used, ai_prompt_tokens, ai_completion_tokens,
        edit_count, appeal_rights_included,
        exemptions_cited, documents_included, fee_amount,
        created_by, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW(), NOW())
      RETURNING *`,
      [
        responseId,
        tenant_id,
        foia_request_id,
        request.response_type,
        'DRAFT',
        `FOIA Response - ${foiaRequest.subject}`,
        body_text,
        body_text, // Store original for edit tracking
        true, // ai_generated
        result.model || 'claude-3-5-sonnet-20250122',
        result.usage?.inputTokens || 0,
        result.usage?.outputTokens || 0,
        0, // edit_count
        true, // appeal_rights_included
        request.exemptions_cited ? JSON.stringify(request.exemptions_cited) : null,
        request.documents_included ? JSON.stringify(request.documents_included) : null,
        request.fee_amount || null,
        user_id
      ]
    );

    const response = insertResult.rows[0] as FoiaResponse;

    // Emit event
    await emit({
      id: crypto.randomUUID(),
      tenant_id,
      event_type: 'foia.response.drafted',
      entity_id: foia_request_id,
      entity_type: 'foia_request',
      user_id,
      metadata: {
        response_id: responseId,
        response_type: request.response_type,
        ai_generated: true
      },
      timestamp: new Date()
    });

    return response;
  }

  /**
   * Build AI prompt for drafting
   */
  private buildAIPrompt(foiaRequest: any, request: DraftRequest, tenant: any): string {
    let prompt = `Draft a formal FOIA response letter for the following request:\n\n`;
    prompt += `Request Subject: ${foiaRequest.subject}\n`;
    prompt += `Request Description: ${foiaRequest.description || 'N/A'}\n`;
    prompt += `Requester: ${foiaRequest.requester_name}\n`;
    prompt += `Agency: ${tenant?.name || 'Government Agency'}\n\n`;

    prompt += `Response Type: ${request.response_type}\n\n`;

    if (request.exemptions_cited && request.exemptions_cited.length > 0) {
      prompt += `Apply the following FOIA exemptions:\n`;
      request.exemptions_cited.forEach(ex => {
        prompt += `- ${ex}\n`;
      });
      prompt += `\n`;
    }

    if (request.documents_included && request.documents_included.length > 0) {
      prompt += `Include these documents in the response:\n`;
      request.documents_included.forEach(doc => {
        prompt += `- ${doc}\n`;
      });
      prompt += `\n`;
    }

    if (request.fee_amount) {
      prompt += `Processing Fee: $${request.fee_amount}\n\n`;
    }

    if (request.additional_context) {
      prompt += `Additional Context:\n${request.additional_context}\n\n`;
    }

    prompt += `Draft a complete, professional FOIA response letter that includes:\n`;
    prompt += `1. Formal greeting and reference to the original request\n`;
    prompt += `2. Clear determination (grant/denial/partial)\n`;
    prompt += `3. Specific exemption citations where applicable\n`;
    prompt += `4. Appeal rights with 20-day timeline\n`;
    prompt += `5. FOIA Public Liaison contact information\n`;
    prompt += `6. Professional closing\n`;

    return prompt;
  }

  /**
   * Build system prompt for AI
   */
  private buildSystemPrompt(responseType: ResponseType): string {
    return `You are a formal FOIA response letter writer for a government agency.

Your role is to draft clear, professional, legally compliant FOIA responses that:
- Use formal government correspondence style
- Cite specific statutory exemptions when withholding information
- Include complete appeal rights language (20 business days to appeal)
- Provide FOIA Public Liaison contact information
- Are factual, neutral, and professional in tone
- Follow FOIA regulatory requirements

When citing exemptions, use specific statutory references (e.g., "5 U.S.C. § 552(b)(5)").

Always include: appeal deadline, appeal address/email, and FOIA Public Liaison contact.

Current response type: ${responseType}

Format the response as a complete letter suitable for mailing or email delivery.`;
  }

  /**
   * Edit a response and track changes
   */
  async editResponse(
    tenant_id: string,
    response_id: string,
    user_id: string,
    edit: EditRequest
  ): Promise<FoiaResponse> {
    // Get current response
    const result = await this.db.query(
      `SELECT r.* FROM foia_responses r
       JOIN foia_requests fr ON fr.id = r.foia_request_id
       WHERE r.id = $1 AND fr.tenant_id = $2`,
      [response_id, tenant_id]
    );

    if (result.rows.length === 0) {
      throw new Error('Response not found');
    }

    const response = result.rows[0];

    if (response.status === 'DELIVERED') {
      throw new Error('Cannot edit delivered response');
    }

    // Calculate edit delta percentage
    const edit_delta_pct = this.calculateEditDelta(
      response.original_body_text || response.body_text,
      edit.body_text
    );

    // Update response
    const updateResult = await this.db.query(
      `UPDATE foia_responses
       SET body_text = $1,
           body_html = $2,
           subject = COALESCE($3, subject),
           exemptions_cited = COALESCE($4, exemptions_cited),
           edit_delta_pct = $5,
           edit_count = edit_count + 1,
           updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [
        edit.body_text,
        edit.body_html,
        edit.subject,
        edit.exemptions_cited ? JSON.stringify(edit.exemptions_cited) : null,
        edit_delta_pct,
        response_id
      ]
    );

    const updatedResponse = updateResult.rows[0] as FoiaResponse;

    // Emit event
    await emit({
      id: crypto.randomUUID(),
      tenant_id,
      event_type: 'foia.response.edited',
      entity_id: response.foia_request_id,
      entity_type: 'foia_request',
      user_id,
      metadata: {
        response_id,
        edit_delta_pct,
        edit_count: updatedResponse.edit_count
      },
      timestamp: new Date()
    });

    return updatedResponse;
  }

  /**
   * Calculate edit delta percentage
   * Measures how much the text has changed from original
   */
  private calculateEditDelta(original: string, edited: string): number {
    const diff = diffLines(original, edited);

    let totalLines = 0;
    let changedLines = 0;

    diff.forEach((part: any) => {
      const lines = part.value.split('\n').filter((l: string) => l.trim().length > 0).length;
      totalLines += lines;

      if (part.added || part.removed) {
        changedLines += lines;
      }
    });

    if (totalLines === 0) return 0;

    const deltaPercent = (changedLines / totalLines) * 100;
    return Math.round(deltaPercent * 100) / 100; // Round to 2 decimals
  }

  /**
   * Approve a response
   */
  async approveResponse(
    tenant_id: string,
    response_id: string,
    user_id: string,
    approval: ApproveRequest
  ): Promise<FoiaResponse> {
    // Get response
    const result = await this.db.query(
      `SELECT r.* FROM foia_responses r
       JOIN foia_requests fr ON fr.id = r.foia_request_id
       WHERE r.id = $1 AND fr.tenant_id = $2`,
      [response_id, tenant_id]
    );

    if (result.rows.length === 0) {
      throw new Error('Response not found');
    }

    const response = result.rows[0];

    if (response.status === 'DELIVERED') {
      throw new Error('Response already delivered');
    }

    // Update status to approved
    const updateResult = await this.db.query(
      `UPDATE foia_responses
       SET status = 'APPROVED',
           approved_by = $1,
           approved_at = NOW(),
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [user_id, response_id]
    );

    const approvedResponse = updateResult.rows[0] as FoiaResponse;

    // Emit event
    await emit({
      id: crypto.randomUUID(),
      tenant_id,
      event_type: 'foia.response.approved',
      entity_id: response.foia_request_id,
      entity_type: 'foia_request',
      user_id,
      metadata: {
        response_id,
        notes: approval.notes
      },
      timestamp: new Date()
    });

    return approvedResponse;
  }

  /**
   * Deliver response via email
   */
  async deliverResponse(
    tenant_id: string,
    response_id: string,
    user_id: string,
    delivery: DeliverRequest
  ): Promise<FoiaResponse> {
    // Get response and request
    const result = await this.db.query(
      `SELECT r.*, fr.requester_email, fr.requester_name
       FROM foia_responses r
       JOIN foia_requests fr ON fr.id = r.foia_request_id
       WHERE r.id = $1 AND fr.tenant_id = $2`,
      [response_id, tenant_id]
    );

    if (result.rows.length === 0) {
      throw new Error('Response not found');
    }

    const response = result.rows[0];

    if (response.status !== 'APPROVED') {
      throw new Error('Response must be approved before delivery');
    }

    const delivery_email = delivery.delivery_email || response.requester_email;

    if (!delivery_email) {
      throw new Error('No delivery email address available');
    }

    let delivery_status = 'PENDING';
    let delivery_error: string | undefined;

    // Send email if delivery method is EMAIL
    if (delivery.delivery_method === 'EMAIL') {
      const emailResult = await this.emailService.sendFoiaResponse(
        delivery_email,
        response.subject,
        response.body_text,
        response.body_html
      );

      if (emailResult.success) {
        delivery_status = 'SENT';
      } else {
        delivery_status = 'FAILED';
        delivery_error = emailResult.error;
      }
    }

    // Update response with delivery info
    const updateResult = await this.db.query(
      `UPDATE foia_responses
       SET status = 'DELIVERED',
           delivered_to = $1,
           delivered_at = NOW(),
           delivery_method = $2,
           delivery_status = $3,
           delivery_error = $4,
           updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [
        delivery_email,
        delivery.delivery_method,
        delivery_status,
        delivery_error,
        response_id
      ]
    );

    const deliveredResponse = updateResult.rows[0] as FoiaResponse;

    // Emit event
    await emit({
      id: crypto.randomUUID(),
      tenant_id,
      event_type: 'foia.response.delivered',
      entity_id: response.foia_request_id,
      entity_type: 'foia_request',
      user_id,
      metadata: {
        response_id,
        delivery_method: delivery.delivery_method,
        delivery_status
      },
      timestamp: new Date()
    });

    return deliveredResponse;
  }

  /**
   * Get response by ID
   */
  async getResponse(tenant_id: string, response_id: string): Promise<FoiaResponse> {
    const result = await this.db.query(
      `SELECT r.* FROM foia_responses r
       JOIN foia_requests fr ON fr.id = r.foia_request_id
       WHERE r.id = $1 AND fr.tenant_id = $2`,
      [response_id, tenant_id]
    );

    if (result.rows.length === 0) {
      throw new Error('Response not found');
    }

    return result.rows[0] as FoiaResponse;
  }

  /**
   * Get responses for a request
   */
  async getResponsesForRequest(
    tenant_id: string,
    foia_request_id: string
  ): Promise<FoiaResponse[]> {
    const result = await this.db.query(
      `SELECT r.* FROM foia_responses r
       JOIN foia_requests fr ON fr.id = r.foia_request_id
       WHERE r.foia_request_id = $1 AND fr.tenant_id = $2
       ORDER BY r.created_at DESC`,
      [foia_request_id, tenant_id]
    );

    return result.rows as FoiaResponse[];
  }
}
