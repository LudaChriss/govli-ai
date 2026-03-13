/**
 * Govli AI FOIA Module - Fee Estimator Handlers
 * API handlers for fee estimation endpoints
 */

import { Request, Response } from 'express';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { ApiResponse } from '@govli/foia-shared';
import { FeeCalculator } from './services/feeCalculator';
import { ExplanationGenerator } from './services/explanationGenerator';

// Database connection pool
let dbPool: Pool;

export function setDatabasePool(pool: Pool): void {
  dbPool = pool;
}

/**
 * Validation schema for POST /ai/fees/estimate
 */
const EstimateFeeSchema = z.object({
  foia_request_id: z.string().uuid(),
  description: z.string().min(1),
  requester_category: z.enum(['COMMERCIAL', 'EDUCATIONAL', 'NEWS_MEDIA', 'PUBLIC_INTEREST', 'OTHER']),
  agencies_requested: z.array(z.string()).min(1),
  date_range_years: z.number().optional().default(0),
  estimated_record_volume: z.enum(['LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH']).optional().default('MEDIUM'),
  record_type: z.string().optional()
});

type EstimateFeeInput = z.infer<typeof EstimateFeeSchema>;

/**
 * POST /ai/fees/estimate
 * Generate fee estimate for a FOIA request
 */
export async function estimateFee(
  req: Request<{}, {}, EstimateFeeInput>,
  res: Response
): Promise<void> {
  try {
    const input = EstimateFeeSchema.parse(req.body);
    const tenantId = (req as any).tenantId || 'default';

    // Verify the FOIA request exists
    const requestResult = await dbPool.query(
      'SELECT * FROM "FoiaRequests" WHERE id = $1',
      [input.foia_request_id]
    );

    if (requestResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'FOIA request not found'
        },
        timestamp: new Date()
      });
      return;
    }

    const foiaRequest = requestResult.rows[0];

    // Initialize services
    const feeCalculator = new FeeCalculator(dbPool);
    const explanationGenerator = new ExplanationGenerator(tenantId);

    // Calculate fee estimate for each agency (use first agency for now)
    const primaryAgencyId = input.agencies_requested[0] || 'default-agency';

    const feeEstimate = await feeCalculator.calculateFeeEstimate(
      {
        description: input.description,
        requester_category: input.requester_category,
        agency_id: primaryAgencyId,
        date_range_years: input.date_range_years,
        estimated_record_volume: input.estimated_record_volume,
        record_type: input.record_type
      },
      tenantId
    );

    // Get fee schedule for waiver threshold
    const feeScheduleResult = await dbPool.query(
      `SELECT fee_waiver_threshold, advance_payment_threshold FROM "FoiaFeeSchedules"
       WHERE tenant_id = $1 AND agency_id = $2 AND superseded_at IS NULL
       LIMIT 1`,
      [tenantId, primaryAgencyId]
    );

    const fee_waiver_threshold = feeScheduleResult.rows[0]?.fee_waiver_threshold || 15.00;
    const advance_payment_threshold = feeScheduleResult.rows[0]?.advance_payment_threshold || 25.00;

    // Generate plain-English explanation using Claude
    const plainEnglishExplanation = await explanationGenerator.generateExplanation({
      requester_category: input.requester_category,
      fee_estimate_low: feeEstimate.fee_estimate_low,
      fee_estimate_high: feeEstimate.fee_estimate_high,
      likely_fee: feeEstimate.likely_fee,
      likely_fee_waiver_eligible: feeEstimate.likely_fee_waiver_eligible,
      advance_payment_threshold,
      fee_breakdown: feeEstimate.fee_breakdown
    });

    // Store the estimate in the database
    const estimateId = uuidv4();
    await dbPool.query(
      `INSERT INTO "FoiaFeeEstimates" (
        id, tenant_id, foia_request_id, requester_category,
        fee_estimate_low, fee_estimate_high, likely_fee, likely_fee_waiver_eligible,
        fee_breakdown, plain_english_explanation, waiver_application_url,
        estimated_at, estimation_confidence, estimation_method
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), $12, $13)`,
      [
        estimateId,
        tenantId,
        input.foia_request_id,
        input.requester_category,
        feeEstimate.fee_estimate_low,
        feeEstimate.fee_estimate_high,
        feeEstimate.likely_fee,
        feeEstimate.likely_fee_waiver_eligible,
        JSON.stringify(feeEstimate.fee_breakdown),
        plainEnglishExplanation,
        feeEstimate.likely_fee_waiver_eligible ? `/portal/fee-waiver/${input.foia_request_id}` : null,
        feeEstimate.estimation_confidence,
        'ml_model' // Will be updated when ML model is implemented
      ]
    );

    // Return response
    const response: ApiResponse<{
      estimate_id: string;
      fee_estimate_low: number;
      fee_estimate_high: number;
      likely_fee: number;
      likely_fee_waiver_eligible: boolean;
      plain_english_explanation: string;
      fee_breakdown: typeof feeEstimate.fee_breakdown;
      waiver_application_url: string | null;
    }> = {
      success: true,
      data: {
        estimate_id: estimateId,
        fee_estimate_low: feeEstimate.fee_estimate_low,
        fee_estimate_high: feeEstimate.fee_estimate_high,
        likely_fee: feeEstimate.likely_fee,
        likely_fee_waiver_eligible: feeEstimate.likely_fee_waiver_eligible,
        plain_english_explanation: plainEnglishExplanation,
        fee_breakdown: feeEstimate.fee_breakdown,
        waiver_application_url: feeEstimate.likely_fee_waiver_eligible
          ? `/portal/fee-waiver/${input.foia_request_id}`
          : null
      },
      timestamp: new Date()
    };

    res.status(201).json(response);
  } catch (error: any) {
    console.error('Error estimating fee:', error);

    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input data',
          details: error.errors
        },
        timestamp: new Date()
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'ESTIMATION_FAILED',
        message: 'Failed to generate fee estimate',
        details: error.message
      },
      timestamp: new Date()
    });
  }
}

/**
 * GET /ai/fees/estimate/:foiaRequestId
 * Retrieve stored fee estimate for a request
 */
export async function getFeeEstimate(
  req: Request<{ foiaRequestId: string }>,
  res: Response
): Promise<void> {
  try {
    const { foiaRequestId } = req.params;
    const confirmationNumber = req.query.confirmation_number as string;

    let query: string;
    let params: any[];

    if (confirmationNumber) {
      // Public lookup by confirmation number
      query = `
        SELECT fe.*
        FROM "FoiaFeeEstimates" fe
        JOIN "FoiaRequests" fr ON fe.foia_request_id = fr.id
        WHERE fr.confirmation_number = $1
        ORDER BY fe."createdAt" DESC
        LIMIT 1
      `;
      params = [confirmationNumber];
    } else {
      // Lookup by request ID (requires authentication in production)
      query = `
        SELECT * FROM "FoiaFeeEstimates"
        WHERE foia_request_id = $1
        ORDER BY "createdAt" DESC
        LIMIT 1
      `;
      params = [foiaRequestId];
    }

    const result = await dbPool.query(query, params);

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Fee estimate not found for this request'
        },
        timestamp: new Date()
      });
      return;
    }

    const estimate = result.rows[0];

    // Get fee schedule thresholds
    const feeScheduleResult = await dbPool.query(
      `SELECT fee_waiver_threshold FROM "FoiaFeeSchedules"
       WHERE tenant_id = $1 AND superseded_at IS NULL
       LIMIT 1`,
      [estimate.tenant_id]
    );

    const fee_waiver_threshold = feeScheduleResult.rows[0]?.fee_waiver_threshold || 15.00;

    const response: ApiResponse<{
      estimate_id: string;
      fee_estimate_low: number;
      fee_estimate_high: number;
      likely_fee: number;
      likely_fee_waiver_eligible: boolean;
      plain_english_explanation: string;
      fee_breakdown: any;
      waiver_application_url: string | null;
      estimated_at: Date;
      fee_waiver_threshold: number;
    }> = {
      success: true,
      data: {
        estimate_id: estimate.id,
        fee_estimate_low: parseFloat(estimate.fee_estimate_low),
        fee_estimate_high: parseFloat(estimate.fee_estimate_high),
        likely_fee: parseFloat(estimate.likely_fee),
        likely_fee_waiver_eligible: estimate.likely_fee_waiver_eligible,
        plain_english_explanation: estimate.plain_english_explanation,
        fee_breakdown: estimate.fee_breakdown,
        waiver_application_url: estimate.waiver_application_url,
        estimated_at: estimate.estimated_at,
        fee_waiver_threshold
      },
      timestamp: new Date()
    };

    res.json(response);
  } catch (error: any) {
    console.error('Error fetching fee estimate:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_FAILED',
        message: 'Failed to fetch fee estimate',
        details: error.message
      },
      timestamp: new Date()
    });
  }
}

/**
 * POST /ai/fees/accuracy-tracking
 * Update fee estimate with actual values for accuracy tracking
 */
export async function trackAccuracy(
  req: Request<{}, {}, {
    foia_request_id: string;
    actual_fee: number;
    actual_search_hours: number;
    actual_pages: number;
  }>,
  res: Response
): Promise<void> {
  try {
    const { foia_request_id, actual_fee, actual_search_hours, actual_pages } = req.body;

    // Get the most recent estimate for this request
    const estimateResult = await dbPool.query(
      `SELECT * FROM "FoiaFeeEstimates"
       WHERE foia_request_id = $1
       ORDER BY "createdAt" DESC
       LIMIT 1`,
      [foia_request_id]
    );

    if (estimateResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'No fee estimate found for this request'
        },
        timestamp: new Date()
      });
      return;
    }

    const estimate = estimateResult.rows[0];
    const estimated_fee = parseFloat(estimate.likely_fee);

    // Calculate accuracy percentage
    const accuracy_percentage = actual_fee > 0
      ? Math.max(0, (1 - Math.abs(estimated_fee - actual_fee) / actual_fee) * 100)
      : 100;

    // Update the estimate with actual values
    await dbPool.query(
      `UPDATE "FoiaFeeEstimates"
       SET actual_fee = $1,
           actual_search_hours = $2,
           actual_pages = $3,
           accuracy_percentage = $4,
           accuracy_tracked = true,
           tracked_at = NOW(),
           "updatedAt" = NOW()
       WHERE id = $5`,
      [actual_fee, actual_search_hours, actual_pages, accuracy_percentage, estimate.id]
    );

    // Add to historical cases for ML training
    await dbPool.query(
      `INSERT INTO "FoiaHistoricalFeeCases" (
        id, tenant_id, foia_request_id, record_type, date_range_years,
        requester_category, estimated_volume, actual_search_hours,
        actual_review_hours, actual_pages, actual_fee, closed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
      [
        uuidv4(),
        estimate.tenant_id,
        foia_request_id,
        null, // Will be populated from request metadata
        0, // Will be populated from request metadata
        estimate.requester_category,
        'MEDIUM', // Will be populated from request metadata
        actual_search_hours,
        0, // Review hours not tracked yet
        actual_pages,
        actual_fee
      ]
    );

    res.json({
      success: true,
      data: {
        accuracy_percentage: Math.round(accuracy_percentage * 100) / 100
      },
      timestamp: new Date()
    });
  } catch (error: any) {
    console.error('Error tracking accuracy:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'TRACKING_FAILED',
        message: 'Failed to track accuracy',
        details: error.message
      },
      timestamp: new Date()
    });
  }
}
