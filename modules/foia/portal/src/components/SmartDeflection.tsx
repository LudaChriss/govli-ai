'use client';

/**
 * Smart Deflection Component (v2.0)
 * AI-12: Shows relevant existing records before request creation
 */

import { useState, useEffect } from 'react';
import axios from 'axios';

interface DeflectionResult {
  id: string;
  type: 'faq' | 'doc' | 'guide' | 'previous_request';
  title: string;
  summary: string;
  url?: string;
  relevance_score: number;
}

interface SmartDeflectionProps {
  description: string;
}

export default function SmartDeflection({ description }: SmartDeflectionProps) {
  const [results, setResults] = useState<DeflectionResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [recommendation, setRecommendation] = useState<string>('');
  const [confidence, setConfidence] = useState<number>(0);

  useEffect(() => {
    // Debounce by 500ms
    const timer = setTimeout(() => {
      if (description.trim().length >= 50) {
        searchDeflection(description);
      } else {
        setResults([]);
        setRecommendation('');
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [description]);

  const searchDeflection = async (query: string) => {
    setIsLoading(true);

    try {
      const response = await axios.post('/api/v1/foia/ai/deflection/search', {
        description: query
      });

      if (response.data.success && response.data.data) {
        setResults(response.data.data.results || []);
        setRecommendation(response.data.data.recommendation || '');
        setConfidence(response.data.data.deflection_confidence || 0);
      }
    } catch (error) {
      console.error('Deflection search failed:', error);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = (result: DeflectionResult) => {
    if (result.url) {
      window.open(result.url, '_blank');
    }
  };

  if (!description || description.trim().length < 50) {
    return null;
  }

  return (
    <div className="mt-4 rounded-lg border-2 border-brand-teal bg-brand-teal bg-opacity-5 p-4">
      <div className="flex items-start mb-3">
        <svg
          className="h-6 w-6 text-brand-teal mr-2 flex-shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-brand-navy mb-1">
            Similar Records Found
          </h3>
          <p className="text-sm text-gray-700">
            We found some records that might already answer your question. Check these before submitting a new request.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-teal"></div>
          <span className="ml-3 text-gray-600">Searching for similar records...</span>
        </div>
      ) : results.length > 0 ? (
        <div className="space-y-3">
          {results.map((result) => (
            <div
              key={result.id}
              className="bg-white rounded-lg p-4 shadow-sm border border-green-200"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center mb-2">
                    <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-medium mr-2">
                      {result.type.replace('_', ' ')}
                    </span>
                    {result.relevance_score > 0.7 && (
                      <span className="text-xs text-green-600 font-medium">
                        {Math.round(result.relevance_score * 100)}% match
                      </span>
                    )}
                  </div>
                  <h4 className="font-semibold text-brand-navy mb-1">
                    {result.title}
                  </h4>
                  <p className="text-sm text-gray-700">
                    {result.summary}
                  </p>
                </div>

                {result.url && (
                  <button
                    onClick={() => handleDownload(result)}
                    className="ml-4 flex-shrink-0 px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-medium flex items-center"
                  >
                    <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download
                  </button>
                )}
              </div>
            </div>
          ))}

          {recommendation === 'deflect' && confidence > 0.75 && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
              <p className="text-sm text-yellow-800 font-medium">
                💡 These records appear to answer your question. We recommend reviewing them before submitting a new request.
              </p>
            </div>
          )}

          {recommendation === 'suggest_refinement' && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-sm text-blue-800">
                You can still submit your request, but you may want to refine your description to avoid duplicates.
              </p>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-gray-600 italic">
          No similar records found. Your request appears to be unique.
        </p>
      )}
    </div>
  );
}
