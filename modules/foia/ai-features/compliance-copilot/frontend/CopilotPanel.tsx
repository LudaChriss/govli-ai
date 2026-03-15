/**
 * AI-14: Compliance Copilot Panel Component
 *
 * Collapsible right sidebar chat interface for FOIA compliance assistance
 *
 * Features:
 * - Persistent chat sessions across page navigation
 * - Jurisdiction-specific legal guidance
 * - Citation rendering with expandable accordions
 * - Quick action buttons
 * - Keyboard shortcut: Ctrl+K to focus input
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import './CopilotPanel.css';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  citations?: Array<{
    statute: string;
    text: string;
  }>;
  suggested_actions?: string[];
  model_used?: string;
}

interface CopilotPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  tenantId: string;
  userId: string;
  userRole: string;
  currentScreen: string;
  foiaRequestId?: string;
}

export const CopilotPanel: React.FC<CopilotPanelProps> = ({
  isOpen,
  onToggle,
  tenantId,
  userId,
  userRole,
  currentScreen,
  foiaRequestId
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string>('');
  const [expandedCitations, setExpandedCitations] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize session ID
  useEffect(() => {
    // Try to load existing session from localStorage
    const storedSessionId = localStorage.getItem('copilot_session_id');
    if (storedSessionId) {
      setSessionId(storedSessionId);
      loadSessionHistory(storedSessionId);
    } else {
      // Generate new session ID
      const newSessionId = crypto.randomUUID();
      setSessionId(newSessionId);
      localStorage.setItem('copilot_session_id', newSessionId);
    }
  }, []);

  // Load session history
  const loadSessionHistory = async (sid: string) => {
    try {
      const response = await fetch(`/api/ai/copilot/history/${sid}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data.messages) {
          setMessages(data.data.messages);
        }
      }
    } catch (error) {
      console.error('[CopilotPanel] Failed to load history:', error);
    }
  };

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Keyboard shortcut: Ctrl+K to focus input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        if (!isOpen) {
          onToggle();
        }
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onToggle]);

  // Send message to copilot
  const sendMessage = useCallback(async (messageContent?: string) => {
    const content = messageContent || inputValue.trim();
    if (!content) return;

    const userMessage: Message = {
      role: 'user',
      content
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/ai/copilot/message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({
          session_id: sessionId,
          messages: [...messages, userMessage],
          context: {
            foia_request_id: foiaRequestId,
            current_screen: currentScreen,
            officer_role: userRole,
            tenant_id: tenantId
          }
        })
      });

      const data = await response.json();

      if (data.success) {
        const assistantMessage: Message = {
          role: 'assistant',
          content: data.data.message,
          citations: data.data.citations,
          suggested_actions: data.data.suggested_actions,
          model_used: data.data.model_used
        };

        setMessages(prev => [...prev, assistantMessage]);
      } else {
        // Error message
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `Error: ${data.error || 'Failed to get response'}`
        }]);
      }
    } catch (error) {
      console.error('[CopilotPanel] Error sending message:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I encountered an error processing your request.'
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [inputValue, sessionId, messages, foiaRequestId, currentScreen, userRole, tenantId]);

  // Handle quick actions
  const handleQuickAction = async (action: 'exemption' | 'extension' | 'deadline') => {
    setIsLoading(true);

    try {
      let endpoint = '';
      let body: any = {};

      switch (action) {
        case 'exemption':
          const snippet = prompt('Enter text snippet to check for exemptions:');
          if (!snippet) return;
          endpoint = '/api/ai/copilot/quick/check-exemption';
          body = { text_snippet: snippet, tenant_id: tenantId };
          break;

        case 'extension':
          if (!foiaRequestId) {
            alert('Please open a request to use this action');
            return;
          }
          const reason = prompt('Reason for extension:');
          if (!reason) return;
          endpoint = '/api/ai/copilot/quick/draft-extension';
          body = { foia_request_id: foiaRequestId, reason };
          break;

        case 'deadline':
          if (!foiaRequestId) {
            alert('Please open a request to use this action');
            return;
          }
          endpoint = '/api/ai/copilot/quick/explain-deadline';
          body = { foia_request_id: foiaRequestId };
          break;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify(body)
      });

      const data = await response.json();

      if (data.success) {
        // Format quick action result as a message
        let resultMessage = '';

        if (action === 'exemption') {
          resultMessage = 'Likely exemptions:\n\n';
          data.data.likely_exemptions.forEach((ex: any) => {
            resultMessage += `${ex.code} (${Math.round(ex.confidence * 100)}% confidence)\n${ex.reason}\n\n`;
          });
        } else if (action === 'extension') {
          resultMessage = `Extension Notice:\n\n${data.data.extension_notice_text}\n\nNew Deadline: ${new Date(data.data.new_deadline).toLocaleDateString()}`;
        } else if (action === 'deadline') {
          resultMessage = `Deadline: ${new Date(data.data.deadline).toLocaleDateString()}\nBusiness Days Remaining: ${data.data.business_days_remaining}\n\nStatutory Basis: ${data.data.statutory_basis}\n\nExtension Available: ${data.data.extension_available ? 'Yes' : 'No'}`;
        }

        setMessages(prev => [...prev, {
          role: 'assistant',
          content: resultMessage
        }]);
      }
    } catch (error) {
      console.error('[CopilotPanel] Quick action error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle citation expansion
  const toggleCitation = (citationKey: string) => {
    setExpandedCitations(prev => {
      const next = new Set(prev);
      if (next.has(citationKey)) {
        next.delete(citationKey);
      } else {
        next.add(citationKey);
      }
      return next;
    });
  };

  // Handle Enter key (Shift+Enter for new line)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* Toggle button (visible when panel closed) */}
      {!isOpen && (
        <button
          className="copilot-toggle-btn"
          onClick={onToggle}
          title="Open Compliance Copilot (Ctrl+K)"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" fill="currentColor"/>
            <path d="M12 6.5c-3.04 0-5.5 2.46-5.5 5.5s2.46 5.5 5.5 5.5 5.5-2.46 5.5-5.5-2.46-5.5-5.5-5.5zm0 9c-1.93 0-3.5-1.57-3.5-3.5S10.07 8.5 12 8.5s3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z" fill="currentColor"/>
          </svg>
        </button>
      )}

      {/* Copilot panel */}
      <div className={`copilot-panel ${isOpen ? 'open' : ''}`}>
        {/* Header */}
        <div className="copilot-header">
          <div className="copilot-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="copilot-icon">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" fill="#0F4C81"/>
              <path d="M12 6.5c-3.04 0-5.5 2.46-5.5 5.5s2.46 5.5 5.5 5.5 5.5-2.46 5.5-5.5-2.46-5.5-5.5-5.5zm0 9c-1.93 0-3.5-1.57-3.5-3.5S10.07 8.5 12 8.5s3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z" fill="#00B8D4"/>
            </svg>
            <span>Compliance Copilot</span>
          </div>
          <button className="copilot-close-btn" onClick={onToggle}>✕</button>
        </div>

        {/* Messages area */}
        <div className="copilot-messages">
          {messages.length === 0 && (
            <div className="copilot-welcome">
              <p>👋 Hi! I'm your FOIA compliance assistant.</p>
              <p>Ask me about statutes, exemptions, deadlines, or anything FOIA-related.</p>
              <p className="copilot-hint">Tip: Use quick actions below for common tasks</p>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div key={idx} className={`copilot-message copilot-message-${msg.role}`}>
              <div className="copilot-message-content">
                {msg.content}
              </div>

              {/* Citations */}
              {msg.citations && msg.citations.length > 0 && (
                <div className="copilot-citations">
                  <div className="copilot-citations-label">Citations:</div>
                  {msg.citations.map((citation, cidx) => {
                    const citationKey = `${idx}-${cidx}`;
                    const isExpanded = expandedCitations.has(citationKey);

                    return (
                      <div key={cidx} className="copilot-citation">
                        <button
                          className="copilot-citation-header"
                          onClick={() => toggleCitation(citationKey)}
                        >
                          <span>{citation.statute}</span>
                          <span className="copilot-citation-toggle">{isExpanded ? '−' : '+'}</span>
                        </button>
                        {isExpanded && (
                          <div className="copilot-citation-text">{citation.text}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Suggested actions */}
              {msg.suggested_actions && msg.suggested_actions.length > 0 && (
                <div className="copilot-suggestions">
                  <div className="copilot-suggestions-label">Suggested actions:</div>
                  <ul>
                    {msg.suggested_actions.map((action, aidx) => (
                      <li key={aidx}>{action}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Model badge */}
              {msg.model_used && (
                <div className="copilot-model-badge" title={`Powered by Claude ${msg.model_used}`}>
                  {msg.model_used === 'sonnet' ? '🧠' : '⚡️'} {msg.model_used}
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="copilot-message copilot-message-assistant">
              <div className="copilot-typing-indicator">
                <span></span><span></span><span></span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick actions */}
        <div className="copilot-quick-actions">
          <button
            onClick={() => handleQuickAction('exemption')}
            disabled={isLoading}
            title="Check exemptions for text"
          >
            🔒 Check Exemption
          </button>
          <button
            onClick={() => handleQuickAction('extension')}
            disabled={isLoading || !foiaRequestId}
            title="Draft extension notice"
          >
            📅 Draft Extension
          </button>
          <button
            onClick={() => handleQuickAction('deadline')}
            disabled={isLoading || !foiaRequestId}
            title="Explain deadline"
          >
            ⏰ Explain Deadline
          </button>
        </div>

        {/* Input area */}
        <div className="copilot-input-area">
          <textarea
            ref={inputRef}
            className="copilot-input"
            placeholder="Ask about FOIA compliance... (Shift+Enter for new line)"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            rows={2}
          />
          <button
            className="copilot-send-btn"
            onClick={() => sendMessage()}
            disabled={isLoading || !inputValue.trim()}
          >
            Send
          </button>
        </div>
      </div>
    </>
  );
};
