/**
 * Govli AI FOIA Module - Fee Explanation Generator
 * Uses Claude API to generate plain-English fee explanations
 */

import { getSharedAIClient } from '@govli/foia-shared';
import type { FeeEstimateResult } from './feeCalculator';

export interface ExplanationInput {
  requester_category: string;
  fee_estimate_low: number;
  fee_estimate_high: number;
  likely_fee: number;
  likely_fee_waiver_eligible: boolean;
  advance_payment_threshold: number;
  fee_breakdown: {
    search_hours: number;
    search_cost: number;
    review_hours: number;
    review_cost: number;
    estimated_pages: number;
    copy_cost: number;
    exemptions_applied: string[];
  };
}

/**
 * Fee Explanation Generator Service
 */
export class ExplanationGenerator {
  private tenantId: string;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
  }

  /**
   * Generate plain-English fee explanation using Claude
   */
  async generateExplanation(input: ExplanationInput): Promise<string> {
    const aiClient = getSharedAIClient();

    // Build the prompt for Claude
    const prompt = this.buildPrompt(input);

    try {
      // Call Claude API
      const result = await aiClient.callWithAudit(
        {
          prompt,
          maxTokens: 500,
          temperature: 0.7,
          systemPrompt: 'You are a helpful government transparency assistant explaining FOIA fees to members of the public. Use plain, accessible language suitable for a grade 7 reading level. Be friendly, transparent, and reassuring.'
        },
        'AI-8', // Feature ID for Fee Estimator
        this.tenantId
      );

      return result.content.trim();
    } catch (error: any) {
      console.error('Error generating fee explanation:', error);

      // Fallback to template-based explanation
      return this.generateTemplateExplanation(input);
    }
  }

  /**
   * Build the prompt for Claude
   */
  private buildPrompt(input: ExplanationInput): string {
    const categoryReadable = this.getCategoryReadable(input.requester_category);
    const exemptionsText = input.fee_breakdown.exemptions_applied.length > 0
      ? `Exemptions applied: ${input.fee_breakdown.exemptions_applied.join(', ')}.`
      : '';

    return `Write a friendly, 4-6 sentence fee explanation for a member of the public who just submitted a FOIA request.

**Context:**
- Requester category: ${categoryReadable}
- Estimated fee range: $${input.fee_estimate_low.toFixed(2)} - $${input.fee_estimate_high.toFixed(2)}
- Most likely fee: $${input.likely_fee.toFixed(2)}
- Fee waiver eligible: ${input.likely_fee_waiver_eligible ? 'Yes' : 'No'}
- Advance payment threshold: $${input.advance_payment_threshold.toFixed(2)}

**Fee breakdown:**
- Search time: ${input.fee_breakdown.search_hours} hours at $${input.fee_breakdown.search_cost.toFixed(2)}
- Review time: ${input.fee_breakdown.review_hours} hours at $${input.fee_breakdown.review_cost.toFixed(2)}
- Copying: ~${input.fee_breakdown.estimated_pages} pages at $${input.fee_breakdown.copy_cost.toFixed(2)}
${exemptionsText}

**Instructions:**
Explain in plain language:
1. Why there may be fees for this request
2. What the estimated range is and what it covers (search, review, copying)
3. Whether they may qualify for a fee waiver based on their requester category
4. What happens next regarding fees

Use plain language at a grade 7 reading level. Do not be legalistic. Be transparent and reassuring.

End with: "You won't be charged without advance notice if fees exceed $${input.advance_payment_threshold.toFixed(2)}."

Do not include a subject line or heading. Start directly with the explanation.`;
  }

  /**
   * Get human-readable requester category
   */
  private getCategoryReadable(category: string): string {
    switch (category) {
      case 'COMMERCIAL':
        return 'Commercial use';
      case 'NEWS_MEDIA':
        return 'News media';
      case 'EDUCATIONAL':
        return 'Educational institution';
      case 'PUBLIC_INTEREST':
        return 'Public interest organization';
      case 'OTHER':
      default:
        return 'General public';
    }
  }

  /**
   * Generate template-based explanation (fallback)
   */
  private generateTemplateExplanation(input: ExplanationInput): string {
    const categoryReadable = this.getCategoryReadable(input.requester_category);

    let explanation = `Your FOIA request has been received. `;

    // Explain why there may be fees
    if (input.likely_fee > 0) {
      explanation += `Based on the scope of your request, we estimate fees may apply. `;
      explanation += `Under federal FOIA law, agencies may charge reasonable fees to cover the costs of searching for, reviewing, and copying responsive records. `;
    } else {
      explanation += `Good news! Based on the scope of your request and your requester category (${categoryReadable}), we don't anticipate any fees. `;
    }

    // Explain the estimated range
    if (input.likely_fee > 0) {
      explanation += `We estimate the total fees will range from $${input.fee_estimate_low.toFixed(2)} to $${input.fee_estimate_high.toFixed(2)}, with a most likely cost of around $${input.likely_fee.toFixed(2)}. `;

      const costComponents = [];
      if (input.fee_breakdown.search_cost > 0) {
        costComponents.push(`search time (${input.fee_breakdown.search_hours} hours)`);
      }
      if (input.fee_breakdown.review_cost > 0) {
        costComponents.push(`review time (${input.fee_breakdown.review_hours} hours)`);
      }
      if (input.fee_breakdown.copy_cost > 0) {
        costComponents.push(`copying costs (~${input.fee_breakdown.estimated_pages} pages)`);
      }

      if (costComponents.length > 0) {
        explanation += `This includes ${costComponents.join(', ')}. `;
      }

      // Mention exemptions
      if (input.fee_breakdown.exemptions_applied.length > 0) {
        explanation += `As a ${categoryReadable.toLowerCase()} requester, certain exemptions apply: ${input.fee_breakdown.exemptions_applied.join(', ')}. `;
      }
    }

    // Fee waiver eligibility
    if (input.likely_fee_waiver_eligible) {
      explanation += `Based on your requester category (${categoryReadable}), you may qualify for a fee waiver. You can submit a fee waiver request with your justification for why the disclosure is in the public interest. `;
    }

    // What happens next
    explanation += `You won't be charged without advance notice if fees exceed $${input.advance_payment_threshold.toFixed(2)}.`;

    return explanation;
  }
}
