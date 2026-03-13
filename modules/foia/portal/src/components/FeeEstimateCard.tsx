/**
 * AI-8: Real-Time Fee Estimator - Fee Estimate Card Component
 * Displays fee estimate on confirmation page
 */

'use client';

import React, { useState } from 'react';
import clsx from 'clsx';

// ============================================================================
// Types
// ============================================================================

interface FeeBreakdown {
  search_hours: number;
  search_cost: number;
  review_hours?: number;
  review_cost?: number;
  estimated_pages: number;
  copy_cost: number;
  subtotal: number;
  exemptions_applied: string[];
  total: number;
}

interface FeeEstimateCardProps {
  feeLow: number;
  feeHigh: number;
  likelyFee: number;
  waiverEligible: boolean;
  plainEnglishExplanation: string;
  feeBreakdown: FeeBreakdown;
  waiverApplicationUrl?: string;
  belowThreshold?: boolean;
  estimationConfidence?: 'low' | 'medium' | 'high';
}

// ============================================================================
// Main Component
// ============================================================================

export default function FeeEstimateCard({
  feeLow,
  feeHigh,
  likelyFee,
  waiverEligible,
  plainEnglishExplanation,
  feeBreakdown,
  waiverApplicationUrl,
  belowThreshold = false,
  estimationConfidence = 'medium'
}: FeeEstimateCardProps) {
  const [showBreakdown, setShowBreakdown] = useState(false);

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-900 to-teal-700 text-white p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h2 className="text-xl font-bold">Estimated Fees</h2>
              <p className="text-sm text-white/80">
                {estimationConfidence === 'high' ? 'High confidence' : estimationConfidence === 'low' ? 'Preliminary estimate' : 'Moderate confidence'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6">
        {/* No Fees Anticipated */}
        {belowThreshold ? (
          <div className="bg-green-50 border-2 border-green-500 rounded-lg p-6 mb-6">
            <div className="flex items-center gap-3">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h3 className="text-lg font-bold text-green-900">No Fees Anticipated</h3>
                <p className="text-green-800 mt-1">
                  The estimated fee for this request is below the minimum threshold. No payment will be required.
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* Fee Range Display */
          <div className="text-center mb-6">
            <div className="text-5xl font-bold text-gray-900 mb-2">
              ${feeLow.toFixed(2)} - ${feeHigh.toFixed(2)}
            </div>
            <p className="text-lg text-gray-600">
              Most likely: <span className="font-semibold text-gray-900">${likelyFee.toFixed(2)}</span>
            </p>
          </div>
        )}

        {/* Fee Waiver Banner */}
        {waiverEligible && waiverApplicationUrl && (
          <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6">
            <div className="flex items-start">
              <svg className="w-6 h-6 text-blue-500 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex-1">
                <h3 className="text-sm font-medium text-blue-800 mb-1">
                  You May Qualify for a Fee Waiver
                </h3>
                <p className="text-sm text-blue-700 mb-3">
                  Based on your requester category, you may be eligible for a fee waiver or reduction.
                </p>
                <a
                  href={waiverApplicationUrl}
                  className="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-800 underline"
                >
                  Apply for Fee Waiver
                  <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Plain-English Explanation */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">
            About These Fees
          </h3>
          <p className="text-gray-700 leading-relaxed">
            {plainEnglishExplanation}
          </p>
        </div>

        {/* Breakdown Accordion */}
        <div className="border border-gray-200 rounded-lg">
          <button
            onClick={() => setShowBreakdown(!showBreakdown)}
            className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
            aria-expanded={showBreakdown}
          >
            <span className="font-medium text-gray-900">View Detailed Breakdown</span>
            <svg
              className={clsx(
                'w-5 h-5 text-gray-500 transition-transform',
                showBreakdown && 'transform rotate-180'
              )}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showBreakdown && (
            <div className="p-4 border-t border-gray-200 bg-gray-50">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-200">
                  {/* Search Hours */}
                  <tr>
                    <td className="py-2 text-gray-700">
                      Search Time ({feeBreakdown.search_hours.toFixed(1)} hours)
                    </td>
                    <td className="py-2 text-right font-medium text-gray-900">
                      ${feeBreakdown.search_cost.toFixed(2)}
                    </td>
                  </tr>

                  {/* Review Hours (if applicable) */}
                  {feeBreakdown.review_hours && feeBreakdown.review_hours > 0 && (
                    <tr>
                      <td className="py-2 text-gray-700">
                        Review Time ({feeBreakdown.review_hours.toFixed(1)} hours)
                      </td>
                      <td className="py-2 text-right font-medium text-gray-900">
                        ${feeBreakdown.review_cost?.toFixed(2)}
                      </td>
                    </tr>
                  )}

                  {/* Copying */}
                  <tr>
                    <td className="py-2 text-gray-700">
                      Copying ({feeBreakdown.estimated_pages} pages)
                    </td>
                    <td className="py-2 text-right font-medium text-gray-900">
                      ${feeBreakdown.copy_cost.toFixed(2)}
                    </td>
                  </tr>

                  {/* Exemptions */}
                  {feeBreakdown.exemptions_applied.length > 0 && (
                    <tr>
                      <td colSpan={2} className="py-2">
                        <div className="text-xs text-green-700 bg-green-50 rounded px-2 py-1">
                          <strong>Exemptions Applied:</strong>
                          <ul className="mt-1 ml-4 list-disc">
                            {feeBreakdown.exemptions_applied.map((exemption, idx) => (
                              <li key={idx}>{exemption}</li>
                            ))}
                          </ul>
                        </div>
                      </td>
                    </tr>
                  )}

                  {/* Subtotal */}
                  <tr className="border-t-2 border-gray-300">
                    <td className="py-2 font-semibold text-gray-900">Subtotal</td>
                    <td className="py-2 text-right font-semibold text-gray-900">
                      ${feeBreakdown.subtotal.toFixed(2)}
                    </td>
                  </tr>

                  {/* Total */}
                  <tr className="bg-gray-100">
                    <td className="py-3 font-bold text-gray-900 text-base">Estimated Total</td>
                    <td className="py-3 text-right font-bold text-gray-900 text-base">
                      ${feeBreakdown.total.toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Disclaimer */}
        <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <p className="text-xs text-gray-600 leading-relaxed">
            <strong>Please Note:</strong> This is an estimate based on the information you provided.
            Actual fees may vary depending on the records found and the time required to process your request.
            You will receive advance notice if fees are expected to exceed the stated threshold.
          </p>
        </div>
      </div>
    </div>
  );
}
