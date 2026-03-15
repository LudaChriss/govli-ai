/**
 * AI-15: Clone Available Banner
 *
 * Shows when clone candidates are available for a request
 */

import React, { useState, useEffect } from 'react';
import './CloneBanner.css';

interface CloneBannerProps {
  requestId: string;
  onViewClone: () => void;
  onDismiss: () => void;
}

export const CloneBanner: React.FC<CloneBannerProps> = ({ requestId, onViewClone, onDismiss }) => {
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCandidates();
  }, [requestId]);

  const fetchCandidates = async () => {
    try {
      const response = await fetch(`/api/ai/cloning/${requestId}/candidates`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
      });
      const data = await response.json();
      if (data.success) {
        setCandidates(data.data.candidates);
      }
    } catch (error) {
      console.error('Failed to fetch clone candidates:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || candidates.length === 0) return null;

  const topCandidate = candidates[0];
  const daysAgo = topCandidate.days_ago;

  return (
    <div className="clone-banner">
      <div className="clone-banner-icon">🔄</div>
      <div className="clone-banner-content">
        <div className="clone-banner-title">Clone Available</div>
        <div className="clone-banner-message">
          A similar request was processed {daysAgo} day{daysAgo !== 1 ? 's' : ''} ago
          (similarity: {Math.round(topCandidate.similarity_score * 100)}%).
          Clone the response to save time?
        </div>
      </div>
      <div className="clone-banner-actions">
        <button className="clone-banner-btn clone-banner-btn-primary" onClick={onViewClone}>
          View Clone
        </button>
        <button className="clone-banner-btn clone-banner-btn-secondary" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  );
};
