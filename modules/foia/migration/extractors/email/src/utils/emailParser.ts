/**
 * Email Import Engine - Email Parser using AI
 */

import Anthropic from '@anthropic-ai/sdk';
import { ParsedFoiaRequest } from '../types';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || ''
});

/**
 * Parse email to extract FOIA request data using Claude Sonnet 4.5
 */
export async function parseEmailWithAI(
  from: string,
  subject: string,
  bodyText: string,
  bodyHtml?: string
): Promise<ParsedFoiaRequest> {
  const systemPrompt = `You are parsing an email that contains a FOIA/public records request. Extract structured data from the email.

Return JSON: {
  is_foia_request: boolean,
  requester_name: string | null,
  requester_email: string | null,
  requester_phone: string | null,
  requester_organization: string | null,
  request_description: string,
  date_range_mentioned: string | null,
  departments_mentioned: string[],
  record_types_mentioned: string[],
  urgency_indicators: string[],
  confidence: number (0-1)
}

If the email is NOT a FOIA request (spam, internal memo, newsletter, promotional email, etc.), set is_foia_request: false.

For is_foia_request determination:
- TRUE: Explicitly requests public records, government documents, or information under FOIA/public records laws
- FALSE: General inquiries, complaints, internal communications, spam, newsletters, promotional content

For confidence score:
- 0.9-1.0: Very clear FOIA request with explicit language
- 0.7-0.9: Likely FOIA request but missing some clarity
- 0.5-0.7: Unclear if FOIA request, needs human review
- 0.3-0.5: Probably not a FOIA request
- 0.0-0.3: Definitely not a FOIA request

Extract requester information from email signature or body. If requester_email is not found in body, use the From address.

ONLY return valid JSON. Do not include any explanatory text outside the JSON object.`;

  const userPrompt = `From: ${from}
Subject: ${subject}

Body:
${bodyText}

${bodyHtml ? `\nHTML Body:\n${bodyHtml.substring(0, 2000)}` : ''}

Parse this email and extract FOIA request data.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      temperature: 0,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userPrompt
        }
      ]
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from AI');
    }

    // Parse JSON response
    const text = content.text.trim();

    // Extract JSON from response (handle cases where AI adds markdown code blocks)
    let jsonText = text;
    if (text.startsWith('```json')) {
      jsonText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    } else if (text.startsWith('```')) {
      jsonText = text.replace(/```\n?/g, '').trim();
    }

    const result: ParsedFoiaRequest = JSON.parse(jsonText);

    // Validate required fields
    if (typeof result.is_foia_request !== 'boolean') {
      throw new Error('Invalid AI response: missing is_foia_request');
    }

    if (typeof result.confidence !== 'number' || result.confidence < 0 || result.confidence > 1) {
      throw new Error('Invalid AI response: invalid confidence score');
    }

    // If requester_email not extracted, use from address
    if (!result.requester_email && from) {
      // Extract email from "Name <email@example.com>" format
      const emailMatch = from.match(/<([^>]+)>/);
      result.requester_email = emailMatch ? emailMatch[1] : from;
    }

    // Ensure arrays are arrays
    if (!Array.isArray(result.departments_mentioned)) {
      result.departments_mentioned = [];
    }
    if (!Array.isArray(result.record_types_mentioned)) {
      result.record_types_mentioned = [];
    }
    if (!Array.isArray(result.urgency_indicators)) {
      result.urgency_indicators = [];
    }

    return result;
  } catch (error) {
    console.error('[Email Parser] Error parsing email with AI:', error);

    // Fallback: return basic parse with low confidence
    const emailMatch = from.match(/<([^>]+)>/);
    const extractedEmail = emailMatch ? emailMatch[1] : from;

    return {
      is_foia_request: false,
      requester_name: null,
      requester_email: extractedEmail,
      requester_phone: null,
      requester_organization: null,
      request_description: subject || 'Unable to parse email',
      date_range_mentioned: null,
      departments_mentioned: [],
      record_types_mentioned: [],
      urgency_indicators: [],
      confidence: 0.0
    };
  }
}

/**
 * Extract tenant from recipient email address
 * Example: import@cityname.govli.ai -> lookup tenant by subdomain "cityname"
 */
export function extractTenantSubdomain(recipientEmail: string): string | null {
  // Extract subdomain from email address
  // Format: import@{subdomain}.govli.ai
  const match = recipientEmail.match(/import@([^.]+)\.govli\.ai/i);

  if (!match) {
    return null;
  }

  return match[1];
}

/**
 * Lookup tenant ID by subdomain
 */
export async function lookupTenantBySubdomain(
  db: any,
  subdomain: string
): Promise<string | null> {
  try {
    const result = await db.query(
      `SELECT id FROM "Tenants" WHERE subdomain = $1 AND is_active = true`,
      [subdomain.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0].id;
  } catch (error) {
    console.error('[Email Parser] Error looking up tenant:', error);
    return null;
  }
}
