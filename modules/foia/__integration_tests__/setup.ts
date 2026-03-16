/**
 * Integration Test Setup
 * Configures test environment for v3.0 full integration tests
 */

import { Pool } from 'pg';

// Mock database pool
export const mockDb = {
  query: jest.fn(),
  connect: jest.fn(),
  end: jest.fn()
} as unknown as Pool;

// Mock user contexts
export const mockUsers = {
  unauthenticated: null,
  foia_officer: {
    id: 'user-officer-123',
    tenant_id: 'tenant-123',
    role: 'foia_officer',
    email: 'officer@example.com'
  },
  foia_admin: {
    id: 'user-admin-123',
    tenant_id: 'tenant-123',
    role: 'foia_admin',
    email: 'admin@example.com'
  },
  foia_supervisor: {
    id: 'user-supervisor-123',
    tenant_id: 'tenant-123',
    role: 'foia_supervisor',
    email: 'supervisor@example.com'
  }
};

// Mock tenant configurations
export const mockTenants = {
  small: {
    id: 'tenant-small',
    name: 'Small City',
    tier: 'SMALL',
    rate_limit: 100,
    ai_budget_monthly: 10.00,
    ai_spend_current_month: 0
  },
  medium: {
    id: 'tenant-medium',
    name: 'Medium City',
    tier: 'MEDIUM',
    rate_limit: 500,
    ai_budget_monthly: 50.00,
    ai_spend_current_month: 0
  },
  enterprise: {
    id: 'tenant-enterprise',
    name: 'Enterprise City',
    tier: 'ENTERPRISE',
    rate_limit: -1, // unlimited
    ai_budget_monthly: 500.00,
    ai_spend_current_month: 0
  }
};

// Mock JWT tokens
export const mockTokens = {
  valid_officer: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.valid_officer',
  valid_admin: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.valid_admin',
  expired: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.expired',
  invalid: 'invalid.token.here'
};

// Mock AI usage records
export const mockAIUsage = {
  simple_request: {
    id: 'usage-1',
    tenant_id: 'tenant-123',
    ai_feature: 'AI-1: Request Scoping',
    model_used: 'claude-haiku-4-20250514',
    input_tokens: 500,
    output_tokens: 200,
    cost_usd: 0.0015,
    complexity_score: 15,
    created_at: new Date()
  },
  complex_request: {
    id: 'usage-2',
    tenant_id: 'tenant-123',
    ai_feature: 'AI-1: Request Scoping',
    model_used: 'claude-opus-4-20250514',
    input_tokens: 2000,
    output_tokens: 800,
    cost_usd: 0.045,
    complexity_score: 85,
    created_at: new Date()
  }
};

// Helper: Create mock Express request
export function createMockRequest(options: {
  user?: any;
  body?: any;
  params?: any;
  query?: any;
  headers?: any;
  file?: any;
}): any {
  return {
    user: options.user || null,
    body: options.body || {},
    params: options.params || {},
    query: options.query || {},
    headers: options.headers || {},
    file: options.file || null,
    app: {
      locals: {
        db: mockDb
      }
    }
  };
}

// Helper: Create mock Express response
export function createMockResponse(): any {
  const res: any = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis()
  };
  return res;
}

// Helper: Reset all mocks
export function resetMocks() {
  jest.clearAllMocks();
  mockDb.query = jest.fn();
}

// Helper: Simulate AI model response
export function mockAIResponse(content: string, model: string = 'claude-haiku-4-20250514') {
  return {
    id: `msg_${Math.random().toString(36).substring(7)}`,
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text: content }],
    model,
    stop_reason: 'end_turn',
    usage: {
      input_tokens: 500,
      output_tokens: 200
    }
  };
}

// Helper: Wait for async operations
export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper: Generate mock FOIA request
export function createMockFoiaRequest(overrides: any = {}): any {
  return {
    id: `req-${Math.random().toString(36).substring(7)}`,
    tenant_id: 'tenant-123',
    tracking_number: `FOIA-${new Date().getFullYear()}-${Math.floor(Math.random() * 1000)}`,
    description: 'Request for police reports from January 2023',
    requester: {
      name: 'John Doe',
      email: 'john@example.com',
      phone: '555-1234'
    },
    foia_status: 'SUBMITTED',
    submitted_at: new Date(),
    due_date: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 10 days
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides
  };
}

// Helper: Generate mock reading room document
export function createMockReadingRoomDoc(overrides: any = {}): any {
  return {
    id: `rr-${Math.random().toString(36).substring(7)}`,
    tenant_id: 'tenant-123',
    title: 'City Budget FY 2023',
    description: 'Annual budget for fiscal year 2023',
    document_type: 'Budget',
    file_url: 'https://s3.amazonaws.com/bucket/budget-2023.pdf',
    embedding: new Array(1536).fill(0).map(() => Math.random()), // Mock embedding vector
    is_public: true,
    created_at: new Date(),
    ...overrides
  };
}

// Before each test
beforeEach(() => {
  resetMocks();
});

// After all tests
afterAll(() => {
  jest.restoreAllMocks();
});
