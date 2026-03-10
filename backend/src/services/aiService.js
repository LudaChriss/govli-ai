const config = require('../config/config');

/**
 * AI Service
 * Unified interface for AI operations supporting multiple providers (OpenAI, Anthropic)
 *
 * ⚠️  DEPRECATION NOTICE - Legacy Code
 * ====================================
 * This AI service is for the LEGACY PERMIT SYSTEM ONLY.
 *
 * FOIA modules MUST use @govli/foia-shared AI client instead:
 *   import { getSharedAIClient } from '@govli/foia-shared';
 *
 * The shared AI client provides:
 *   - Audit logging via callWithAudit()
 *   - Token budget management
 *   - Cost tracking
 *   - Retry logic with exponential backoff
 *   - Prompt caching
 *   - Model routing
 *
 * See: modules/foia/shared/src/ai-client.ts
 * See: AI_IMPLEMENTATION_AUDIT.md for compliance details
 *
 * DO NOT USE THIS SERVICE FOR NEW FOIA FEATURES.
 * ⚠️  =====================================
 */
class AIService {
  constructor() {
    this.provider = config.ai.provider;
    this.client = null;
    this.initialized = false;
  }

  /**
   * Initialize the AI client based on configured provider
   */
  async initialize() {
    if (this.initialized) return;

    try {
      if (this.provider === 'openai') {
        if (!config.ai.openai.apiKey) {
          console.warn('⚠️  OpenAI API key not configured. AI features will be disabled.');
          return;
        }
        // Dynamic import to avoid bundling if not used
        const { OpenAI } = await import('openai');
        this.client = new OpenAI({
          apiKey: config.ai.openai.apiKey
        });
        console.log('✅ OpenAI client initialized');
      } else if (this.provider === 'anthropic') {
        if (!config.ai.anthropic.apiKey) {
          console.warn('⚠️  Anthropic API key not configured. AI features will be disabled.');
          return;
        }
        const { Anthropic } = await import('@anthropic-ai/sdk');
        this.client = new Anthropic({
          apiKey: config.ai.anthropic.apiKey
        });
        console.log('✅ Anthropic client initialized');
      } else {
        throw new Error(`Unsupported AI provider: ${this.provider}`);
      }

      this.initialized = true;
    } catch (error) {
      console.error('❌ Failed to initialize AI client:', error.message);
      console.warn('⚠️  AI features will be disabled');
    }
  }

  /**
   * Check if AI service is available
   */
  isAvailable() {
    return this.initialized && this.client !== null;
  }

  /**
   * Generate text completion
   * @param {string} prompt - The prompt to send
   * @param {Object} options - Optional parameters
   * @returns {Promise<string>} The generated text
   */
  async complete(prompt, options = {}) {
    if (!this.isAvailable()) {
      throw new Error('AI service is not available');
    }

    try {
      if (this.provider === 'openai') {
        return await this.completeOpenAI(prompt, options);
      } else if (this.provider === 'anthropic') {
        return await this.completeAnthropic(prompt, options);
      }
    } catch (error) {
      console.error('AI completion error:', error);
      throw new Error(`AI completion failed: ${error.message}`);
    }
  }

  /**
   * OpenAI completion
   */
  async completeOpenAI(prompt, options = {}) {
    const response = await this.client.chat.completions.create({
      model: options.model || config.ai.openai.model,
      messages: [
        {
          role: 'system',
          content: options.systemPrompt || 'You are a helpful AI assistant for government permit processing.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: options.maxTokens || config.ai.openai.maxTokens,
      temperature: options.temperature || config.ai.openai.temperature
    });

    return response.choices[0].message.content;
  }

  /**
   * Anthropic (Claude) completion
   */
  async completeAnthropic(prompt, options = {}) {
    const response = await this.client.messages.create({
      model: options.model || config.ai.anthropic.model,
      max_tokens: options.maxTokens || config.ai.anthropic.maxTokens,
      temperature: options.temperature || config.ai.anthropic.temperature,
      system: options.systemPrompt || 'You are a helpful AI assistant for government permit processing.',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    return response.content[0].text;
  }

  /**
   * Classify permit type from description
   * @param {string} description - Permit description
   * @param {string} additionalInfo - Additional context
   * @returns {Promise<Object>} Classification result with type and confidence
   */
  async classifyPermit(description, additionalInfo = '') {
    if (!config.ai.features.enableClassification) {
      return { type: 'general', confidence: 0, aiGenerated: false };
    }

    const prompt = `Classify the following permit request into one of these categories:
- building: Construction, renovation, structural changes
- electrical: Electrical work, wiring, installations
- plumbing: Plumbing work, water, sewer
- mechanical: HVAC, mechanical systems
- demolition: Demolition work
- sign: Sign installations
- zoning: Zoning changes, variances
- general: General permits or unclear

Permit Description: ${description}
${additionalInfo ? `Additional Info: ${additionalInfo}` : ''}

Respond in JSON format with:
{
  "type": "category",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}`;

    try {
      const response = await this.complete(prompt, {
        systemPrompt: 'You are an expert permit classifier. Always respond with valid JSON only.',
        temperature: 0.3 // Lower temperature for more consistent classification
      });

      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        return {
          ...result,
          aiGenerated: true
        };
      }

      return { type: 'general', confidence: 0, aiGenerated: false };
    } catch (error) {
      console.error('Permit classification error:', error);
      return { type: 'general', confidence: 0, aiGenerated: false, error: error.message };
    }
  }

  /**
   * Route permit to appropriate staff member
   * @param {Object} permit - Permit object
   * @param {Array} staffMembers - Available staff members
   * @returns {Promise<Object>} Routing recommendation
   */
  async routePermit(permit, staffMembers) {
    if (!config.ai.features.enableRouting || !staffMembers || staffMembers.length === 0) {
      return { staffId: null, confidence: 0, aiGenerated: false };
    }

    const staffInfo = staffMembers.map(s => `
- ID: ${s.id}, Name: ${s.name}, Specialization: ${s.specialization || 'General'}, Current Workload: ${s.workload || 0}
    `).join('\n');

    const prompt = `Route this permit to the most appropriate staff member:

Permit Details:
- Type: ${permit.type}
- Description: ${permit.description || 'N/A'}
- Property Address: ${permit.propertyAddress || 'N/A'}

Available Staff:
${staffInfo}

Consider:
1. Staff specialization matching permit type
2. Current workload (prefer lower workload)
3. Staff expertise

Respond in JSON format with:
{
  "staffId": "selected staff ID",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}`;

    try {
      const response = await this.complete(prompt, {
        systemPrompt: 'You are an expert permit routing system. Always respond with valid JSON only.',
        temperature: 0.3
      });

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        return {
          ...result,
          aiGenerated: true
        };
      }

      return { staffId: null, confidence: 0, aiGenerated: false };
    } catch (error) {
      console.error('Permit routing error:', error);
      return { staffId: null, confidence: 0, aiGenerated: false, error: error.message };
    }
  }

  /**
   * Answer citizen questions about permits
   * @param {string} question - User's question
   * @param {Object} context - Additional context (user's permits, etc.)
   * @returns {Promise<string>} AI-generated answer
   */
  async answerQuestion(question, context = {}) {
    if (!config.ai.features.enableChatbot) {
      return 'AI chatbot is currently disabled. Please contact support for assistance.';
    }

    const contextStr = context.permits ? `
User's Current Permits:
${context.permits.map(p => `- ${p.permitNumber}: ${p.type} - Status: ${p.status}`).join('\n')}
    ` : '';

    const prompt = `Answer this question about government permits:

Question: ${question}
${contextStr}

Provide a helpful, accurate, and concise answer. If you're unsure, direct the user to contact support.`;

    try {
      const response = await this.complete(prompt, {
        systemPrompt: 'You are a helpful assistant for a government permit system. Provide clear, accurate information about permits, applications, inspections, and related processes.',
        temperature: 0.7
      });

      return response;
    } catch (error) {
      console.error('Question answering error:', error);
      return 'I apologize, but I encountered an error processing your question. Please contact support for assistance.';
    }
  }

  /**
   * Validate document completeness
   * @param {string} documentText - Extracted text from document
   * @param {string} permitType - Type of permit
   * @returns {Promise<Object>} Validation result
   */
  async validateDocument(documentText, permitType) {
    const prompt = `Validate if this document contains all required information for a ${permitType} permit:

Document Content:
${documentText.substring(0, 2000)} ${documentText.length > 2000 ? '...[truncated]' : ''}

Check for:
- Property address
- Applicant information (name, contact)
- Scope of work description
- Required signatures or authorizations
- Any permit-specific requirements

Respond in JSON format with:
{
  "isComplete": true/false,
  "missingItems": ["list of missing required items"],
  "confidence": 0.0-1.0,
  "suggestions": "helpful suggestions for the applicant"
}`;

    try {
      const response = await this.complete(prompt, {
        systemPrompt: 'You are a document validation expert for permit applications. Always respond with valid JSON only.',
        temperature: 0.3
      });

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      return { isComplete: false, missingItems: [], confidence: 0 };
    } catch (error) {
      console.error('Document validation error:', error);
      return { isComplete: false, missingItems: [], confidence: 0, error: error.message };
    }
  }
}

// Export singleton instance
module.exports = new AIService();
