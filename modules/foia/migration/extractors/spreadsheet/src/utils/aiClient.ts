/**
 * Spreadsheet Import Engine - AI Client for Column Mapping
 */

import Anthropic from '@anthropic-ai/sdk';
import { ColumnMapping } from '../types';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || ''
});

/**
 * Get AI-suggested column mappings using Claude Haiku 4.5
 */
export async function suggestColumnMappings(
  columns: string[],
  sampleRows: Record<string, any>[]
): Promise<ColumnMapping[]> {
  // Prepare sample data for AI
  const sampleData = sampleRows.slice(0, 5).map(row => {
    const sample: Record<string, any> = {};
    columns.forEach(col => {
      sample[col] = row[col];
    });
    return sample;
  });

  const systemPrompt = `You are mapping spreadsheet columns to FOIA request fields. Given these column headers and sample data, suggest the best mapping for each column.

Target fields: requester_name, requester_email, requester_phone, description, date_received, date_due, date_closed, department, status, response_type, notes, tracking_number, category.

Return JSON: { mappings: { source_column: string, target_field: string | null, confidence: number }[] }

Set target_field to null for columns that don't map to any FOIA field.
Set confidence as a number between 0 and 1 (0.9+ for very confident, 0.7-0.9 for confident, 0.5-0.7 for uncertain, below 0.5 for guesses).

ONLY return valid JSON. Do not include any explanatory text outside the JSON object.`;

  const userPrompt = `Column headers: ${JSON.stringify(columns)}

Sample data (first 5 rows):
${JSON.stringify(sampleData, null, 2)}

Suggest mappings for each column.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-20250514',
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

    const result = JSON.parse(jsonText);

    if (!result.mappings || !Array.isArray(result.mappings)) {
      throw new Error('Invalid AI response format');
    }

    return result.mappings;
  } catch (error) {
    console.error('[AI Client] Error suggesting column mappings:', error);

    // Fallback: return basic heuristic mappings
    return getFallbackMappings(columns);
  }
}

/**
 * Fallback heuristic mappings if AI fails
 */
function getFallbackMappings(columns: string[]): ColumnMapping[] {
  const mappings: ColumnMapping[] = [];

  const heuristics: Record<string, { keywords: string[]; confidence: number }> = {
    requester_name: {
      keywords: ['name', 'requester', 'requestor', 'customer', 'citizen', 'applicant'],
      confidence: 0.8
    },
    requester_email: {
      keywords: ['email', 'e-mail', 'mail', 'contact'],
      confidence: 0.9
    },
    requester_phone: {
      keywords: ['phone', 'telephone', 'tel', 'mobile', 'cell'],
      confidence: 0.8
    },
    description: {
      keywords: ['description', 'request', 'subject', 'detail', 'summary', 'body', 'content'],
      confidence: 0.7
    },
    date_received: {
      keywords: ['received', 'submitted', 'filed', 'date received', 'submission date', 'received date'],
      confidence: 0.9
    },
    date_due: {
      keywords: ['due', 'deadline', 'due date', 'response due'],
      confidence: 0.8
    },
    date_closed: {
      keywords: ['closed', 'completed', 'closed date', 'completion date', 'delivered'],
      confidence: 0.8
    },
    department: {
      keywords: ['department', 'dept', 'division', 'agency', 'office'],
      confidence: 0.8
    },
    status: {
      keywords: ['status', 'state', 'current status'],
      confidence: 0.9
    },
    response_type: {
      keywords: ['response type', 'response', 'outcome', 'result'],
      confidence: 0.7
    },
    notes: {
      keywords: ['notes', 'comments', 'remarks', 'memo'],
      confidence: 0.7
    },
    tracking_number: {
      keywords: ['tracking', 'id', 'number', 'reference', 'ticket', 'case'],
      confidence: 0.8
    },
    category: {
      keywords: ['category', 'type', 'classification'],
      confidence: 0.7
    }
  };

  for (const column of columns) {
    const lowerColumn = column.toLowerCase();
    let bestMatch: { field: string | null; confidence: number } = {
      field: null,
      confidence: 0
    };

    // Check each target field's keywords
    for (const [targetField, { keywords, confidence }] of Object.entries(heuristics)) {
      for (const keyword of keywords) {
        if (lowerColumn.includes(keyword)) {
          // Exact match gets higher confidence
          if (lowerColumn === keyword) {
            if (confidence * 1.1 > bestMatch.confidence) {
              bestMatch = { field: targetField, confidence: Math.min(confidence * 1.1, 0.95) };
            }
          } else if (confidence > bestMatch.confidence) {
            bestMatch = { field: targetField, confidence };
          }
        }
      }
    }

    mappings.push({
      source_column: column,
      target_field: bestMatch.field,
      confidence: bestMatch.confidence
    });
  }

  return mappings;
}
