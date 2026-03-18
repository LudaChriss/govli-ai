/**
 * Govli UI - Fee Estimate Card Component
 * Displays fee estimates for FOIA requests
 */

import React, { useState } from 'react';

export interface FeeEstimate {
  estimate_id: string;
  fee_estimate_low: number;
  fee_estimate_high: number;
  likely_fee: number;
  likely_fee_waiver_eligible: boolean;
  plain_english_explanation: string;
  fee_breakdown: {
    search_hours: number;
    search_cost: number;
    review_hours: number;
    review_cost: number;
    estimated_pages: number;
    copy_cost: number;
    subtotal: number;
    exemptions_applied: string[];
    total: number;
  };
  waiver_application_url: string | null;
  fee_waiver_threshold?: number;
}

export interface FeeEstimateCardProps {
  estimate: FeeEstimate;
  className?: string;
}

export function FeeEstimateCard({ estimate, className = '' }: FeeEstimateCardProps) {
  const [showBreakdown, setShowBreakdown] = useState(false);

  const noFeesAnticipated = estimate.fee_estimate_high < (estimate.fee_waiver_threshold || 15);

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center">
          <svg className="w-6 h-6 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Fee Estimate
        </h3>
        {estimate.likely_fee_waiver_eligible && (
          <span className="px-3 py-1 bg-navy-800 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs font-semibold rounded-full">
            Waiver Eligible
          </span>
        )}
      </div>

      {/* Main Fee Display */}
      {noFeesAnticipated ? (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-4">
          <div className="flex items-center">
            <svg className="w-6 h-6 text-green-600 dark:text-green-400 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-lg font-bold text-green-800 dark:text-green-200">
                No fees anticipated for this request
              </p>
              <p className="text-sm text-green-700 dark:text-green-300">
                Based on the scope and your requester category
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="mb-4">
          <div className="text-center py-4 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Estimated Fee Range</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">
              ${estimate.fee_estimate_low.toFixed(2)} - ${estimate.fee_estimate_high.toFixed(2)}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Most likely: <span className="font-semibold text-gray-700 dark:text-gray-300">${estimate.likely_fee.toFixed(2)}</span>
            </p>
          </div>
        </div>
      )}

      {/* Plain English Explanation */}
      <div className="mb-4">
        <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">
          {estimate.plain_english_explanation}
        </p>
      </div>

      {/* Breakdown Accordion */}
      {!noFeesAnticipated && (
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <button
            onClick={() => setShowBreakdown(!showBreakdown)}
            className="flex items-center justify-between w-full text-left text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <span>View Fee Breakdown</span>
            <svg
              className={`w-5 h-5 transition-transform ${showBreakdown ? 'transform rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showBreakdown && (
            <div className="mt-4 space-y-3">
              {/* Search Fees */}
              {estimate.fee_breakdown.search_cost > 0 && (
                <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
                  <div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Search Time</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {estimate.fee_breakdown.search_hours} hours
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    ${estimate.fee_breakdown.search_cost.toFixed(2)}
                  </p>
                </div>
              )}

              {/* Review Fees */}
              {estimate.fee_breakdown.review_cost > 0 && (
                <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
                  <div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Review Time</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {estimate.fee_breakdown.review_hours} hours
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    ${estimate.fee_breakdown.review_cost.toFixed(2)}
                  </p>
                </div>
              )}

              {/* Copy Fees */}
              {estimate.fee_breakdown.copy_cost > 0 && (
                <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
                  <div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Copying</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      ~{estimate.fee_breakdown.estimated_pages} pages
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    ${estimate.fee_breakdown.copy_cost.toFixed(2)}
                  </p>
                </div>
              )}

              {/* Exemptions */}
              {estimate.fee_breakdown.exemptions_applied.length > 0 && (
                <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <p className="text-xs font-semibold text-blue-800 dark:text-blue-200 mb-2">
                    Exemptions Applied:
                  </p>
                  <ul className="space-y-1">
                    {estimate.fee_breakdown.exemptions_applied.map((exemption, idx) => (
                      <li key={idx} className="text-xs text-white dark:text-blue-300 flex items-start">
                        <svg className="w-4 h-4 mr-1 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        {exemption}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Total */}
              <div className="flex justify-between items-center pt-3 border-t border-gray-300 dark:border-gray-600">
                <p className="text-base font-bold text-gray-900 dark:text-white">Total</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  ${estimate.fee_breakdown.total.toFixed(2)}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Fee Waiver CTA */}
      {estimate.likely_fee_waiver_eligible && estimate.waiver_application_url && (
        <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-[#1e56b0] dark:text-blue-400 mr-3 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-2">
                You may qualify for a fee waiver
              </p>
              <p className="text-xs text-blue-800 dark:text-blue-300 mb-3">
                Based on your requester category, you may be eligible to have these fees waived if disclosure is in the public interest.
              </p>
              <a
                href={estimate.waiver_application_url}
                className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors"
              >
                Apply for Fee Waiver
                <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default FeeEstimateCard;
