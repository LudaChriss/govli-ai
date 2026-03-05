import React, { useState, useEffect } from 'react';
import { Card, Badge, SLAIndicator } from '@govli/foia-ui';
import { format, differenceInDays, differenceInHours } from 'date-fns';
import clsx from 'clsx';

interface SLARequest {
  id: string;
  requester: string;
  description: string;
  department: string;
  assignedTo: string;
  deadline: Date;
  daysRemaining: number;
  hoursRemaining: number;
  urgency: 'OVERDUE' | 'CRITICAL' | 'AT_RISK' | 'ON_TRACK';
  progressPercent: number;
}

// Generate mock data
const generateMockSLAData = (): SLARequest[] => {
  const departments = ['Legal', 'HR', 'Finance', 'Operations', 'IT', 'Public Relations'];
  const officers = ['John Doe', 'Jane Smith', 'Bob Wilson', 'Alice Johnson', 'Charlie Brown'];

  return Array.from({ length: 24 }, (_, i) => {
    const hoursRemaining = i < 3 ? -24 - (i * 12) : i < 8 ? 24 + (i * 6) : i < 15 ? 72 + (i * 12) : 240 + (i * 24);
    const daysRemaining = Math.floor(hoursRemaining / 24);
    const deadline = new Date(Date.now() + hoursRemaining * 60 * 60 * 1000);

    let urgency: SLARequest['urgency'];
    if (hoursRemaining < 0) urgency = 'OVERDUE';
    else if (hoursRemaining < 48) urgency = 'CRITICAL';
    else if (hoursRemaining < 168) urgency = 'AT_RISK';
    else urgency = 'ON_TRACK';

    return {
      id: `REQ-${2000 + i}`,
      requester: `Requester ${i + 1}`,
      description: `Request for documents related to ${['budget', 'contracts', 'emails', 'reports', 'policies', 'personnel'][i % 6]}`,
      department: departments[i % departments.length],
      assignedTo: officers[i % officers.length],
      deadline,
      daysRemaining,
      hoursRemaining,
      urgency,
      progressPercent: Math.min(100, Math.floor(Math.random() * 100)),
    };
  });
};

export default function SLAWallPage() {
  const [requests, setRequests] = useState<SLARequest[]>(generateMockSLAData());
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
      // In production, this would fetch fresh data from the API
      setRequests(generateMockSLAData());
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  // Update time display every second
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // Sort requests by urgency
  const sortedRequests = [...requests].sort((a, b) => {
    const urgencyOrder = { OVERDUE: 0, CRITICAL: 1, AT_RISK: 2, ON_TRACK: 3 };
    return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
  });

  const getUrgencyColor = (urgency: SLARequest['urgency']) => {
    switch (urgency) {
      case 'OVERDUE':
        return 'from-red-600 to-red-800';
      case 'CRITICAL':
        return 'from-orange-500 to-orange-700';
      case 'AT_RISK':
        return 'from-yellow-500 to-yellow-600';
      case 'ON_TRACK':
        return 'from-green-500 to-green-600';
    }
  };

  const getUrgencyBorder = (urgency: SLARequest['urgency']) => {
    switch (urgency) {
      case 'OVERDUE':
        return 'border-red-600';
      case 'CRITICAL':
        return 'border-orange-500';
      case 'AT_RISK':
        return 'border-yellow-500';
      case 'ON_TRACK':
        return 'border-green-500';
    }
  };

  const formatTimeRemaining = (request: SLARequest) => {
    if (request.hoursRemaining < 0) {
      const hoursOverdue = Math.abs(request.hoursRemaining);
      if (hoursOverdue < 24) {
        return `${hoursOverdue}h OVERDUE`;
      }
      return `${Math.floor(hoursOverdue / 24)}d OVERDUE`;
    }

    if (request.hoursRemaining < 48) {
      return `${request.hoursRemaining}h remaining`;
    }

    return `${request.daysRemaining}d remaining`;
  };

  const urgencyCounts = {
    OVERDUE: requests.filter((r) => r.urgency === 'OVERDUE').length,
    CRITICAL: requests.filter((r) => r.urgency === 'CRITICAL').length,
    AT_RISK: requests.filter((r) => r.urgency === 'AT_RISK').length,
    ON_TRACK: requests.filter((r) => r.urgency === 'ON_TRACK').length,
  };

  return (
    <div className={clsx('space-y-6', isFullscreen && 'bg-gray-900 min-h-screen p-8')}>
      {/* Header */}
      <div className={clsx('flex items-center justify-between', isFullscreen && 'text-white')}>
        <div>
          <h1 className={clsx('text-3xl font-bold', isFullscreen ? 'text-white' : 'text-gray-900')}>
            SLA Countdown Wall
          </h1>
          <p className={clsx('mt-1', isFullscreen ? 'text-gray-300' : 'text-gray-600')}>
            Real-time SLA monitoring • Last updated: {format(currentTime, 'HH:mm:ss')}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex gap-2">
            <Badge variant="error">{urgencyCounts.OVERDUE} Overdue</Badge>
            <Badge variant="warning">{urgencyCounts.CRITICAL} Critical</Badge>
            <Badge variant="info">{urgencyCounts.AT_RISK} At Risk</Badge>
            <Badge variant="success">{urgencyCounts.ON_TRACK} On Track</Badge>
          </div>
          <button
            onClick={toggleFullscreen}
            className={clsx(
              'px-4 py-2 rounded-lg font-semibold transition-colors',
              isFullscreen
                ? 'bg-white text-gray-900 hover:bg-gray-100'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            )}
          >
            {isFullscreen ? '✕ Exit Fullscreen' : '⛶ Fullscreen'}
          </button>
        </div>
      </div>

      {/* SLA Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {sortedRequests.map((request) => (
          <Card
            key={request.id}
            className={clsx(
              'p-4 border-l-4 transition-all duration-300 hover:shadow-xl',
              getUrgencyBorder(request.urgency),
              isFullscreen && 'bg-gray-800 border-opacity-100'
            )}
          >
            <div className="space-y-3">
              {/* Header with urgency badge */}
              <div className="flex items-start justify-between">
                <div>
                  <h3
                    className={clsx(
                      'font-bold text-lg',
                      isFullscreen ? 'text-white' : 'text-gray-900'
                    )}
                  >
                    {request.id}
                  </h3>
                  <p
                    className={clsx(
                      'text-sm',
                      isFullscreen ? 'text-gray-300' : 'text-gray-600'
                    )}
                  >
                    {request.requester}
                  </p>
                </div>
                <Badge
                  variant={
                    request.urgency === 'OVERDUE'
                      ? 'error'
                      : request.urgency === 'CRITICAL'
                      ? 'warning'
                      : request.urgency === 'AT_RISK'
                      ? 'info'
                      : 'success'
                  }
                >
                  {request.urgency}
                </Badge>
              </div>

              {/* Countdown Display */}
              <div
                className={clsx(
                  'text-center py-4 rounded-lg bg-gradient-to-br',
                  getUrgencyColor(request.urgency)
                )}
              >
                <div className="text-3xl font-bold text-white">
                  {formatTimeRemaining(request)}
                </div>
                <div className="text-xs text-white opacity-90 mt-1">
                  Deadline: {format(request.deadline, 'MMM dd, yyyy HH:mm')}
                </div>
              </div>

              {/* Progress Bar */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={clsx(
                      'text-xs font-semibold',
                      isFullscreen ? 'text-gray-300' : 'text-gray-700'
                    )}
                  >
                    Progress
                  </span>
                  <span
                    className={clsx(
                      'text-xs font-semibold',
                      isFullscreen ? 'text-gray-300' : 'text-gray-700'
                    )}
                  >
                    {request.progressPercent}%
                  </span>
                </div>
                <div className={clsx('w-full rounded-full h-2', isFullscreen ? 'bg-gray-700' : 'bg-gray-200')}>
                  <div
                    className={clsx('h-2 rounded-full bg-gradient-to-r', getUrgencyColor(request.urgency))}
                    style={{ width: `${request.progressPercent}%` }}
                  ></div>
                </div>
              </div>

              {/* Details */}
              <div className="space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-lg">📋</span>
                  <span
                    className={clsx(
                      'truncate',
                      isFullscreen ? 'text-gray-300' : 'text-gray-700'
                    )}
                  >
                    {request.description}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg">🏢</span>
                  <span
                    className={clsx(
                      isFullscreen ? 'text-gray-300' : 'text-gray-700'
                    )}
                  >
                    {request.department}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg">👤</span>
                  <span
                    className={clsx(
                      'font-semibold',
                      isFullscreen ? 'text-gray-200' : 'text-gray-900'
                    )}
                  >
                    {request.assignedTo}
                  </span>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Auto-refresh indicator */}
      <div
        className={clsx(
          'text-center text-sm',
          isFullscreen ? 'text-gray-400' : 'text-gray-500'
        )}
      >
        Auto-refresh enabled • Updates every 60 seconds
      </div>
    </div>
  );
}
