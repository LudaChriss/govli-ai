/**
 * Fee Estimate Display Component (Vanilla JS)
 * Fetches and displays fee estimates for FOIA requests
 */

/**
 * Fetch fee estimate for a request
 * @param {string} requestId - FOIA request ID
 * @param {string} confirmationNumber - Optional confirmation number for public access
 * @returns {Promise<Object>} Fee estimate data
 */
async function fetchFeeEstimate(requestId, confirmationNumber = null) {
  const API_BASE_URL = 'http://localhost:3000';
  const url = confirmationNumber
    ? `${API_BASE_URL}/ai/fees/estimate/${requestId}?confirmation_number=${confirmationNumber}`
    : `${API_BASE_URL}/ai/fees/estimate/${requestId}`;

  const response = await fetch(url);
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error?.message || 'Failed to fetch fee estimate');
  }

  return result.data;
}

/**
 * Display fee estimate in a container
 * @param {string} containerId - ID of the container element
 * @param {Object} estimate - Fee estimate data
 */
function displayFeeEstimate(containerId, estimate) {
  const container = document.getElementById(containerId);
  if (!container) {
    console.error('Fee estimate container not found:', containerId);
    return;
  }

  const noFeesAnticipated = estimate.fee_estimate_high < (estimate.fee_waiver_threshold || 15);

  // Build the HTML
  let html = `
    <div class="glass rounded-xl p-6">
      <!-- Header -->
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-xl font-semibold text-white flex items-center">
          <i class="fas fa-dollar-sign mr-2 text-green-400"></i>
          Fee Estimate
        </h3>
        ${estimate.likely_fee_waiver_eligible ? `
          <span class="px-3 py-1 bg-blue-500 bg-opacity-20 text-blue-300 text-xs font-semibold rounded-full border border-blue-500/30">
            Waiver Eligible
          </span>
        ` : ''}
      </div>

      <!-- Main Fee Display -->
      ${noFeesAnticipated ? `
        <div class="bg-green-500 bg-opacity-10 border border-green-500/30 rounded-lg p-4 mb-4">
          <div class="flex items-center">
            <i class="fas fa-check-circle text-2xl text-green-400 mr-3"></i>
            <div>
              <p class="text-lg font-bold text-green-300">
                No fees anticipated for this request
              </p>
              <p class="text-sm text-green-400">
                Based on the scope and your requester category
              </p>
            </div>
          </div>
        </div>
      ` : `
        <div class="mb-4">
          <div class="text-center py-6 bg-gradient-to-r from-blue-500/10 to-cyan-500/10 rounded-lg border border-blue-500/30">
            <p class="text-sm text-gray-400 mb-2">Estimated Fee Range</p>
            <p class="text-4xl font-bold text-white">
              $${estimate.fee_estimate_low.toFixed(2)} - $${estimate.fee_estimate_high.toFixed(2)}
            </p>
            <p class="text-sm text-gray-400 mt-2">
              Most likely: <span class="font-semibold text-cyan-300">$${estimate.likely_fee.toFixed(2)}</span>
            </p>
          </div>
        </div>
      `}

      <!-- Plain English Explanation -->
      <div class="mb-4 p-4 bg-gray-800 bg-opacity-40 rounded-lg border border-gray-700">
        <p class="text-gray-300 text-sm leading-relaxed">
          ${estimate.plain_english_explanation}
        </p>
      </div>

      <!-- Breakdown Accordion -->
      ${!noFeesAnticipated ? `
        <div class="border-t border-gray-700 pt-4">
          <button
            onclick="toggleFeeBreakdown('${containerId}')"
            class="flex items-center justify-between w-full text-left text-sm font-medium text-gray-300 hover:text-white transition-colors"
            id="${containerId}-breakdown-toggle"
          >
            <span>View Fee Breakdown</span>
            <i class="fas fa-chevron-down transition-transform" id="${containerId}-breakdown-icon"></i>
          </button>

          <div class="hidden mt-4 space-y-3" id="${containerId}-breakdown-content">
            ${estimate.fee_breakdown.search_cost > 0 ? `
              <div class="flex justify-between items-center py-2 border-b border-gray-700">
                <div>
                  <p class="text-sm font-medium text-gray-300">Search Time</p>
                  <p class="text-xs text-gray-500">${estimate.fee_breakdown.search_hours} hours</p>
                </div>
                <p class="text-sm font-semibold text-white">
                  $${estimate.fee_breakdown.search_cost.toFixed(2)}
                </p>
              </div>
            ` : ''}

            ${estimate.fee_breakdown.review_cost > 0 ? `
              <div class="flex justify-between items-center py-2 border-b border-gray-700">
                <div>
                  <p class="text-sm font-medium text-gray-300">Review Time</p>
                  <p class="text-xs text-gray-500">${estimate.fee_breakdown.review_hours} hours</p>
                </div>
                <p class="text-sm font-semibold text-white">
                  $${estimate.fee_breakdown.review_cost.toFixed(2)}
                </p>
              </div>
            ` : ''}

            ${estimate.fee_breakdown.copy_cost > 0 ? `
              <div class="flex justify-between items-center py-2 border-b border-gray-700">
                <div>
                  <p class="text-sm font-medium text-gray-300">Copying</p>
                  <p class="text-xs text-gray-500">~${estimate.fee_breakdown.estimated_pages} pages</p>
                </div>
                <p class="text-sm font-semibold text-white">
                  $${estimate.fee_breakdown.copy_cost.toFixed(2)}
                </p>
              </div>
            ` : ''}

            ${estimate.fee_breakdown.exemptions_applied.length > 0 ? `
              <div class="mt-3 p-3 bg-blue-500 bg-opacity-10 rounded-lg border border-blue-500/30">
                <p class="text-xs font-semibold text-blue-300 mb-2">Exemptions Applied:</p>
                <ul class="space-y-1">
                  ${estimate.fee_breakdown.exemptions_applied.map(exemption => `
                    <li class="text-xs text-blue-400 flex items-start">
                      <i class="fas fa-check-circle mr-2 mt-0.5 text-green-400"></i>
                      ${exemption}
                    </li>
                  `).join('')}
                </ul>
              </div>
            ` : ''}

            <!-- Total -->
            <div class="flex justify-between items-center pt-3 border-t border-gray-600">
              <p class="text-base font-bold text-white">Total</p>
              <p class="text-lg font-bold text-cyan-300">
                $${estimate.fee_breakdown.total.toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      ` : ''}

      <!-- Fee Waiver CTA -->
      ${estimate.likely_fee_waiver_eligible && estimate.waiver_application_url ? `
        <div class="mt-4 p-4 bg-blue-500 bg-opacity-10 border border-blue-500/30 rounded-lg">
          <div class="flex items-start">
            <i class="fas fa-info-circle text-blue-400 text-xl mr-3 mt-1"></i>
            <div class="flex-1">
              <p class="text-sm font-semibold text-blue-200 mb-2">
                You may qualify for a fee waiver
              </p>
              <p class="text-xs text-blue-300 mb-3">
                Based on your requester category, you may be eligible to have these fees waived if disclosure is in the public interest.
              </p>
              <a
                href="${estimate.waiver_application_url}"
                class="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors"
              >
                Apply for Fee Waiver
                <i class="fas fa-arrow-right ml-2"></i>
              </a>
            </div>
          </div>
        </div>
      ` : ''}
    </div>
  `;

  container.innerHTML = html;
  container.classList.remove('hidden');
}

/**
 * Toggle fee breakdown accordion
 * @param {string} containerId - Container ID
 */
function toggleFeeBreakdown(containerId) {
  const content = document.getElementById(`${containerId}-breakdown-content`);
  const icon = document.getElementById(`${containerId}-breakdown-icon`);

  if (content && icon) {
    content.classList.toggle('hidden');
    icon.classList.toggle('fa-chevron-down');
    icon.classList.toggle('fa-chevron-up');
  }
}

/**
 * Load and display fee estimate for a request
 * @param {string} requestId - FOIA request ID
 * @param {string} containerId - Container element ID
 * @param {string} confirmationNumber - Optional confirmation number
 */
async function loadFeeEstimate(requestId, containerId, confirmationNumber = null) {
  const container = document.getElementById(containerId);
  if (!container) {
    console.error('Fee estimate container not found:', containerId);
    return;
  }

  try {
    // Show loading state
    container.innerHTML = `
      <div class="glass rounded-xl p-6 text-center">
        <i class="fas fa-spinner fa-spin text-3xl text-cyan-400 mb-3"></i>
        <p class="text-gray-400">Loading fee estimate...</p>
      </div>
    `;
    container.classList.remove('hidden');

    // Fetch estimate
    const estimate = await fetchFeeEstimate(requestId, confirmationNumber);

    // Display estimate
    displayFeeEstimate(containerId, estimate);
  } catch (error) {
    console.error('Error loading fee estimate:', error);

    // Show error state (non-blocking)
    container.innerHTML = `
      <div class="glass rounded-xl p-6 bg-yellow-500 bg-opacity-10 border border-yellow-500/30">
        <div class="flex items-start">
          <i class="fas fa-exclamation-triangle text-yellow-400 text-xl mr-3 mt-1"></i>
          <div>
            <p class="text-yellow-300 text-sm font-medium mb-1">
              Fee estimate temporarily unavailable
            </p>
            <p class="text-yellow-400 text-xs">
              We're working on generating your fee estimate. Please check back shortly or contact us for details.
            </p>
          </div>
        </div>
      </div>
    `;
  }
}

// Export functions for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    fetchFeeEstimate,
    displayFeeEstimate,
    toggleFeeBreakdown,
    loadFeeEstimate
  };
}
