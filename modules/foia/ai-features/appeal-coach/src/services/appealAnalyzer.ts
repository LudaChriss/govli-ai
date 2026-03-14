/**
 * Govli AI FOIA Module - Appeal Analyzer Service
 * AI-powered analysis of FOIA denials to help requesters understand appeals
 */

import { getSharedAIClient } from '@govli/foia-shared';
import { Pool } from 'pg';

export interface ExemptionExplanation {
  code: string;
  plain_explanation: string;
  is_standard: boolean;
}

export interface AppealableItem {
  document_id?: string;
  document_title?: string;
  claim: string;
  exemption_code: string;
  suggested_appeal_ground: string;
  likelihood_of_success: 'low' | 'medium' | 'high';
}

export interface AppealAnalysis {
  exemption_plain_explanations: ExemptionExplanation[];
  appealable_items: AppealableItem[];
  overall_assessment: string;
  expected_outcome: string;
  appeal_tips: string[];
  should_appeal: boolean;
  frivolous_risk: boolean;
}

export interface ResponseData {
  request_id: string;
  response_letter: string;
  status: string;
  withheld_documents: Array<{
    id?: string;
    title?: string;
    exemptions_applied: string[];
    reason?: string;
  }>;
  partially_released_documents: Array<{
    id?: string;
    title?: string;
    exemptions_applied: string[];
    redactions?: string;
  }>;
  exemptions_summary: Record<string, number>; // exemption code -> count
}

/**
 * Appeal Analyzer Service
 */
export class AppealAnalyzer {
  private db: Pool;
  private tenantId: string;

  constructor(db: Pool, tenantId: string) {
    this.db = db;
    this.tenantId = tenantId;
  }

  /**
   * Fetch response data for a delivered FOIA request
   */
  async fetchResponseData(
    foiaRequestId: string,
    confirmationNumber: string
  ): Promise<ResponseData | null> {
    // Verify request exists and is delivered
    const requestResult = await this.db.query(
      `SELECT id, status, response_letter, exemptions_applied
       FROM "FoiaRequests"
       WHERE id = $1 AND confirmation_number = $2
         AND status IN ('DELIVERED', 'PARTIALLY_GRANTED', 'DENIED')`,
      [foiaRequestId, confirmationNumber]
    );

    if (requestResult.rows.length === 0) {
      return null;
    }

    const request = requestResult.rows[0];

    // Fetch withheld/redacted documents (public-safe fields only)
    const documentsResult = await this.db.query(
      `SELECT id, title, exemptions_applied, redaction_summary
       FROM "FoiaDocuments"
       WHERE request_id = $1 AND (fully_withheld = true OR redacted = true)
       ORDER BY title`,
      [foiaRequestId]
    );

    const withheldDocuments: any[] = [];
    const partiallyReleasedDocuments: any[] = [];
    const exemptionsSummary: Record<string, number> = {};

    for (const doc of documentsResult.rows) {
      const exemptions = doc.exemptions_applied || [];

      // Count exemptions
      for (const exemption of exemptions) {
        exemptionsSummary[exemption] = (exemptionsSummary[exemption] || 0) + 1;
      }

      if (doc.fully_withheld) {
        withheldDocuments.push({
          id: doc.id,
          title: doc.title,
          exemptions_applied: exemptions
        });
      } else if (doc.redacted) {
        partiallyReleasedDocuments.push({
          id: doc.id,
          title: doc.title,
          exemptions_applied: exemptions,
          redactions: doc.redaction_summary
        });
      }
    }

    return {
      request_id: request.id,
      response_letter: request.response_letter || '',
      status: request.status,
      withheld_documents: withheldDocuments,
      partially_released_documents: partiallyReleasedDocuments,
      exemptions_summary: exemptionsSummary
    };
  }

  /**
   * Analyze the response and provide appeal guidance using Claude AI
   */
  async analyzeForAppeal(responseData: ResponseData): Promise<AppealAnalysis> {
    const aiClient = getSharedAIClient();

    const prompt = this.buildAnalysisPrompt(responseData);

    try {
      const result = await aiClient.callWithAudit(
        {
          prompt,
          maxTokens: 2000,
          temperature: 0.3,
          systemPrompt: this.getSystemPrompt()
        },
        'AI-9', // Feature ID for Appeal Coach
        this.tenantId
      );

      // Parse Claude's response
      return this.parseAnalysisResponse(result.content, responseData);
    } catch (error: any) {
      console.error('Error analyzing appeal with Claude:', error);

      // Fallback to basic analysis
      return this.generateFallbackAnalysis(responseData);
    }
  }

  /**
   * Get system prompt for Claude
   */
  private getSystemPrompt(): string {
    return `You are an advisor helping a member of the public understand a FOIA denial and decide whether to appeal. You have access to the agency's response letter and list of claimed exemptions.

Provide:
1. Plain-English explanation of what was withheld and why
2. An honest assessment of the exemption claims - are they standard and likely valid, or do any seem overbroad or worth challenging?
3. Specific appeal grounds they could raise for each challenged exemption, using plain language (not legalese)
4. What outcome they can realistically expect

Be honest - if the denial looks solid, say so. Do not encourage frivolous appeals. Use grade 8 reading level.

Return your analysis in this JSON format:
{
  "exemption_explanations": [
    {
      "code": "Exemption b(5)",
      "plain_explanation": "Attorney-client privileged communications",
      "is_standard": true,
      "is_overbroad": false
    }
  ],
  "appealable_items": [
    {
      "document_title": "Email from Smith to Jones",
      "claim": "Withheld under exemption b(5)",
      "suggested_appeal_ground": "The email appears to be factual information, not legal advice...",
      "likelihood": "medium"
    }
  ],
  "overall_assessment": "Your appeal has moderate chances...",
  "expected_outcome": "If you appeal, you might get...",
  "appeal_tips": ["Tip 1", "Tip 2"],
  "should_appeal": true,
  "frivolous_risk": false
}`;
  }

  /**
   * Build the analysis prompt for Claude
   */
  private buildAnalysisPrompt(responseData: ResponseData): string {
    let prompt = `Analyze this FOIA response and provide appeal guidance:\n\n`;

    prompt += `**Request Status**: ${responseData.status}\n\n`;

    if (responseData.response_letter) {
      prompt += `**Agency Response Letter**:\n${responseData.response_letter}\n\n`;
    }

    if (responseData.withheld_documents.length > 0) {
      prompt += `**Fully Withheld Documents** (${responseData.withheld_documents.length}):\n`;
      for (const doc of responseData.withheld_documents.slice(0, 20)) {
        prompt += `- ${doc.title || 'Untitled'}: ${doc.exemptions_applied.join(', ')}\n`;
      }
      if (responseData.withheld_documents.length > 20) {
        prompt += `- ... and ${responseData.withheld_documents.length - 20} more\n`;
      }
      prompt += '\n';
    }

    if (responseData.partially_released_documents.length > 0) {
      prompt += `**Partially Released Documents** (${responseData.partially_released_documents.length}):\n`;
      for (const doc of responseData.partially_released_documents.slice(0, 20)) {
        prompt += `- ${doc.title || 'Untitled'}: ${doc.exemptions_applied.join(', ')}\n`;
      }
      if (responseData.partially_released_documents.length > 20) {
        prompt += `- ... and ${responseData.partially_released_documents.length - 20} more\n`;
      }
      prompt += '\n';
    }

    prompt += `**Exemptions Used**:\n`;
    for (const [exemption, count] of Object.entries(responseData.exemptions_summary)) {
      prompt += `- ${exemption}: ${count} times\n`;
    }

    prompt += `\n**Question**: Should this requester appeal? If so, what are the strongest grounds?`;

    return prompt;
  }

  /**
   * Parse Claude's response into structured analysis
   */
  private parseAnalysisResponse(content: string, responseData: ResponseData): AppealAnalysis {
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        return {
          exemption_plain_explanations: (parsed.exemption_explanations || []).map((ex: any) => ({
            code: ex.code,
            plain_explanation: ex.plain_explanation,
            is_standard: ex.is_standard !== false
          })),
          appealable_items: (parsed.appealable_items || []).map((item: any) => ({
            document_title: item.document_title,
            claim: item.claim,
            exemption_code: this.extractExemptionCode(item.claim),
            suggested_appeal_ground: item.suggested_appeal_ground,
            likelihood_of_success: item.likelihood || 'medium'
          })),
          overall_assessment: parsed.overall_assessment || '',
          expected_outcome: parsed.expected_outcome || '',
          appeal_tips: parsed.appeal_tips || [],
          should_appeal: parsed.should_appeal !== false,
          frivolous_risk: parsed.frivolous_risk === true
        };
      }
    } catch (error) {
      console.error('Error parsing Claude response:', error);
    }

    // If parsing fails, return fallback
    return this.generateFallbackAnalysis(responseData);
  }

  /**
   * Extract exemption code from a claim string
   */
  private extractExemptionCode(claim: string): string {
    const match = claim.match(/\b(b\([0-9]+\)|exemption\s+[0-9]+)\b/i);
    return match ? match[0] : 'unknown';
  }

  /**
   * Generate fallback analysis when Claude is unavailable
   */
  private generateFallbackAnalysis(responseData: ResponseData): AppealAnalysis {
    const exemptions: ExemptionExplanation[] = [];

    // Generate basic explanations for common exemptions
    for (const exemptionCode of Object.keys(responseData.exemptions_summary)) {
      exemptions.push({
        code: exemptionCode,
        plain_explanation: this.getBasicExemptionExplanation(exemptionCode),
        is_standard: true
      });
    }

    return {
      exemption_plain_explanations: exemptions,
      appealable_items: [],
      overall_assessment: 'Your request has been partially or fully denied. The agency used standard FOIA exemptions. Consider reviewing each exemption to determine if an appeal is appropriate.',
      expected_outcome: 'Appeals are reviewed on a case-by-case basis. Success depends on whether the exemptions were properly applied.',
      appeal_tips: [
        'Review the exemptions claimed and ensure they are specific',
        'Look for any documents that might be segregable (parts can be released)',
        'Consider whether public interest outweighs the exemption',
        'Consult with a legal aid organization if you need help'
      ],
      should_appeal: false, // Conservative fallback
      frivolous_risk: false
    };
  }

  /**
   * Get basic exemption explanation
   */
  private getBasicExemptionExplanation(exemptionCode: string): string {
    const explanations: Record<string, string> = {
      'b(1)': 'Information related to national security and classified information',
      'b(2)': 'Internal personnel rules and practices',
      'b(3)': 'Information protected by other federal laws',
      'b(4)': 'Confidential business information',
      'b(5)': 'Internal agency communications and legal advice (deliberative process)',
      'b(6)': 'Personal privacy information',
      'b(7)': 'Law enforcement records',
      'b(7)(A)': 'Information that could interfere with law enforcement proceedings',
      'b(7)(C)': 'Personal privacy in law enforcement records',
      'b(7)(E)': 'Law enforcement techniques and procedures',
      'b(8)': 'Information about financial institutions',
      'b(9)': 'Information about oil and gas wells'
    };

    return explanations[exemptionCode] ||
      `Exemption ${exemptionCode} protects certain types of information from disclosure`;
  }
}
