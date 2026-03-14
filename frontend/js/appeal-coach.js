/**
 * Appeal Coach Wizard (Vanilla JS)
 * Helps requesters analyze FOIA denials and draft appeals
 */

const API_BASE_URL = 'http://localhost:3000';

// State management
let currentState = {
  step: 1,
  confirmationNumber: '',
  requestId: '',
  analysis: null,
  selectedGrounds: [],
  requesterStatement: '',
  draftLetter: null
};

/**
 * Initialize the Appeal Coach wizard
 */
function initializeAppealCoach() {
  // Attach event listeners
  document.getElementById('searchRequestBtn')?.addEventListener('click', searchRequest);
  document.getElementById('analyzeAppealBtn')?.addEventListener('click', analyzeAppeal);
  document.getElementById('draftAppealBtn')?.addEventListener('click', draftAppeal);
  document.getElementById('submitAppealBtn')?.addEventListener('click', submitAppeal);
  document.getElementById('backToStep1Btn')?.addEventListener('click', () => goToStep(1));
  document.getElementById('backToStep2Btn')?.addEventListener('click', () => goToStep(2));
  document.getElementById('backToStep3Btn')?.addEventListener('click', () => goToStep(3));
}

/**
 * Navigate to a specific step
 */
function goToStep(step) {
  // Hide all steps
  for (let i = 1; i <= 5; i++) {
    const stepElement = document.getElementById(`step${i}`);
    if (stepElement) {
      stepElement.classList.add('hidden');
    }
  }

  // Show target step
  const targetStep = document.getElementById(`step${step}`);
  if (targetStep) {
    targetStep.classList.remove('hidden');
    currentState.step = step;
  }

  // Update progress indicator
  updateProgressIndicator(step);
}

/**
 * Update progress indicator
 */
function updateProgressIndicator(step) {
  for (let i = 1; i <= 5; i++) {
    const indicator = document.getElementById(`stepIndicator${i}`);
    if (indicator) {
      if (i < step) {
        indicator.classList.add('completed');
        indicator.classList.remove('active');
      } else if (i === step) {
        indicator.classList.add('active');
        indicator.classList.remove('completed');
      } else {
        indicator.classList.remove('active', 'completed');
      }
    }
  }
}

/**
 * Step 1: Search for request by confirmation number
 */
async function searchRequest() {
  const confirmationNumber = document.getElementById('confirmationNumberInput')?.value.trim();

  if (!confirmationNumber) {
    showMessage('error', 'Please enter a confirmation number', 'step1Messages');
    return;
  }

  try {
    showMessage('info', 'Searching for your request...', 'step1Messages');

    const response = await fetch(`${API_BASE_URL}/intake/requests/${confirmationNumber}/status`);
    const result = await response.json();

    if (!response.ok) {
      showMessage('error', result.message || 'Request not found', 'step1Messages');
      return;
    }

    const request = result.data;

    // Check if request is eligible for appeal coach
    if (!['DELIVERED', 'PARTIALLY_GRANTED', 'DENIED'].includes(request.status)) {
      showMessage('error', 'Appeal Coach is only available for delivered responses. Your request status is: ' + request.status, 'step1Messages');
      return;
    }

    // Save state and show summary
    currentState.confirmationNumber = confirmationNumber;
    currentState.requestId = request.id;

    displayRequestSummary(request);
    goToStep(2);
  } catch (error) {
    console.error('Error searching request:', error);
    showMessage('error', 'Failed to search for request. Please try again.', 'step1Messages');
  }
}

/**
 * Display request summary in Step 2
 */
function displayRequestSummary(request) {
  const summaryContainer = document.getElementById('requestSummary');
  if (!summaryContainer) return;

  summaryContainer.innerHTML = `
    <div class="glass rounded-lg p-4 mb-4">
      <h4 class="text-lg font-semibold text-white mb-3">Request Summary</h4>
      <div class="space-y-2">
        <div class="flex justify-between">
          <span class="text-gray-400">Tracking Number:</span>
          <span class="text-white font-semibold">${request.tracking_number || request.confirmation_number}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-400">Status:</span>
          <span class="px-2 py-1 rounded text-sm ${getStatusClass(request.status)}">${formatStatus(request.status)}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-400">Submitted:</span>
          <span class="text-white">${new Date(request.submitted_at || request.created_at).toLocaleDateString()}</span>
        </div>
        ${request.response_date ? `
        <div class="flex justify-between">
          <span class="text-gray-400">Response Date:</span>
          <span class="text-white">${new Date(request.response_date).toLocaleDateString()}</span>
        </div>
        ` : ''}
      </div>
    </div>
  `;
}

/**
 * Step 2: Analyze appeal with AI
 */
async function analyzeAppeal() {
  const analyzeBtn = document.getElementById('analyzeAppealBtn');
  if (!analyzeBtn) return;

  const originalText = analyzeBtn.innerHTML;
  analyzeBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Analyzing...';
  analyzeBtn.disabled = true;

  try {
    const response = await fetch(`${API_BASE_URL}/ai/appeal-coach/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        foia_request_id: currentState.requestId,
        confirmation_number: currentState.confirmationNumber
      })
    });

    const result = await response.json();

    if (!response.ok) {
      if (response.status === 429) {
        showMessage('error', result.error.message, 'step2Messages');
      } else {
        showMessage('error', result.error?.message || 'Analysis failed', 'step2Messages');
      }
      return;
    }

    currentState.analysis = result.data;
    displayAnalysisResults(result.data);
    goToStep(3);
  } catch (error) {
    console.error('Error analyzing appeal:', error);
    showMessage('error', 'Failed to analyze appeal. Please try again.', 'step2Messages');
  } finally {
    analyzeBtn.innerHTML = originalText;
    analyzeBtn.disabled = false;
  }
}

/**
 * Display analysis results in Step 3
 */
function displayAnalysisResults(analysis) {
  // Overall assessment
  const assessmentContainer = document.getElementById('overallAssessment');
  if (assessmentContainer) {
    assessmentContainer.innerHTML = `
      <div class="glass rounded-lg p-6 mb-6">
        <h4 class="text-lg font-semibold text-white mb-3 flex items-center">
          <i class="fas fa-gavel mr-2 text-cyan-400"></i>
          Overall Assessment
        </h4>
        <p class="text-gray-300 leading-relaxed">${analysis.overall_assessment}</p>

        ${analysis.frivolous_risk ? `
        <div class="mt-4 p-4 bg-yellow-500 bg-opacity-10 border border-yellow-500/30 rounded-lg">
          <p class="text-yellow-300 text-sm">
            <i class="fas fa-exclamation-triangle mr-2"></i>
            <strong>Note:</strong> The analysis suggests this appeal may have limited chances of success. Consider whether the time and effort required are worthwhile.
          </p>
        </div>
        ` : ''}

        ${!analysis.should_appeal ? `
        <div class="mt-4 p-4 bg-blue-500 bg-opacity-10 border border-blue-500/30 rounded-lg">
          <p class="text-blue-300 text-sm">
            <i class="fas fa-info-circle mr-2"></i>
            The analysis suggests the agency's determination may be appropriate. However, you still have the right to appeal if you disagree.
          </p>
        </div>
        ` : ''}
      </div>
    `;
  }

  // Exemption explanations
  const exemptionsContainer = document.getElementById('exemptionExplanations');
  if (exemptionsContainer && analysis.exemption_plain_explanations.length > 0) {
    exemptionsContainer.innerHTML = `
      <div class="glass rounded-lg p-6 mb-6">
        <h4 class="text-lg font-semibold text-white mb-4 flex items-center">
          <i class="fas fa-list-ul mr-2 text-cyan-400"></i>
          Exemptions Used
        </h4>
        <div class="space-y-3">
          ${analysis.exemption_plain_explanations.map(ex => `
            <div class="bg-gray-800 bg-opacity-40 rounded-lg p-4 border border-gray-700">
              <div class="flex items-start justify-between mb-2">
                <span class="font-semibold text-white">${ex.code}</span>
                ${ex.is_standard ? `
                  <span class="px-2 py-1 bg-green-500 bg-opacity-20 text-green-300 text-xs rounded">
                    Standard Use
                  </span>
                ` : `
                  <span class="px-2 py-1 bg-yellow-500 bg-opacity-20 text-yellow-300 text-xs rounded">
                    May Be Overbroad
                  </span>
                `}
              </div>
              <p class="text-gray-300 text-sm">${ex.plain_explanation}</p>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // Appealable items (grounds)
  const groundsContainer = document.getElementById('appealableGrounds');
  if (groundsContainer && analysis.appealable_items.length > 0) {
    groundsContainer.innerHTML = `
      <div class="glass rounded-lg p-6 mb-6">
        <h4 class="text-lg font-semibold text-white mb-4 flex items-center">
          <i class="fas fa-check-square mr-2 text-cyan-400"></i>
          Potential Appeal Grounds
        </h4>
        <p class="text-gray-400 text-sm mb-4">Select the grounds you want to include in your appeal:</p>
        <div class="space-y-3">
          ${analysis.appealable_items.map((item, index) => `
            <label class="flex items-start p-4 bg-gray-800 bg-opacity-40 rounded-lg border border-gray-700 cursor-pointer hover:bg-gray-700 transition">
              <input
                type="checkbox"
                class="mt-1 mr-3 h-4 w-4 text-cyan-600 rounded"
                value="${index}"
                onchange="toggleAppealGround(${index}, this.checked)"
              />
              <div class="flex-1">
                <div class="flex items-center justify-between mb-2">
                  ${item.document_title ? `<span class="font-medium text-white text-sm">${item.document_title}</span>` : ''}
                  <span class="px-2 py-1 text-xs rounded ${getLikelihoodClass(item.likelihood_of_success)}">
                    ${item.likelihood_of_success} chance
                  </span>
                </div>
                <p class="text-gray-400 text-sm mb-1"><strong>Claim:</strong> ${item.claim}</p>
                <p class="text-gray-300 text-sm">${item.suggested_appeal_ground}</p>
              </div>
            </label>
          `).join('')}
        </div>
      </div>
    `;
  }

  // Appeal tips
  if (analysis.appeal_tips && analysis.appeal_tips.length > 0) {
    const tipsContainer = document.getElementById('appealTips');
    if (tipsContainer) {
      tipsContainer.innerHTML = `
        <div class="glass rounded-lg p-6">
          <h4 class="text-lg font-semibold text-white mb-4 flex items-center">
            <i class="fas fa-lightbulb mr-2 text-yellow-400"></i>
            Tips for Your Appeal
          </h4>
          <ul class="space-y-2">
            ${analysis.appeal_tips.map(tip => `
              <li class="flex items-start text-gray-300 text-sm">
                <i class="fas fa-check-circle text-cyan-400 mr-2 mt-0.5"></i>
                <span>${tip}</span>
              </li>
            `).join('')}
          </ul>
        </div>
      `;
    }
  }
}

/**
 * Toggle appeal ground selection
 */
function toggleAppealGround(index, checked) {
  const ground = currentState.analysis.appealable_items[index].suggested_appeal_ground;

  if (checked) {
    if (!currentState.selectedGrounds.includes(ground)) {
      currentState.selectedGrounds.push(ground);
    }
  } else {
    currentState.selectedGrounds = currentState.selectedGrounds.filter(g => g !== ground);
  }
}

/**
 * Step 3: Draft appeal letter
 */
async function draftAppeal() {
  if (currentState.selectedGrounds.length === 0) {
    showMessage('error', 'Please select at least one appeal ground', 'step3Messages');
    return;
  }

  const draftBtn = document.getElementById('draftAppealBtn');
  if (!draftBtn) return;

  const originalText = draftBtn.innerHTML;
  draftBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Drafting...';
  draftBtn.disabled = true;

  try {
    const requesterStatement = document.getElementById('requesterStatement')?.value || '';

    const response = await fetch(`${API_BASE_URL}/ai/appeal-coach/draft-appeal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        foia_request_id: currentState.requestId,
        confirmation_number: currentState.confirmationNumber,
        selected_grounds: currentState.selectedGrounds,
        requester_statement: requesterStatement
      })
    });

    const result = await response.json();

    if (!response.ok) {
      showMessage('error', result.error?.message || 'Draft failed', 'step3Messages');
      return;
    }

    currentState.draftLetter = result.data;
    displayDraftLetter(result.data);
    goToStep(4);
  } catch (error) {
    console.error('Error drafting appeal:', error);
    showMessage('error', 'Failed to draft appeal. Please try again.', 'step3Messages');
  } finally {
    draftBtn.innerHTML = originalText;
    draftBtn.disabled = false;
  }
}

/**
 * Display draft letter in Step 4
 */
function displayDraftLetter(draft) {
  const letterContainer = document.getElementById('draftLetterText');
  if (letterContainer) {
    letterContainer.value = draft.letter;
  }

  // Show key arguments
  if (draft.key_arguments && draft.key_arguments.length > 0) {
    const argsContainer = document.getElementById('keyArguments');
    if (argsContainer) {
      argsContainer.innerHTML = `
        <div class="glass rounded-lg p-4 mb-4">
          <h5 class="text-sm font-semibold text-white mb-2">Key Arguments:</h5>
          <ul class="list-disc list-inside space-y-1">
            ${draft.key_arguments.map(arg => `
              <li class="text-gray-300 text-sm">${arg}</li>
            `).join('')}
          </ul>
        </div>
      `;
    }
  }

  // Show suggested edits
  if (draft.suggested_edits && draft.suggested_edits.length > 0) {
    const editsContainer = document.getElementById('suggestedEdits');
    if (editsContainer) {
      editsContainer.innerHTML = `
        <div class="glass rounded-lg p-4">
          <h5 class="text-sm font-semibold text-yellow-300 mb-2 flex items-center">
            <i class="fas fa-lightbulb mr-2"></i>
            Suggestions:
          </h5>
          <ul class="space-y-1">
            ${draft.suggested_edits.map(edit => `
              <li class="text-gray-300 text-sm">• ${edit}</li>
            `).join('')}
          </ul>
        </div>
      `;
    }
  }
}

/**
 * Step 4: Submit appeal (placeholder - would integrate with actual submission)
 */
async function submitAppeal() {
  const editedLetter = document.getElementById('draftLetterText')?.value;

  if (!editedLetter) {
    showMessage('error', 'Please review the letter before submitting', 'step4Messages');
    return;
  }

  // In a real implementation, this would submit the appeal via the API
  // For now, show success message and download option
  showMessage('success', 'Your appeal letter is ready! You can download it or copy the text to submit through your agency\'s appeal process.', 'step4Messages');

  goToStep(5);
}

/**
 * Utility functions
 */
function showMessage(type, message, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const bgColor = type === 'success' ? 'bg-green-500/10' :
                  type === 'error' ? 'bg-red-500/10' :
                  'bg-blue-500/10';
  const borderColor = type === 'success' ? 'border-green-500/30' :
                      type === 'error' ? 'border-red-500/30' :
                      'border-blue-500/30';
  const textColor = type === 'success' ? 'text-green-300' :
                    type === 'error' ? 'text-red-300' :
                    'text-blue-300';
  const icon = type === 'success' ? 'fa-check-circle' :
               type === 'error' ? 'fa-exclamation-circle' :
               'fa-info-circle';

  container.innerHTML = `
    <div class="glass ${bgColor} border ${borderColor} rounded-lg p-4 mb-4">
      <div class="flex items-start">
        <i class="fas ${icon} ${textColor} text-lg mr-3 mt-0.5"></i>
        <p class="${textColor} text-sm">${message}</p>
      </div>
    </div>
  `;
  container.classList.remove('hidden');
}

function getStatusClass(status) {
  const classes = {
    'DELIVERED': 'bg-green-500 bg-opacity-20 text-green-400',
    'PARTIALLY_GRANTED': 'bg-yellow-500 bg-opacity-20 text-yellow-400',
    'DENIED': 'bg-red-500 bg-opacity-20 text-red-400'
  };
  return classes[status] || 'bg-gray-500 bg-opacity-20 text-gray-400';
}

function formatStatus(status) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function getLikelihoodClass(likelihood) {
  const classes = {
    'high': 'bg-green-500 bg-opacity-20 text-green-300',
    'medium': 'bg-yellow-500 bg-opacity-20 text-yellow-300',
    'low': 'bg-red-500 bg-opacity-20 text-red-300'
  };
  return classes[likelihood] || 'bg-gray-500 bg-opacity-20 text-gray-300';
}

// Initialize when DOM is loaded
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', initializeAppealCoach);
}

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initializeAppealCoach,
    searchRequest,
    analyzeAppeal,
    draftAppeal,
    submitAppeal
  };
}
