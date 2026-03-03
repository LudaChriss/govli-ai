/**
 * Govli AI FOIA Module - Complexity Scorer
 * Calculates complexity score to determine appropriate AI model
 */

/**
 * Complexity Score Result
 */
export interface ComplexityScore {
  total_score: number;
  breakdown: {
    request_length: number;
    document_count: number;
    legal_complexity: number;
    urgency: number;
    feature_bonus: number;
  };
  recommended_model_tier: 'low' | 'mid' | 'high' | 'critical';
}

/**
 * Request Characteristics for Scoring
 */
export interface RequestCharacteristics {
  request_text_length: number;
  document_count: number;
  has_legal_citations: boolean;
  requires_legal_analysis: boolean;
  has_multiple_exemptions: boolean;
  is_urgent: boolean;
  feature_id: string;
  estimated_analysis_depth: 'simple' | 'moderate' | 'complex' | 'critical';
}

/**
 * Complexity Scorer
 */
export class ComplexityScorer {
  /**
   * Calculate complexity score for a FOIA request
   */
  calculateScore(characteristics: RequestCharacteristics): ComplexityScore {
    const breakdown = {
      request_length: this.scoreRequestLength(characteristics.request_text_length),
      document_count: this.scoreDocumentCount(characteristics.document_count),
      legal_complexity: this.scoreLegalComplexity(characteristics),
      urgency: this.scoreUrgency(characteristics.is_urgent),
      feature_bonus: this.scoreFeature(characteristics.feature_id)
    };

    // Calculate total
    const total_score = Object.values(breakdown).reduce((sum, val) => sum + val, 0);

    // Determine recommended tier
    const recommended_model_tier = this.determineModelTier(total_score);

    return {
      total_score,
      breakdown,
      recommended_model_tier
    };
  }

  /**
   * Score based on request text length
   * Longer requests often indicate more complexity
   * Range: 0-20 points
   */
  private scoreRequestLength(length: number): number {
    if (length < 100) return 0;
    if (length < 500) return 5;
    if (length < 1000) return 10;
    if (length < 2000) return 15;
    return 20;
  }

  /**
   * Score based on document count
   * More documents require more processing
   * Range: 0-25 points
   */
  private scoreDocumentCount(count: number): number {
    if (count === 0) return 0;
    if (count <= 5) return 5;
    if (count <= 20) return 10;
    if (count <= 50) return 15;
    if (count <= 100) return 20;
    return 25;
  }

  /**
   * Score based on legal complexity indicators
   * Range: 0-35 points
   */
  private scoreLegalComplexity(characteristics: RequestCharacteristics): number {
    let score = 0;

    // Base complexity from analysis depth
    switch (characteristics.estimated_analysis_depth) {
      case 'simple':
        score += 0;
        break;
      case 'moderate':
        score += 10;
        break;
      case 'complex':
        score += 20;
        break;
      case 'critical':
        score += 30;
        break;
    }

    // Additional points for specific legal indicators
    if (characteristics.has_legal_citations) {
      score += 10;
    }

    if (characteristics.requires_legal_analysis) {
      score += 15;
    }

    if (characteristics.has_multiple_exemptions) {
      score += 10;
    }

    // Cap at 35 points
    return Math.min(score, 35);
  }

  /**
   * Score based on urgency
   * Range: 0-10 points
   */
  private scoreUrgency(is_urgent: boolean): number {
    return is_urgent ? 10 : 0;
  }

  /**
   * Score adjustment based on feature
   * Some features inherently require more capable models
   * Range: -10 to +20 points
   */
  private scoreFeature(feature_id: string): number {
    switch (feature_id) {
      // High complexity features
      case 'AI-1': // Intake Triage
        return 5;
      case 'AI-2': // Document Review
        return 15;
      case 'AI-3': // Redaction
        return 15;
      case 'AI-4': // Response Drafting
        return 10;
      case 'AI-5': // Vaughn Index
        return 20; // Always requires highest quality
      case 'AI-6': // Email Classification
        return 0;
      case 'AI-7': // Duplicate Detection
        return -5; // Can use faster model
      case 'AI-8': // Cost Estimation
        return 0;
      case 'AI-9': // Tracking Reminders
        return -10; // Simple, templated
      case 'AI-10': // Public Portal Q&A
        return 5;
      case 'AI-11': // Analytics Insights
        return 10;
      case 'AI-12': // Deflection Suggestions
        return -10; // Speed critical, simpler logic
      default:
        return 0;
    }
  }

  /**
   * Determine model tier based on total score
   */
  private determineModelTier(score: number): 'low' | 'mid' | 'high' | 'critical' {
    if (score < 30) return 'low';      // Haiku: 0-29
    if (score < 70) return 'mid';      // Sonnet: 30-69
    if (score < 90) return 'high';     // Opus: 70-89
    return 'critical';                 // Opus + extended thinking: 90+
  }

  /**
   * Quick score for simple use cases (when full characteristics not available)
   */
  quickScore(
    feature_id: string,
    document_count: number = 0,
    is_urgent: boolean = false
  ): number {
    const characteristics: RequestCharacteristics = {
      request_text_length: 500, // Average
      document_count,
      has_legal_citations: false,
      requires_legal_analysis: false,
      has_multiple_exemptions: false,
      is_urgent,
      feature_id,
      estimated_analysis_depth: 'moderate'
    };

    return this.calculateScore(characteristics).total_score;
  }

  /**
   * Score for document review (AI-2)
   */
  scoreDocumentReview(
    document_count: number,
    has_sensitive_content: boolean,
    requires_exemption_analysis: boolean
  ): ComplexityScore {
    const characteristics: RequestCharacteristics = {
      request_text_length: 1000,
      document_count,
      has_legal_citations: false,
      requires_legal_analysis: requires_exemption_analysis,
      has_multiple_exemptions: requires_exemption_analysis,
      is_urgent: false,
      feature_id: 'AI-2',
      estimated_analysis_depth: has_sensitive_content ? 'complex' : 'moderate'
    };

    return this.calculateScore(characteristics);
  }

  /**
   * Score for redaction (AI-3)
   */
  scoreRedaction(
    document_count: number,
    redaction_complexity: 'simple' | 'moderate' | 'complex'
  ): ComplexityScore {
    let analysis_depth: 'simple' | 'moderate' | 'complex' | 'critical';

    switch (redaction_complexity) {
      case 'simple':
        analysis_depth = 'moderate'; // Still needs accuracy
        break;
      case 'moderate':
        analysis_depth = 'complex';
        break;
      case 'complex':
        analysis_depth = 'critical'; // High-stakes redactions
        break;
    }

    const characteristics: RequestCharacteristics = {
      request_text_length: 500,
      document_count,
      has_legal_citations: false,
      requires_legal_analysis: true, // Redactions require legal judgment
      has_multiple_exemptions: redaction_complexity !== 'simple',
      is_urgent: false,
      feature_id: 'AI-3',
      estimated_analysis_depth: analysis_depth
    };

    return this.calculateScore(characteristics);
  }

  /**
   * Score for Vaughn Index (AI-5)
   */
  scoreVaughnIndex(
    document_count: number,
    exemption_count: number
  ): ComplexityScore {
    const characteristics: RequestCharacteristics = {
      request_text_length: 2000, // Vaughn indices are detailed
      document_count,
      has_legal_citations: true,
      requires_legal_analysis: true,
      has_multiple_exemptions: exemption_count > 1,
      is_urgent: false,
      feature_id: 'AI-5', // +20 points automatically
      estimated_analysis_depth: 'critical'
    };

    return this.calculateScore(characteristics);
  }

  /**
   * Score for response drafting (AI-4)
   */
  scoreResponseDrafting(
    response_type: 'grant' | 'partial' | 'denial',
    has_exemptions: boolean,
    is_complex_case: boolean
  ): ComplexityScore {
    let analysis_depth: 'simple' | 'moderate' | 'complex' | 'critical';

    if (response_type === 'grant') {
      analysis_depth = 'simple';
    } else if (response_type === 'partial') {
      analysis_depth = has_exemptions ? 'complex' : 'moderate';
    } else { // denial
      analysis_depth = is_complex_case ? 'critical' : 'complex';
    }

    const characteristics: RequestCharacteristics = {
      request_text_length: 1500,
      document_count: 0,
      has_legal_citations: response_type === 'denial',
      requires_legal_analysis: has_exemptions || response_type === 'denial',
      has_multiple_exemptions: has_exemptions,
      is_urgent: false,
      feature_id: 'AI-4',
      estimated_analysis_depth: analysis_depth
    };

    return this.calculateScore(characteristics);
  }

  /**
   * Get complexity description
   */
  getComplexityDescription(score: number): string {
    if (score < 30) {
      return 'Low complexity - routine processing with standard templates';
    } else if (score < 70) {
      return 'Medium complexity - requires moderate analysis and reasoning';
    } else if (score < 90) {
      return 'High complexity - requires advanced legal analysis and careful judgment';
    } else {
      return 'Critical complexity - requires highest quality analysis with extended reasoning';
    }
  }
}
