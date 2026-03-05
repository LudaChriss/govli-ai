import React, { useState } from 'react';
import { Card, Button, Badge } from '@govli/foia-ui';
import clsx from 'clsx';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface CopilotPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CopilotPanel({ isOpen, onClose }: CopilotPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'Hello! I\'m your AI Compliance Copilot. I can help you with FOIA requests, compliance checks, and workflow automation. How can I assist you today?',
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const suggestedActions = [
    { id: 'review', label: 'Review request for compliance', icon: '🔍' },
    { id: 'redaction', label: 'Suggest redactions', icon: '🖍️' },
    { id: 'routing', label: 'Recommend routing', icon: '🎯' },
    { id: 'deadline', label: 'Check SLA deadlines', icon: '⏰' },
  ];

  const complianceWarnings = [
    {
      id: 'w1',
      level: 'warning' as const,
      message: '3 requests approaching deadline in next 24 hours',
    },
    {
      id: 'w2',
      level: 'info' as const,
      message: 'New FOIA guidance available for review',
    },
  ];

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    // Simulate AI response (replace with actual API call)
    setTimeout(() => {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `I understand you're asking about: "${inputValue}". This is a simulated response. In production, this would connect to the AI backend.`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setIsLoading(false);
    }, 1000);
  };

  const handleSuggestedAction = (actionId: string) => {
    const action = suggestedActions.find((a) => a.id === actionId);
    if (action) {
      setInputValue(action.label);
    }
  };

  return (
    <div
      className={clsx(
        'fixed top-0 right-0 h-full bg-white border-l border-gray-200 shadow-xl transition-all duration-300 z-40',
        isOpen ? 'w-96' : 'w-0 overflow-hidden'
      )}
      role="complementary"
      aria-label="AI Copilot Panel"
    >
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🤖</span>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">AI Copilot</h2>
              <p className="text-xs text-gray-600">Compliance Assistant</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Close copilot panel"
          >
            ✕
          </Button>
        </div>

        {/* Compliance Warnings */}
        {complianceWarnings.length > 0 && (
          <div className="p-4 border-b border-gray-200 bg-yellow-50">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">
              Compliance Alerts
            </h3>
            <div className="space-y-2">
              {complianceWarnings.map((warning) => (
                <div
                  key={warning.id}
                  className="flex items-start gap-2 text-xs"
                >
                  <Badge variant={warning.level}>{warning.level}</Badge>
                  <span className="text-gray-700 flex-1">{warning.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Suggested Actions */}
        <div className="p-4 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">
            Suggested Actions
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {suggestedActions.map((action) => (
              <Button
                key={action.id}
                variant="outline"
                size="sm"
                onClick={() => handleSuggestedAction(action.id)}
                className="text-left justify-start h-auto py-2"
              >
                <span className="mr-2">{action.icon}</span>
                <span className="text-xs">{action.label}</span>
              </Button>
            ))}
          </div>
        </div>

        {/* Chat Messages */}
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
                  'max-w-[80%] rounded-lg p-3 text-sm',
                  message.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-900'
                )}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
                <p
                  className={clsx(
                    'text-xs mt-1',
                    message.role === 'user' ? 'text-blue-100' : 'text-gray-500'
                  )}
                >
                  {message.timestamp.toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-gray-100 rounded-lg p-3">
                <div className="flex gap-1">
                  <span className="animate-bounce">●</span>
                  <span className="animate-bounce delay-100">●</span>
                  <span className="animate-bounce delay-200">●</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <div className="flex gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Ask me anything about FOIA..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              disabled={isLoading}
              aria-label="Chat input"
            />
            <Button
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || isLoading}
              size="sm"
            >
              Send
            </Button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Powered by Govli AI • End-to-end encrypted
          </p>
        </div>
      </div>
    </div>
  );
}
