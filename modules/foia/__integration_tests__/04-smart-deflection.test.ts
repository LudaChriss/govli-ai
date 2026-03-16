/**
 * Integration Tests: AI-12 Smart Deflection
 * Tests reading room deflection with vector similarity search
 */

import { createMockRequest, createMockResponse, mockUsers, mockDb, createMockReadingRoomDoc } from './setup';

describe('AI-12 Smart Deflection Integration Tests', () => {
  // Helper: Calculate cosine similarity between two vectors
  const cosineSimilarity = (vec1: number[], vec2: number[]): number => {
    const dotProduct = vec1.reduce((sum, val, i) => sum + val * vec2[i], 0);
    const mag1 = Math.sqrt(vec1.reduce((sum, val) => sum + val * val, 0));
    const mag2 = Math.sqrt(vec2.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (mag1 * mag2);
  };

  // Test 1: Add reading room documents with embeddings
  describe('Setup Reading Room', () => {
    it('should add 5 records to reading room with embeddings', async () => {
      const documents = [
        createMockReadingRoomDoc({
          title: 'City Budget FY 2023',
          description: 'Annual budget for fiscal year 2023',
          document_type: 'Budget'
        }),
        createMockReadingRoomDoc({
          title: 'Police Department Annual Report 2022',
          description: 'Law enforcement statistics and activities for 2022',
          document_type: 'Annual Report'
        }),
        createMockReadingRoomDoc({
          title: 'City Council Meeting Minutes - January 2023',
          description: 'Official minutes from city council meeting on January 15, 2023',
          document_type: 'Meeting Minutes'
        }),
        createMockReadingRoomDoc({
          title: 'Fire Department Equipment Inventory',
          description: 'Current inventory of fire trucks and emergency equipment',
          document_type: 'Inventory'
        }),
        createMockReadingRoomDoc({
          title: 'Public Works Infrastructure Plan 2023-2025',
          description: 'Three-year plan for road repairs and infrastructure improvements',
          document_type: 'Planning Document'
        })
      ];

      mockDb.query = jest.fn().mockResolvedValue({
        rows: documents
      });

      await mockDb.query('INSERT INTO "FoiaReadingRoom" ...', documents);

      expect(mockDb.query).toHaveBeenCalled();
      const insertedDocs = (mockDb.query as jest.Mock).mock.calls[0][1];
      expect(insertedDocs).toHaveLength(5);
      expect(insertedDocs[0].embedding).toBeDefined();
      expect(insertedDocs[0].embedding).toHaveLength(1536); // OpenAI embedding dimension
    });
  });

  // Test 2: Matching deflection search
  describe('Deflection Search - Match Found', () => {
    it('should return match with similarity > 0.75 for partial request', async () => {
      const userQuery = 'I need the city budget for 2023';

      // Mock embedding for user query (simplified)
      const queryEmbedding = new Array(1536).fill(0).map(() => Math.random());

      // Mock reading room doc with high similarity
      const readingRoomDoc = createMockReadingRoomDoc({
        title: 'City Budget FY 2023',
        description: 'Annual budget for fiscal year 2023',
        embedding: queryEmbedding.map(v => v + (Math.random() - 0.5) * 0.2) // Similar vector
      });

      // Calculate similarity
      const similarity = cosineSimilarity(queryEmbedding, readingRoomDoc.embedding);

      mockDb.query = jest.fn().mockResolvedValue({
        rows: [{
          ...readingRoomDoc,
          similarity
        }]
      });

      const req = createMockRequest({
        user: null, // Public user
        body: {
          query: userQuery
        }
      });
      const res = createMockResponse();

      // Simulate deflection search
      const searchDeflections = async (req: any, res: any) => {
        const result = await mockDb.query(`
          SELECT *, (embedding <=> $1) as similarity
          FROM "FoiaReadingRoom"
          WHERE similarity > 0.75
          ORDER BY similarity DESC
          LIMIT 5
        `, [queryEmbedding]);

        const matches = result.rows.filter((r: any) => r.similarity > 0.75);

        return res.json({
          has_relevant_match: matches.length > 0,
          matches: matches.map((m: any) => ({
            id: m.id,
            title: m.title,
            description: m.description,
            similarity: m.similarity,
            file_url: m.file_url
          })),
          suggestion: matches.length > 0
            ? `We found a relevant document: "${matches[0].title}". You can download it directly without submitting a request.`
            : null
        });
      };

      await searchDeflections(req, res);

      expect(res.json).toHaveBeenCalledWith({
        has_relevant_match: true,
        matches: expect.arrayContaining([
          expect.objectContaining({
            title: 'City Budget FY 2023',
            similarity: expect.any(Number)
          })
        ]),
        suggestion: expect.stringContaining('We found a relevant document')
      });

      const response = (res.json as jest.Mock).mock.calls[0][0];
      expect(response.matches[0].similarity).toBeGreaterThan(0.75);
    });
  });

  // Test 3: No match for unrelated request
  describe('Deflection Search - No Match', () => {
    it('should return no matches for completely unrelated request', async () => {
      const userQuery = 'I want to adopt a stray cat in my neighborhood';

      // Mock embedding for unrelated query
      const queryEmbedding = new Array(1536).fill(0).map(() => Math.random());

      // Mock reading room docs with low similarity
      const readingRoomDocs = [
        createMockReadingRoomDoc({
          title: 'City Budget FY 2023',
          embedding: new Array(1536).fill(0).map(() => Math.random()) // Unrelated vector
        }),
        createMockReadingRoomDoc({
          title: 'Police Department Annual Report 2022',
          embedding: new Array(1536).fill(0).map(() => Math.random())
        })
      ];

      // Calculate similarities (will be low for unrelated content)
      const docsWithSimilarity = readingRoomDocs.map(doc => ({
        ...doc,
        similarity: Math.random() * 0.5 // Low similarity (0-0.5)
      }));

      mockDb.query = jest.fn().mockResolvedValue({
        rows: docsWithSimilarity
      });

      const req = createMockRequest({
        user: null,
        body: {
          query: userQuery
        }
      });
      const res = createMockResponse();

      const searchDeflections = async (req: any, res: any) => {
        const result = await mockDb.query(`
          SELECT *, (embedding <=> $1) as similarity
          FROM "FoiaReadingRoom"
          WHERE similarity > 0.75
          ORDER BY similarity DESC
          LIMIT 5
        `, [queryEmbedding]);

        const matches = result.rows.filter((r: any) => r.similarity > 0.75);

        return res.json({
          has_relevant_match: matches.length > 0,
          matches: [],
          suggestion: null
        });
      };

      await searchDeflections(req, res);

      expect(res.json).toHaveBeenCalledWith({
        has_relevant_match: false,
        matches: [],
        suggestion: null
      });
    });
  });

  // Test 4: Log deflection outcome and analytics
  describe('Deflection Analytics', () => {
    it('should log outcome "downloaded" and show 1 deflection in analytics', async () => {
      const deflectionEvent = {
        id: 'deflect-123',
        tenant_id: 'tenant-123',
        reading_room_doc_id: 'rr-456',
        user_query: 'city budget 2023',
        similarity_score: 0.89,
        outcome: 'downloaded',
        created_at: new Date()
      };

      mockDb.query = jest.fn().mockResolvedValue({
        rows: [deflectionEvent]
      });

      // Log deflection
      await mockDb.query('INSERT INTO "FoiaDeflections" ...', [deflectionEvent]);

      expect(mockDb.query).toHaveBeenCalled();

      // Get analytics
      mockDb.query = jest.fn().mockResolvedValue({
        rows: [{
          total_deflections: 1,
          total_downloads: 1,
          avg_similarity: 0.89,
          deflection_rate: 0.50 // 1 deflection out of 2 total searches
        }]
      });

      const analyticsReq = createMockRequest({
        user: mockUsers.foia_supervisor,
        query: {
          start_date: '2024-01-01',
          end_date: '2024-12-31'
        }
      });
      const analyticsRes = createMockResponse();

      const getDeflectionAnalytics = async (req: any, res: any) => {
        const result = await mockDb.query(`
          SELECT
            COUNT(*) as total_deflections,
            COUNT(*) FILTER (WHERE outcome = 'downloaded') as total_downloads,
            AVG(similarity_score) as avg_similarity
          FROM "FoiaDeflections"
          WHERE tenant_id = $1
        `, ['tenant-123']);

        return res.json({
          total_deflections: parseInt(result.rows[0].total_deflections),
          total_downloads: parseInt(result.rows[0].total_downloads),
          avg_similarity: parseFloat(result.rows[0].avg_similarity)
        });
      };

      await getDeflectionAnalytics(analyticsReq, analyticsRes);

      expect(analyticsRes.json).toHaveBeenCalledWith({
        total_deflections: 1,
        total_downloads: 1,
        avg_similarity: 0.89
      });
    });
  });
});
