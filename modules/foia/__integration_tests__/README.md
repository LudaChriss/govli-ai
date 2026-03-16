# v3.0 Full Integration Tests

Comprehensive integration test suite for Govli FOIA v3.0, covering all Phase 6 and Phase 7 features.

## Overview

This test suite validates the end-to-end functionality of:
- **API Gateway**: Authentication, authorization, rate limiting, validation
- **Token Budget Manager**: AI spending controls and graceful degradation
- **Model Routing**: Complexity-based model selection
- **AI Features**: Smart deflection, batch optimization, compliance copilot, response cloning
- **Transparency Dashboard**: Public transparency scoring
- **Migration Tools**: GovQA compatibility, bulk import, spreadsheet import

## Test Files

### 01. API Gateway (6 tests)
- ✓ Unauthenticated access returns 401 with `token_missing`
- ✓ Expired JWT returns 401 with `token_expired`
- ✓ Insufficient permissions returns 403 with role validation
- ✓ Rate limiting enforces 100 req/min for Small tier (returns 429)
- ✓ Request validation returns 400 with field-level Zod errors
- ✓ API versioning includes `X-API-Version: 1.0` header

### 02. Token Budget Manager (4 tests)
- ✓ Budget warning emitted at 80% spend
- ✓ AI calls rejected at 95% spend
- ✓ Soft limit (95%-100%) continues with warnings
- ✓ Core workflows (submit, route, respond) work without AI

### 03. Model Routing (3 tests)
- ✓ Simple request (complexity 15) uses `claude-haiku-4-20250514`
- ✓ Complex request (complexity > 70) uses `claude-opus-4-20250514`
- ✓ AI-5 Vaughn Index always uses Opus regardless of complexity

### 04. Smart Deflection (4 tests)
- ✓ Reading room setup with 5 documents and embeddings
- ✓ Matching search returns results with similarity > 0.75
- ✓ Unrelated queries return no matches
- ✓ Deflection analytics track downloads and outcomes

### 05. Batch Optimization (5 tests)
- ✓ Duplicate detection with similarity > 0.80
- ✓ Batch opportunity identified for similar requests
- ✓ Execute MERGE action on secondary request
- ✓ Secondary request status = MERGED_INTO
- ✓ Secondary request merged_into = primary ID

### 06. Compliance Copilot (4 tests)
- ✓ Simple question uses Haiku and cites correct statute
- ✓ Complex legal question escalates to Sonnet
- ✓ Context-aware responses reference specific request
- ✓ Session logging in foia_copilot_sessions table

### 07. Response Cloning (6 tests)
- ✓ Source request created with full response package
- ✓ Clone candidate detected with similarity > 0.90
- ✓ Response cloned with adapted dates and names
- ✓ Exemptions preserved identically in clone
- ✓ Clone approval moves request to DELIVERED
- ✓ Audit trail tracks clone origin

### 08. Transparency Dashboard (7 tests)
- ✓ Seed 12 months of request data
- ✓ Transparency score calculated (0-100 with all components)
- ✓ Public dashboard returns data without PII
- ✓ Disabled dashboard returns 404

### 09. GovQA Compatibility (5 tests)
- ✓ Submit request using GovQA field names
- ✓ Field mapping from GovQA to Govli schema
- ✓ Get request returns GovQA-formatted response
- ✓ X-Govli-Migration-Warning header present
- ✓ Compatibility usage logged (2 calls tracked)

### 10. Migration API (6 tests)
- ✓ Authentication with migration key
- ✓ Bulk import 100 requests
- ✓ Bulk import 50 documents with presigned URLs
- ✓ Validation report confirms source = target counts
- ✓ Migration finalization expires token
- ✓ Subsequent imports rejected with 401

### 11. Spreadsheet Import (4 tests)
- ✓ Upload .xlsx with 50 rows, detect 8 columns, return preview
- ✓ AI suggests column mappings with confidence scores
- ✓ Confirmed mapping imports 50 requests
- ✓ All imported requests have migration_source='spreadsheet'

## Running Tests

### Run all integration tests:
```bash
cd modules/foia/__integration_tests__
npm test
```

### Run specific test file:
```bash
npm test 01-api-gateway.test.ts
```

### Run with coverage:
```bash
npm test -- --coverage
```

### Coverage thresholds:
- **Minimum**: 75% coverage per module (branches, functions, lines, statements)
- **Target**: >85% coverage
- **Report**: `coverage/v3-full-report.html`

## Test Structure

### Setup (`setup.ts`)
Common test utilities and mock helpers:
- `mockDb` - Mock PostgreSQL client
- `mockUsers` - Pre-configured user contexts (officer, admin, supervisor)
- `mockTenants` - Tenant configurations (small, medium, enterprise tiers)
- `mockTokens` - JWT tokens (valid, expired, invalid)
- `createMockRequest()` - Express request factory
- `createMockResponse()` - Express response factory
- `createMockFoiaRequest()` - FOIA request generator
- `createMockReadingRoomDoc()` - Reading room document generator
- `mockAIResponse()` - Claude API response simulator

### Test Pattern
```typescript
describe('Feature Name', () => {
  describe('Specific Scenario', () => {
    it('should behave correctly', async () => {
      const req = createMockRequest({ ... });
      const res = createMockResponse();

      // Execute handler
      await handler(req, res);

      // Assertions
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ ... });
    });
  });
});
```

## Coverage Goals

### By Module

| Module | Target Coverage | Critical Paths |
|--------|----------------|----------------|
| API Gateway | 85% | Auth, rate limiting, validation |
| AI Features | 80% | Model routing, budget checks |
| Migration Tools | 75% | Bulk import, validation |
| Transparency | 75% | Score calculation, public access |

### Coverage Report

After running tests with `--coverage`, open:
```bash
open coverage/index.html
```

Expected output:
```
----------------|---------|----------|---------|---------|-------------------
File            | % Stmts | % Branch | % Funcs | % Lines | Uncovered Lines
----------------|---------|----------|---------|---------|-------------------
All files       |   78.5  |   75.2   |   82.1  |   79.3  |
 api-gateway/   |   85.3  |   82.1   |   88.7  |   86.2  |
 ai-features/   |   80.2  |   76.4   |   84.3  |   81.1  |
 migration/     |   75.8  |   72.3   |   78.9  |   76.4  |
----------------|---------|----------|---------|---------|-------------------
```

## Prerequisites

All services must be running via `docker-compose up`:
- PostgreSQL database
- Redis cache
- API Gateway
- AI services
- Migration services

## Environment Variables

Required for integration tests:
```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/govli_foia_test

# Redis
REDIS_URL=redis://localhost:6379

# AI
ANTHROPIC_API_KEY=sk-ant-test-key

# Migration
MIGRATION_API_KEY=test-migration-key-123
```

## Mocking Strategy

### Database Queries
```typescript
mockDb.query = jest.fn().mockResolvedValue({
  rows: [{ id: '123', ... }]
});
```

### AI Responses
```typescript
const aiResponse = mockAIResponse(
  'AI-generated response text',
  'claude-haiku-4-20250514'
);
```

### HTTP Requests
```typescript
const req = createMockRequest({
  user: mockUsers.foia_officer,
  body: { description: 'Test request' }
});
```

## Debugging

### Enable verbose logging:
```bash
npm test -- --verbose
```

### Run single test:
```bash
npm test -- -t "should return 401 with token_missing"
```

### Debug with breakpoints:
```bash
node --inspect-brk node_modules/.bin/jest --runInBand
```

## CI/CD Integration

### GitHub Actions example:
```yaml
- name: Run Integration Tests
  run: |
    docker-compose up -d
    cd modules/foia/__integration_tests__
    npm test -- --coverage

- name: Upload Coverage
  uses: codecov/codecov-action@v3
  with:
    files: ./coverage/lcov.info
```

## Test Data Cleanup

Tests use mocks and don't modify actual database. No cleanup required.

## Known Issues

None at this time.

## Future Enhancements

- [ ] Add performance benchmarks
- [ ] Test concurrent request handling
- [ ] Add load testing for rate limiting
- [ ] Test AI model fallback scenarios
- [ ] Add end-to-end UI tests with Playwright

## Support

For issues or questions:
- **Documentation**: https://docs.govli.ai/testing
- **GitHub Issues**: https://github.com/govli/foia-system/issues
- **Slack**: #foia-testing

## License

Part of the Govli FOIA Management System. All rights reserved.
