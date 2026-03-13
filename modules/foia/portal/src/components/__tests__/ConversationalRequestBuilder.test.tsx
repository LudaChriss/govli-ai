/**
 * AI-7: Conversational Request Builder - Frontend Tests
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import axios from 'axios';
import ConversationalRequestBuilder from '../ConversationalRequestBuilder';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ConversationalRequestBuilder', () => {
  const mockSessionId = 'session-123';
  const mockOnRequestReady = jest.fn();
  const mockOnSubmit = jest.fn();
  const mockOnModeSwitch = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock session start
    mockedAxios.post.mockImplementation((url: string) => {
      if (url.includes('/session/start')) {
        return Promise.resolve({
          data: {
            data: { session_id: mockSessionId }
          }
        });
      }

      // Mock initial greeting
      if (url.includes('/message')) {
        return Promise.resolve({
          data: {
            data: {
              message: 'Hello! I can help you file a FOIA request. What records are you looking for?',
              ready_to_submit: false,
              suggested_follow_up_questions: [
                'Police reports',
                'Building permits',
                'Public meeting minutes'
              ],
              session_id: mockSessionId,
              message_count: 1
            }
          }
        });
      }

      return Promise.reject(new Error('Unknown endpoint'));
    });
  });

  // ==========================================================================
  // Rendering Tests
  // ==========================================================================

  it('should render the chat interface', async () => {
    render(<ConversationalRequestBuilder />);

    await waitFor(() => {
      expect(screen.getByText('FOIA Request Assistant')).toBeInTheDocument();
    });

    expect(screen.getByPlaceholderText('Type your message...')).toBeInTheDocument();
    expect(screen.getByText('Send')).toBeInTheDocument();
  });

  it('should display initial AI greeting', async () => {
    render(<ConversationalRequestBuilder />);

    await waitFor(() => {
      expect(screen.getByText(/Hello! I can help you file a FOIA request/)).toBeInTheDocument();
    });
  });

  it('should render suggested quick-reply questions', async () => {
    render(<ConversationalRequestBuilder />);

    await waitFor(() => {
      expect(screen.getByText('Police reports')).toBeInTheDocument();
      expect(screen.getByText('Building permits')).toBeInTheDocument();
      expect(screen.getByText('Public meeting minutes')).toBeInTheDocument();
    });
  });

  it('should render mode switch button when provided', async () => {
    render(<ConversationalRequestBuilder onModeSwitch={mockOnModeSwitch} />);

    await waitFor(() => {
      expect(screen.getByText('Prefer a form?')).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // User Interaction Tests
  // ==========================================================================

  it('should send user message when form is submitted', async () => {
    const user = userEvent.setup();
    render(<ConversationalRequestBuilder />);

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Type your message...')).toBeInTheDocument();
    });

    // Clear initial calls
    mockedAxios.post.mockClear();

    // Mock AI response
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        data: {
          message: 'Great! What time period are you interested in?',
          ready_to_submit: false,
          suggested_follow_up_questions: ['Last month', 'Last year', 'Specific dates'],
          session_id: mockSessionId,
          message_count: 3
        }
      }
    });

    // Type and send message
    const input = screen.getByPlaceholderText('Type your message...');
    await user.type(input, 'I need police reports');
    await user.click(screen.getByText('Send'));

    // Check message appears in UI
    await waitFor(() => {
      expect(screen.getByText('I need police reports')).toBeInTheDocument();
    });

    // Check AI response appears
    await waitFor(() => {
      expect(screen.getByText('Great! What time period are you interested in?')).toBeInTheDocument();
    });
  });

  it('should handle suggested question clicks', async () => {
    const user = userEvent.setup();
    render(<ConversationalRequestBuilder />);

    // Wait for suggestions to appear
    await waitFor(() => {
      expect(screen.getByText('Police reports')).toBeInTheDocument();
    });

    // Clear initial calls
    mockedAxios.post.mockClear();

    // Mock AI response
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        data: {
          message: 'What specific police reports?',
          ready_to_submit: false,
          suggested_follow_up_questions: [],
          session_id: mockSessionId,
          message_count: 3
        }
      }
    });

    // Click suggested question
    await user.click(screen.getByText('Police reports'));

    // Check that API was called
    await waitFor(() => {
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/message'),
        expect.objectContaining({
          session_id: mockSessionId,
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: 'Police reports'
            })
          ])
        })
      );
    });
  });

  it('should show loading indicator while waiting for response', async () => {
    const user = userEvent.setup();
    render(<ConversationalRequestBuilder />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Type your message...')).toBeInTheDocument();
    });

    // Mock slow response
    mockedAxios.post.mockImplementationOnce(
      () => new Promise(resolve => setTimeout(() => resolve({
        data: {
          data: {
            message: 'Response',
            ready_to_submit: false,
            session_id: mockSessionId,
            message_count: 2
          }
        }
      }), 1000))
    );

    // Send message
    const input = screen.getByPlaceholderText('Type your message...');
    await user.type(input, 'Test message');
    await user.click(screen.getByText('Send'));

    // Check loading indicator appears (animated dots)
    const loadingIndicators = screen.getAllByRole('generic').filter(
      el => el.className.includes('animate-bounce')
    );
    expect(loadingIndicators.length).toBeGreaterThan(0);
  });

  // ==========================================================================
  // Draft Request Tests
  // ==========================================================================

  it('should show draft request panel when ready_to_submit is true', async () => {
    render(<ConversationalRequestBuilder onRequestReady={mockOnRequestReady} />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Type your message...')).toBeInTheDocument();
    });

    mockedAxios.post.mockClear();

    // Mock ready response
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        data: {
          message: 'Your request is ready!',
          ready_to_submit: true,
          draft_request: {
            description: 'Police reports from January 2024 on Main Street',
            agencies: ['Police Department'],
            date_range_start: '2024-01-01',
            date_range_end: '2024-01-31',
            format_preference: 'electronic'
          },
          session_id: mockSessionId,
          message_count: 5
        }
      }
    });

    // Send message
    const user = userEvent.setup();
    const input = screen.getByPlaceholderText('Type your message...');
    await user.type(input, 'Traffic stops on Main Street in January');
    await user.click(screen.getByText('Send'));

    // Check draft panel appears
    await waitFor(() => {
      expect(screen.getByText('Your Request is Ready!')).toBeInTheDocument();
    });

    // Check draft fields are populated
    expect(screen.getByDisplayValue('Police reports from January 2024 on Main Street')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Police Department')).toBeInTheDocument();

    // Check onRequestReady was called
    expect(mockOnRequestReady).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringContaining('Police reports')
      })
    );
  });

  it('should allow editing draft request fields', async () => {
    const user = userEvent.setup();
    render(<ConversationalRequestBuilder />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Type your message...')).toBeInTheDocument();
    });

    // Mock ready response
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        data: {
          message: 'Ready!',
          ready_to_submit: true,
          draft_request: {
            description: 'Original description',
            agencies: ['Police Department'],
            format_preference: 'electronic'
          },
          session_id: mockSessionId,
          message_count: 3
        }
      }
    });

    // Trigger ready state
    const input = screen.getByPlaceholderText('Type your message...');
    await user.type(input, 'Test');
    await user.click(screen.getByText('Send'));

    await waitFor(() => {
      expect(screen.getByText('Your Request is Ready!')).toBeInTheDocument();
    });

    // Edit description
    const descriptionField = screen.getByDisplayValue('Original description');
    await user.clear(descriptionField);
    await user.type(descriptionField, 'Updated description');

    expect(screen.getByDisplayValue('Updated description')).toBeInTheDocument();
  });

  it('should submit final request when submit button is clicked', async () => {
    const user = userEvent.setup();
    mockOnSubmit.mockResolvedValueOnce(undefined);

    render(<ConversationalRequestBuilder onSubmit={mockOnSubmit} />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Type your message...')).toBeInTheDocument();
    });

    // Mock ready response
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        data: {
          message: 'Ready!',
          ready_to_submit: true,
          draft_request: {
            description: 'Test request',
            agencies: ['Police Department'],
            format_preference: 'electronic'
          },
          session_id: mockSessionId,
          message_count: 3
        }
      }
    });

    // Trigger ready state
    const input = screen.getByPlaceholderText('Type your message...');
    await user.type(input, 'Test');
    await user.click(screen.getByText('Send'));

    await waitFor(() => {
      expect(screen.getByText('Submit Request')).toBeInTheDocument();
    });

    // Mock session complete
    mockedAxios.post.mockResolvedValueOnce({
      data: { success: true }
    });

    // Click submit
    await user.click(screen.getByText('Submit Request'));

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Test request'
        })
      );
    });
  });

  // ==========================================================================
  // Error Handling Tests
  // ==========================================================================

  it('should display error message when API call fails', async () => {
    const user = userEvent.setup();
    render(<ConversationalRequestBuilder />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Type your message...')).toBeInTheDocument();
    });

    // Mock API error
    mockedAxios.post.mockRejectedValueOnce(new Error('Network error'));

    // Send message
    const input = screen.getByPlaceholderText('Type your message...');
    await user.type(input, 'Test');
    await user.click(screen.getByText('Send'));

    // Check error message appears
    await waitFor(() => {
      expect(screen.getByText(/Failed to send message/)).toBeInTheDocument();
    });
  });

  it('should display rate limit error when 429 is returned', async () => {
    const user = userEvent.setup();
    render(<ConversationalRequestBuilder />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Type your message...')).toBeInTheDocument();
    });

    // Mock rate limit error
    mockedAxios.post.mockRejectedValueOnce({
      response: { status: 429 }
    });

    // Send message
    const input = screen.getByPlaceholderText('Type your message...');
    await user.type(input, 'Test');
    await user.click(screen.getByText('Send'));

    // Check rate limit message
    await waitFor(() => {
      expect(screen.getByText(/reached the message limit/)).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // Accessibility Tests
  // ==========================================================================

  it('should have proper ARIA labels', async () => {
    render(<ConversationalRequestBuilder onModeSwitch={mockOnModeSwitch} />);

    await waitFor(() => {
      expect(screen.getByLabelText('Message input')).toBeInTheDocument();
    });

    expect(screen.getByLabelText('Send message')).toBeInTheDocument();
    expect(screen.getByLabelText('Switch to form mode')).toBeInTheDocument();
  });

  it('should be keyboard navigable', async () => {
    const user = userEvent.setup();
    render(<ConversationalRequestBuilder />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Type your message...')).toBeInTheDocument();
    });

    // Tab to input
    await user.tab();
    expect(screen.getByPlaceholderText('Type your message...')).toHaveFocus();

    // Type message
    await user.keyboard('Test message');

    // Tab to send button
    await user.tab();
    expect(screen.getByText('Send')).toHaveFocus();

    // Press Enter to submit
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        data: {
          message: 'Response',
          ready_to_submit: false,
          session_id: mockSessionId,
          message_count: 2
        }
      }
    });

    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByText('Test message')).toBeInTheDocument();
    });
  });
});
