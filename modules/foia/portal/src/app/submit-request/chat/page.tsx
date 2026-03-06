'use client';

/**
 * Conversation Builder (AI-7) - v2.0
 * Default for first-time visitors
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Message {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  timestamp: Date;
}

interface ConversationData {
  name?: string;
  email?: string;
  subject?: string;
  description?: string;
  category?: string;
  urgency?: string;
}

const INITIAL_MESSAGE: Message = {
  id: '1',
  role: 'assistant',
  content: "Hi! I'm here to help you submit a FOIA request. Let's have a conversation about what records you're looking for.\n\nTo get started, could you tell me your name?",
  timestamp: new Date()
};

export default function ConversationBuilderPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState('');
  const [data, setData] = useState<ConversationData>({});
  const [step, setStep] = useState<'name' | 'email' | 'topic' | 'details' | 'review'>('name');
  const [isTyping, setIsTyping] = useState(false);

  const addMessage = (role: 'assistant' | 'user', content: string) => {
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      role,
      content,
      timestamp: new Date()
    }]);
  };

  const addAssistantMessage = (content: string) => {
    setIsTyping(true);
    setTimeout(() => {
      addMessage('assistant', content);
      setIsTyping(false);
    }, 800);
  };

  const handleSend = () => {
    if (!input.trim()) return;

    addMessage('user', input);
    const userInput = input.trim();
    setInput('');

    processUserInput(userInput);
  };

  const processUserInput = (userInput: string) => {
    switch (step) {
      case 'name':
        setData(prev => ({ ...prev, name: userInput }));
        addAssistantMessage(`Nice to meet you, ${userInput}! What's your email address?`);
        setStep('email');
        break;

      case 'email':
        setData(prev => ({ ...prev, email: userInput }));
        addAssistantMessage(`Great! What kind of records are you looking for? (e.g., "Police reports from January 2024")`);
        setStep('topic');
        break;

      case 'topic':
        setData(prev => ({ ...prev, subject: userInput }));
        addAssistantMessage(`Perfect! Can you provide more details? Include dates, names, or specific document types.`);
        setStep('details');
        break;

      case 'details':
        setData(prev => ({ ...prev, description: userInput, category: 'PERSONAL', urgency: 'STANDARD' }));
        addAssistantMessage(`Thank you! I've gathered all the information. Review your request below.`);
        setStep('review');
        break;
    }
  };

  const handleSubmit = () => {
    localStorage.setItem('foia_conversation_data', JSON.stringify(data));
    router.push('/submit-request?from=chat');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-navy to-brand-teal">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            Let's Chat About Your Request
          </h1>
          <Link
            href="/submit-request"
            className="text-sm text-white underline hover:text-gray-200"
          >
            Prefer a form? Click here
          </Link>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="h-[500px] overflow-y-auto p-6 space-y-4 bg-gray-50">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                    msg.role === 'user'
                      ? 'bg-brand-teal text-white'
                      : 'bg-white shadow-md text-gray-800'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-white shadow-md rounded-2xl px-4 py-3">
                  <div className="flex space-x-2">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  </div>
                </div>
              </div>
            )}

            {step === 'review' && (
              <div className="bg-white rounded-lg shadow-lg p-6 border-2 border-brand-teal">
                <h3 className="text-xl font-bold mb-4">Request Summary</h3>
                <dl className="space-y-2 text-sm mb-4">
                  <div><dt className="font-medium">Name:</dt><dd>{data.name}</dd></div>
                  <div><dt className="font-medium">Email:</dt><dd>{data.email}</dd></div>
                  <div><dt className="font-medium">Subject:</dt><dd>{data.subject}</dd></div>
                  <div><dt className="font-medium">Details:</dt><dd>{data.description}</dd></div>
                </dl>
                <button onClick={handleSubmit} className="w-full btn btn-primary">
                  Continue to Submit
                </button>
              </div>
            )}
          </div>

          {step !== 'review' && (
            <div className="p-4 bg-white border-t">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="Type your response..."
                  className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-full focus:border-brand-teal"
                  disabled={isTyping}
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isTyping}
                  className="px-6 py-3 bg-brand-teal text-white rounded-full hover:bg-brand-teal-dark disabled:bg-gray-300"
                >
                  Send
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
