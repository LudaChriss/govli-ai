/**
 * AI-7: Conversational Request Builder - Integration Example
 *
 * This file demonstrates how to integrate the ConversationalRequestBuilder
 * into the portal's /submit-request page with mode toggle functionality.
 */

'use client';

import React, { useState, useEffect } from 'react';
import ConversationalRequestBuilder from '../components/ConversationalRequestBuilder';
import axios from 'axios';

// ============================================================================
// Example: Submit Request Page with Chat/Form Toggle
// ============================================================================

interface DraftRequest {
  description: string;
  agencies: string[];
  date_range_start?: string;
  date_range_end?: string;
  format_preference?: 'electronic' | 'paper' | 'either';
}

type Mode = 'chat' | 'form';

export default function SubmitRequestPage() {
  const [mode, setMode] = useState<Mode>('chat');
  const [draftRequest, setDraftRequest] = useState<DraftRequest | null>(null);

  // ============================================================================
  // Cookie-based default mode (chat for first-time visitors)
  // ============================================================================

  useEffect(() => {
    const isFirstVisit = !document.cookie.includes('foia_visited=true');

    if (isFirstVisit) {
      setMode('chat');
      // Set cookie to expire in 1 year
      document.cookie = 'foia_visited=true; max-age=31536000; path=/';
    } else {
      // Returning users default to form
      setMode('form');
    }
  }, []);

  // ============================================================================
  // Handlers
  // ============================================================================

  const handleRequestReady = (draft: DraftRequest) => {
    console.log('Draft request ready:', draft);
    setDraftRequest(draft);
  };

  const handleSubmit = async (draft: DraftRequest) => {
    try {
      // Submit to A-1 intake API
      const response = await axios.post('/api/intake/requests', {
        description: draft.description,
        agencies: draft.agencies,
        date_range_start: draft.date_range_start,
        date_range_end: draft.date_range_end,
        format_preference: draft.format_preference,
        requester_name: 'User Name', // From auth context
        requester_email: 'user@example.com', // From auth context
        source: 'conversational_builder'
      });

      console.log('Request submitted:', response.data);

      // Show success message and redirect
      alert('Your FOIA request has been submitted successfully!');
      window.location.href = '/requests';
    } catch (error) {
      console.error('Failed to submit request:', error);
      throw error; // Let component handle error display
    }
  };

  const handleModeSwitch = () => {
    setMode(mode === 'chat' ? 'form' : 'chat');
  };

  // ============================================================================
  // Agency Context (fetch from API or config)
  // ============================================================================

  const agencyContext = {
    agency_name: 'City of Springfield',
    departments: [
      'Police Department',
      'Fire Department',
      'Public Works',
      'City Clerk',
      'Planning & Zoning',
      'Parks & Recreation'
    ],
    common_record_types: [
      'Police Reports',
      'Incident Reports',
      'Building Permits',
      'Business Licenses',
      'City Council Minutes',
      'Budget Documents',
      'Contracts',
      'Emails',
      'Meeting Agendas'
    ]
  };

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Submit a FOIA Request
          </h1>
          <p className="text-gray-600">
            Request public records from the City of Springfield
          </p>
        </div>

        {/* Mode Toggle */}
        <div className="bg-white rounded-lg shadow-sm p-2 inline-flex gap-2 mb-6">
          <button
            onClick={() => setMode('chat')}
            className={`px-6 py-3 rounded-lg font-medium transition-all ${
              mode === 'chat'
                ? 'bg-gradient-to-r from-blue-900 to-teal-700 text-white shadow-md'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
            aria-pressed={mode === 'chat'}
          >
            <span className="mr-2">💬</span>
            Chat with AI Guide
          </button>
          <button
            onClick={() => setMode('form')}
            className={`px-6 py-3 rounded-lg font-medium transition-all ${
              mode === 'form'
                ? 'bg-gradient-to-r from-blue-900 to-teal-700 text-white shadow-md'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
            aria-pressed={mode === 'form'}
          >
            <span className="mr-2">📝</span>
            Fill Out Form
          </button>
        </div>

        {/* Content */}
        <div className="bg-white rounded-lg shadow-lg overflow-hidden" style={{ height: 'calc(100vh - 300px)' }}>
          {mode === 'chat' ? (
            <ConversationalRequestBuilder
              agencyContext={agencyContext}
              onRequestReady={handleRequestReady}
              onSubmit={handleSubmit}
              onModeSwitch={handleModeSwitch}
              apiBaseUrl="/api"
            />
          ) : (
            <TraditionalFormComponent
              initialDraft={draftRequest}
              onSubmit={handleSubmit}
              onSwitchToChat={handleModeSwitch}
            />
          )}
        </div>

        {/* Help Text */}
        <div className="mt-6 text-center text-sm text-gray-500">
          <p>
            Need help? Check out our{' '}
            <a href="/faq" className="text-[#1e56b0] hover:underline">
              FOIA FAQ
            </a>
            {' '}or{' '}
            <a href="/contact" className="text-[#1e56b0] hover:underline">
              contact us
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Traditional Form Component (Placeholder)
// ============================================================================

function TraditionalFormComponent({
  initialDraft,
  onSubmit,
  onSwitchToChat
}: {
  initialDraft: DraftRequest | null;
  onSubmit: (draft: DraftRequest) => Promise<void>;
  onSwitchToChat: () => void;
}) {
  const [formData, setFormData] = useState<DraftRequest>(
    initialDraft || {
      description: '',
      agencies: [],
      date_range_start: '',
      date_range_end: '',
      format_preference: 'electronic'
    }
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await onSubmit(formData);
    } catch (err: any) {
      setError(err.message || 'Failed to submit request');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-6 overflow-y-auto h-full">
      <div className="max-w-2xl mx-auto">
        {/* Suggestion to try chat mode */}
        {!initialDraft && (
          <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6">
            <div className="flex items-start">
              <svg className="w-6 h-6 text-blue-500 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h3 className="text-sm font-medium text-blue-800 mb-1">
                  New to FOIA requests?
                </h3>
                <p className="text-sm text-white mb-2">
                  Try our AI guide! It will help you describe what you're looking for and build a complete request through conversation.
                </p>
                <button
                  onClick={onSwitchToChat}
                  className="text-sm font-medium text-[#1e56b0] hover:text-blue-800 underline"
                >
                  Switch to Chat Mode
                </button>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Description */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
              Request Description *
            </label>
            <textarea
              id="description"
              required
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full border border-gray-300 rounded-lg p-3 min-h-[120px] focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Describe the records you're requesting..."
            />
          </div>

          {/* Agencies */}
          <div>
            <label htmlFor="agencies" className="block text-sm font-medium text-gray-700 mb-2">
              Department(s) *
            </label>
            <input
              id="agencies"
              type="text"
              required
              value={formData.agencies.join(', ')}
              onChange={(e) => setFormData({ ...formData, agencies: e.target.value.split(',').map(s => s.trim()) })}
              className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g., Police Department, City Clerk"
            />
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="start-date" className="block text-sm font-medium text-gray-700 mb-2">
                Start Date
              </label>
              <input
                id="start-date"
                type="date"
                value={formData.date_range_start || ''}
                onChange={(e) => setFormData({ ...formData, date_range_start: e.target.value })}
                className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label htmlFor="end-date" className="block text-sm font-medium text-gray-700 mb-2">
                End Date
              </label>
              <input
                id="end-date"
                type="date"
                value={formData.date_range_end || ''}
                onChange={(e) => setFormData({ ...formData, date_range_end: e.target.value })}
                className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Format Preference */}
          <div>
            <label htmlFor="format" className="block text-sm font-medium text-gray-700 mb-2">
              Preferred Format
            </label>
            <select
              id="format"
              value={formData.format_preference}
              onChange={(e) => setFormData({ ...formData, format_preference: e.target.value as any })}
              className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="electronic">Electronic (Email/Download)</option>
              <option value="paper">Paper Copies</option>
              <option value="either">Either Format</option>
            </select>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-gradient-to-r from-blue-900 to-teal-700 text-white font-semibold py-3 px-6 rounded-lg hover:from-blue-800 hover:to-teal-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
          >
            {isSubmitting ? 'Submitting...' : 'Submit Request'}
          </button>
        </form>
      </div>
    </div>
  );
}
