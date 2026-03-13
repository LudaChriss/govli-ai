/**
 * AI-7: Conversational Request Builder - React Component
 */

'use client';

import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import clsx from 'clsx';

// ============================================================================
// Types
// ============================================================================

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  suggestedQuestions?: string[];
}

interface DraftRequest {
  description: string;
  agencies: string[];
  date_range_start?: string;
  date_range_end?: string;
  format_preference?: 'electronic' | 'paper' | 'either';
}

interface AgencyContext {
  agency_name?: string;
  departments?: string[];
  common_record_types?: string[];
}

interface ConversationalRequestBuilderProps {
  agencyContext?: AgencyContext;
  onRequestReady?: (draftRequest: DraftRequest) => void;
  onSubmit?: (draftRequest: DraftRequest) => Promise<void>;
  onModeSwitch?: () => void;
  apiBaseUrl?: string;
}

// ============================================================================
// Main Component
// ============================================================================

export default function ConversationalRequestBuilder({
  agencyContext,
  onRequestReady,
  onSubmit,
  onModeSwitch,
  apiBaseUrl = '/api'
}: ConversationalRequestBuilderProps) {
  const [sessionId, setSessionId] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [draftRequest, setDraftRequest] = useState<DraftRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ============================================================================
  // Effects
  // ============================================================================

  // Start session on mount
  useEffect(() => {
    startSession();
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Focus input when not loading
  useEffect(() => {
    if (!isLoading && !isReady) {
      inputRef.current?.focus();
    }
  }, [isLoading, isReady]);

  // ============================================================================
  // API Functions
  // ============================================================================

  const startSession = async () => {
    try {
      const response = await axios.post(`${apiBaseUrl}/ai/convo-builder/session/start`);
      const newSessionId = response.data.data.session_id;
      setSessionId(newSessionId);

      // Send initial greeting
      await sendMessage('', newSessionId, true);
    } catch (err: any) {
      console.error('Failed to start session:', err);
      setError('Failed to start conversation. Please refresh the page.');
    }
  };

  const sendMessage = async (content: string, sid?: string, isInitial = false) => {
    const currentSessionId = sid || sessionId;

    if (!currentSessionId) {
      setError('Session not initialized. Please refresh the page.');
      return;
    }

    setError(null);
    setIsLoading(true);

    // Add user message to UI (skip for initial greeting)
    if (!isInitial && content.trim()) {
      const userMessage: Message = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: content.trim(),
        timestamp: new Date()
      };
      setMessages(prev => [...prev, userMessage]);
      setInputValue('');
    }

    try {
      // Build message history for API
      const messageHistory = isInitial
        ? []
        : [
            ...messages.map(msg => ({
              role: msg.role,
              content: msg.content
            })),
            ...(content.trim() ? [{ role: 'user' as const, content: content.trim() }] : [])
          ];

      const response = await axios.post(`${apiBaseUrl}/ai/convo-builder/message`, {
        session_id: currentSessionId,
        messages: messageHistory.length > 0 ? messageHistory : [{ role: 'user', content: '' }],
        agency_context: agencyContext
      });

      const data = response.data.data;

      // Add AI response to messages
      const aiMessage: Message = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: data.message,
        timestamp: new Date(),
        suggestedQuestions: data.suggested_follow_up_questions || []
      };

      setMessages(prev => [...prev, aiMessage]);

      // Check if request is ready
      if (data.ready_to_submit && data.draft_request) {
        setIsReady(true);
        setDraftRequest(data.draft_request);
        onRequestReady?.(data.draft_request);
      }
    } catch (err: any) {
      console.error('Failed to send message:', err);

      // Check for rate limit error
      if (err.response?.status === 429) {
        setError('You\'ve reached the message limit. Please wait before sending more messages.');
      } else {
        setError('Failed to send message. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!inputValue.trim() || isLoading || isReady) {
      return;
    }

    await sendMessage(inputValue);
  };

  const handleSuggestedQuestion = async (question: string) => {
    if (isLoading || isReady) return;
    await sendMessage(question);
  };

  const handleDraftEdit = (field: keyof DraftRequest, value: any) => {
    if (!draftRequest) return;

    setDraftRequest({
      ...draftRequest,
      [field]: value
    });
  };

  const handleFinalSubmit = async () => {
    if (!draftRequest || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      if (onSubmit) {
        await onSubmit(draftRequest);
      }

      // Track completion
      await axios.post(
        `${apiBaseUrl}/ai/convo-builder/session/${sessionId}/complete`,
        {
          submitted: true,
          message_count: messages.length
        }
      );
    } catch (err: any) {
      console.error('Failed to submit request:', err);
      setError('Failed to submit request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartOver = () => {
    setMessages([]);
    setIsReady(false);
    setDraftRequest(null);
    setError(null);
    startSession();
  };

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="flex flex-col h-full bg-white rounded-lg shadow-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-900 to-teal-700 text-white p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold">FOIA Request Assistant</h2>
            <p className="text-sm text-white/80">Let's build your request together</p>
          </div>
        </div>

        {onModeSwitch && (
          <button
            onClick={onModeSwitch}
            className="text-sm text-white/90 hover:text-white underline"
            aria-label="Switch to form mode"
          >
            Prefer a form?
          </button>
        )}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 m-4">
          <div className="flex items-center">
            <svg className="w-5 h-5 text-red-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      {/* Messages Area */}
      {!isReady ? (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={clsx(
                'flex',
                message.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              <div
                className={clsx(
                  'max-w-[80%] rounded-lg p-3 shadow-sm',
                  message.role === 'user'
                    ? 'bg-gray-100 text-gray-900'
                    : 'bg-gradient-to-r from-blue-900 to-teal-700 text-white'
                )}
              >
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>

                {/* Suggested Questions */}
                {message.role === 'assistant' && message.suggestedQuestions && message.suggestedQuestions.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {message.suggestedQuestions.map((question, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSuggestedQuestion(question)}
                        disabled={isLoading}
                        className="block w-full text-left text-sm bg-white/20 hover:bg-white/30 disabled:bg-white/10 disabled:cursor-not-allowed rounded px-3 py-2 transition-colors"
                      >
                        {question}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Loading Indicator */}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-gradient-to-r from-blue-900 to-teal-700 text-white rounded-lg p-3 shadow-sm">
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      ) : (
        /* Draft Request Panel */
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto">
            <div className="bg-green-50 border-2 border-green-500 rounded-lg p-6 mb-6">
              <div className="flex items-center gap-3 mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h3 className="text-xl font-bold text-green-900">Your Request is Ready!</h3>
              </div>
              <p className="text-green-800">
                Review the details below and make any changes before submitting.
              </p>
            </div>

            {draftRequest && (
              <div className="space-y-6">
                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Request Description
                  </label>
                  <textarea
                    value={draftRequest.description}
                    onChange={(e) => handleDraftEdit('description', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg p-3 min-h-[120px] focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Describe the records you're requesting..."
                  />
                </div>

                {/* Agencies/Departments */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Department(s)
                  </label>
                  <input
                    type="text"
                    value={draftRequest.agencies.join(', ')}
                    onChange={(e) => handleDraftEdit('agencies', e.target.value.split(',').map(s => s.trim()))}
                    className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., Police Department, City Clerk"
                  />
                </div>

                {/* Date Range */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={draftRequest.date_range_start || ''}
                      onChange={(e) => handleDraftEdit('date_range_start', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      End Date
                    </label>
                    <input
                      type="date"
                      value={draftRequest.date_range_end || ''}
                      onChange={(e) => handleDraftEdit('date_range_end', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* Format Preference */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Preferred Format
                  </label>
                  <select
                    value={draftRequest.format_preference || 'either'}
                    onChange={(e) => handleDraftEdit('format_preference', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="electronic">Electronic (Email/Download)</option>
                    <option value="paper">Paper Copies</option>
                    <option value="either">Either Format</option>
                  </select>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-4 pt-4">
                  <button
                    onClick={handleFinalSubmit}
                    disabled={isSubmitting}
                    className="flex-1 bg-gradient-to-r from-blue-900 to-teal-700 text-white font-semibold py-3 px-6 rounded-lg hover:from-blue-800 hover:to-teal-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
                  >
                    {isSubmitting ? 'Submitting...' : 'Submit Request'}
                  </button>
                  <button
                    onClick={handleStartOver}
                    disabled={isSubmitting}
                    className="px-6 py-3 border-2 border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Start Over
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Input Area */}
      {!isReady && (
        <div className="border-t border-gray-200 p-4 bg-gray-50">
          <form onSubmit={handleSubmit} className="flex gap-3">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={isLoading}
              placeholder="Type your message..."
              className="flex-1 border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
              aria-label="Message input"
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || isLoading}
              className="bg-gradient-to-r from-blue-900 to-teal-700 text-white px-6 py-3 rounded-lg font-semibold hover:from-blue-800 hover:to-teal-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow"
              aria-label="Send message"
            >
              Send
            </button>
          </form>
          <p className="text-xs text-gray-500 mt-2 text-center">
            Powered by Govli AI • Helping you build better FOIA requests
          </p>
        </div>
      )}
    </div>
  );
}
