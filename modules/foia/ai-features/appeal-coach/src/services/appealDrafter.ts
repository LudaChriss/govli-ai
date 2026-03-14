/**
 * Govli AI FOIA Module - Appeal Letter Drafter Service
 * AI-powered drafting of formal FOIA appeal letters
 */

import { getSharedAIClient } from '@govli/foia-shared';
import { Pool } from 'pg';

export interface AppealDraftInput {
  request_id: string;
  original_request_description: string;
  response_date?: Date;
  selected_grounds: string[];
  requester_statement?: string;
  requester_name: string;
  requester_email: string;
  agency_name: string;
}

export interface AppealDraft {
  letter: string;
  subject_line: string;
  key_arguments: string[];
  suggested_edits: string[];
}

/**
 * Appeal Drafter Service
 */
export class AppealDrafter {
  private tenantId: string;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
  }

  /**
   * Draft a formal appeal letter using Claude AI
   */
  async draftAppealLetter(input: AppealDraftInput): Promise<AppealDraft> {
    const aiClient = getSharedAIClient();

    const prompt = this.buildDraftPrompt(input);

    try {
      const result = await aiClient.callWithAudit(
        {
          prompt,
          maxTokens: 1500,
          temperature: 0.5,
          systemPrompt: this.getSystemPrompt()
        },
        'AI-9', // Feature ID for Appeal Coach
        this.tenantId
      );

      return this.parseDraftResponse(result.content, input);
    } catch (error: any) {
      console.error('Error drafting appeal with Claude:', error);

      // Fallback to template-based letter
      return this.generateTemplateLetter(input);
    }
  }

  /**
   * Get system prompt for Claude
   */
  private getSystemPrompt(): string {
    return `You are a professional assistant helping a member of the public draft a formal FOIA appeal letter.

The letter should:
1. Reference the original request and response
2. Specifically identify each disputed exemption
3. Cite why each exemption is overbroad or misapplied with reference to the statutory language
4. Request specific relief (release in full or in part)
5. Be professional and respectful in tone
6. Use grade 10 writing level (clear but formal)

Return your draft in this JSON format:
{
  "subject_line": "Appeal of FOIA Request #...",
  "letter": "The full letter text here...",
  "key_arguments": ["Point 1", "Point 2"],
  "suggested_edits": ["Consider adding...", "You might want to..."]
}`;
  }

  /**
   * Build the draft prompt for Claude
   */
  private buildDraftPrompt(input: AppealDraftInput): string {
    let prompt = `Draft a formal FOIA appeal letter with the following information:\n\n`;

    prompt += `**Requester Name**: ${input.requester_name}\n`;
    prompt += `**Requester Email**: ${input.requester_email}\n`;
    prompt += `**Agency**: ${input.agency_name}\n`;
    prompt += `**Request ID**: ${input.request_id}\n`;

    if (input.response_date) {
      prompt += `**Response Date**: ${input.response_date.toLocaleDateString()}\n`;
    }

    prompt += `\n**Original Request Description**:\n${input.original_request_description}\n\n`;

    prompt += `**Appeal Grounds Selected**:\n`;
    for (const ground of input.selected_grounds) {
      prompt += `- ${ground}\n`;
    }

    if (input.requester_statement) {
      prompt += `\n**Requester's Additional Statement**:\n${input.requester_statement}\n`;
    }

    prompt += `\n**Task**: Draft a professional, formal FOIA appeal letter based on the above information.`;

    return prompt;
  }

  /**
   * Parse Claude's response into structured draft
   */
  private parseDraftResponse(content: string, input: AppealDraftInput): AppealDraft {
    try {
      // Try to extract JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        return {
          letter: parsed.letter || this.generateTemplateLetterText(input),
          subject_line: parsed.subject_line || `Appeal of FOIA Request ${input.request_id}`,
          key_arguments: parsed.key_arguments || [],
          suggested_edits: parsed.suggested_edits || []
        };
      }

      // If no JSON, treat entire content as the letter
      if (content.length > 100) {
        return {
          letter: content,
          subject_line: `Appeal of FOIA Request ${input.request_id}`,
          key_arguments: [],
          suggested_edits: []
        };
      }
    } catch (error) {
      console.error('Error parsing draft response:', error);
    }

    // Fallback
    return this.generateTemplateLetter(input);
  }

  /**
   * Generate template-based appeal letter (fallback)
   */
  private generateTemplateLetter(input: AppealDraftInput): AppealDraft {
    const letter = this.generateTemplateLetterText(input);

    return {
      letter,
      subject_line: `Appeal of FOIA Request ${input.request_id}`,
      key_arguments: input.selected_grounds,
      suggested_edits: [
        'Review the specific exemptions cited and add more detail about why they were misapplied',
        'Consider adding specific examples or documents that should have been released',
        'If applicable, reference similar cases where these exemptions were overturned'
      ]
    };
  }

  /**
   * Generate template letter text
   */
  private generateTemplateLetterText(input: AppealDraftInput): string {
    const today = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    return `${input.requester_name}
${input.requester_email}

${today}

${input.agency_name}
FOIA Appeals Office

Re: Appeal of FOIA Request ${input.request_id}

Dear FOIA Appeals Officer:

I am writing to appeal the ${input.response_date ? `response dated ${input.response_date.toLocaleDateString()}` : 'recent response'} to my Freedom of Information Act request ${input.request_id}.

BACKGROUND

My original request sought: ${input.original_request_description}

GROUNDS FOR APPEAL

I respectfully disagree with the agency's determination for the following reasons:

${input.selected_grounds.map((ground, i) => `${i + 1}. ${ground}`).join('\n\n')}

${input.requester_statement ? `\nADDITIONAL CONTEXT\n\n${input.requester_statement}\n` : ''}
REQUESTED RELIEF

I respectfully request that your office review the agency's determination and direct the release of the withheld records in full, or at minimum, conduct a line-by-line review to determine whether additional information can be segregated and released.

I believe the public interest in disclosure of these records outweighs any claimed exemptions, and I am prepared to provide additional justification if needed.

Thank you for your consideration of this appeal. I look forward to your response within the statutory timeframe.

Sincerely,

${input.requester_name}
${input.requester_email}`;
  }
}
