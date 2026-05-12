const express = require('express');
const router = express.Router();
const config = require('../config/config');
const { FoiaRequest, FoiaDocument, FoiaTemplate } = require('../models');
const { authMiddleware, requireRole, optionalAuth } = require('../middleware/auth');
const { auditSensitiveOperation } = require('../middleware/auditLog');
const FoiaService = require('../services/foiaService');
const FoiaAIService = require('../services/foiaAIService');
const { createFoiaAIClient } = require('@govli/foia-shared');
const FoiaDocumentService = require('../services/foiaDocumentService');

// ============================================================================
// PUBLIC/CITIZEN ENDPOINTS
// ============================================================================

/**
 * @route   POST /api/foia/requests
 * @desc    Submit a new FOIA request (public endpoint)
 * @access  Public (optional authentication)
 */
router.post('/requests',
  optionalAuth,
  async (req, res) => {
    try {
      const requestData = {
        requesterName: req.body.requesterName,
        requesterEmail: req.body.requesterEmail,
        requesterPhone: req.body.requesterPhone,
        requesterOrganization: req.body.requesterOrganization,
        requesterType: req.body.requesterType || 'citizen',
        requestType: req.body.requestType,
        subject: req.body.subject,
        description: req.body.description,
        dateRangeStart: req.body.dateRangeStart,
        dateRangeEnd: req.body.dateRangeEnd,
        isAnonymous: req.body.isAnonymous || false,
        requesterId: req.user ? req.user.id : null
      };

      const request = await FoiaService.createRequest(requestData, req.user);

      res.status(201).json({
        success: true,
        message: 'FOIA request submitted successfully',
        request: {
          id: request.id,
          trackingNumber: request.trackingNumber,
          status: request.status,
          dateSubmitted: request.dateSubmitted,
          dateDue: request.dateDue
        }
      });
    } catch (error) {
      console.error('Submit FOIA request error:', error);

      res.status(500).json({
        error: 'Failed to submit FOIA request',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   GET /api/foia/requests/:trackingNumber/status
 * @desc    Check FOIA request status by tracking number (public)
 * @access  Public
 */
router.get('/requests/:trackingNumber/status',
  async (req, res) => {
    try {
      const request = await FoiaRequest.findOne({
        where: { trackingNumber: req.params.trackingNumber },
        attributes: [
          'id',
          'trackingNumber',
          'status',
          'dateSubmitted',
          'dateAcknowledged',
          'dateDue',
          'dateCompleted',
          'currentStep',
          'publicNotes'
        ]
      });

      if (!request) {
        return res.status(404).json({
          error: 'Request not found',
          message: 'No request found with this tracking number'
        });
      }

      res.json({
        success: true,
        request
      });
    } catch (error) {
      console.error('Get FOIA status error:', error);

      res.status(500).json({
        error: 'Failed to fetch request status',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

// ============================================================================
// AI REQUEST ARCHITECT ENDPOINTS
// ============================================================================

/**
 * @route   POST /api/foia/ai/analyze-request
 * @desc    Analyze FOIA request draft with AI (full analysis)
 * @access  Public
 */
router.post('/ai/analyze-request',
  async (req, res) => {
    try {
      const { text, context } = req.body;

      if (!text || text.trim().length === 0) {
        return res.status(400).json({
          error: 'Request text is required',
          message: 'Please provide text to analyze'
        });
      }

      // Perform full AI analysis
      const analysis = await FoiaAIService.analyzeRequest(text, context);

      res.json({
        success: true,
        analysis
      });
    } catch (error) {
      console.error('AI request analysis error:', error);

      res.status(500).json({
        error: 'Failed to analyze request',
        message: config.nodeEnv === 'development' ? error.message : 'Analysis temporarily unavailable',
        // Graceful degradation - provide empty results
        analysis: {
          entities: [],
          suggestedDepartments: [],
          scopeAnalysis: {
            estimatedDocuments: 0,
            complexityScore: 0,
            ambiguities: [],
            suggestions: []
          },
          similarRequests: [],
          costEstimate: null,
          timelineEstimate: null
        }
      });
    }
  }
);

/**
 * @route   POST /api/foia/ai/suggest
 * @desc    Get real-time AI suggestions as user types
 * @access  Public
 */
router.post('/ai/suggest',
  async (req, res) => {
    try {
      const { text, currentField } = req.body;

      if (!text || text.trim().length < 10) {
        return res.json({
          success: true,
          suggestions: []
        });
      }

      // Generate contextual suggestions
      const suggestions = await FoiaAIService.generateSuggestions(text, { field: currentField });

      res.json({
        success: true,
        suggestions
      });
    } catch (error) {
      console.error('AI suggestions error:', error);

      // Graceful degradation - return empty suggestions
      res.json({
        success: true,
        suggestions: []
      });
    }
  }
);

/**
 * @route   POST /api/foia/ai/find-existing
 * @desc    Check for existing similar FOIA requests
 * @access  Public
 */
router.post('/ai/find-existing',
  async (req, res) => {
    try {
      const { text } = req.body;

      if (!text || text.trim().length === 0) {
        return res.status(400).json({
          error: 'Request text is required',
          message: 'Please provide text to search for similar requests'
        });
      }

      // Find similar requests using AI service
      const similarRequests = await FoiaAIService.findSimilarRequests(text);

      res.json({
        success: true,
        similarRequests,
        count: similarRequests.length
      });
    } catch (error) {
      console.error('AI find existing error:', error);

      // Graceful degradation - return empty results
      res.json({
        success: true,
        similarRequests: [],
        count: 0
      });
    }
  }
);

// ============================================================================
// ADMIN ENDPOINTS
// ============================================================================

/**
 * @route   GET /api/foia/admin/requests
 * @desc    Search and list all FOIA requests (admin)
 * @access  Private (Staff/Admin)
 */
router.get('/admin/requests',
  authMiddleware,
  requireRole('staff', 'admin'),
  async (req, res) => {
    try {
      const {
        query,
        status,
        priority,
        requestType,
        requesterEmail,
        assignedTo,
        dateSubmittedAfter,
        dateSubmittedBefore,
        dateDueAfter,
        dateDueBefore,
        page = 1,
        limit = 50,
        sortBy = 'dateSubmitted',
        sortOrder = 'DESC'
      } = req.query;

      const offset = (page - 1) * limit;

      const filters = {
        query,
        status,
        priority,
        requestType,
        requesterEmail,
        assignedTo,
        dateSubmittedAfter,
        dateSubmittedBefore,
        dateDueAfter,
        dateDueBefore,
        limit: parseInt(limit),
        offset: parseInt(offset),
        sortBy,
        sortOrder
      };

      const result = await FoiaService.searchRequests(filters);

      res.json({
        success: true,
        requests: result.requests,
        pagination: {
          total: result.total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(result.total / limit)
        }
      });
    } catch (error) {
      console.error('Search FOIA requests error:', error);

      res.status(500).json({
        error: 'Failed to fetch requests',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   GET /api/foia/admin/requests/:id
 * @desc    Get full FOIA request details
 * @access  Private (Staff/Admin)
 */
router.get('/admin/requests/:id',
  authMiddleware,
  requireRole('staff', 'admin'),
  async (req, res) => {
    try {
      const request = await FoiaService.getRequestDetails(req.params.id);

      res.json({
        success: true,
        request
      });
    } catch (error) {
      console.error('Get FOIA request error:', error);

      if (error.message === 'FOIA request not found') {
        return res.status(404).json({
          error: 'Request not found'
        });
      }

      res.status(500).json({
        error: 'Failed to fetch request',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   PUT /api/foia/admin/requests/:id/status
 * @desc    Update FOIA request status
 * @access  Private (Staff/Admin)
 */
router.put('/admin/requests/:id/status',
  authMiddleware,
  requireRole('staff', 'admin'),
  auditSensitiveOperation('UPDATE_FOIA_STATUS'),
  async (req, res) => {
    try {
      const { status, notes } = req.body;

      if (!status) {
        return res.status(400).json({
          error: 'Status is required'
        });
      }

      const request = await FoiaService.updateStatus(
        req.params.id,
        status,
        req.user,
        notes
      );

      res.json({
        success: true,
        message: 'Request status updated successfully',
        request
      });
    } catch (error) {
      console.error('Update FOIA status error:', error);

      if (error.message === 'FOIA request not found') {
        return res.status(404).json({
          error: 'Request not found'
        });
      }

      res.status(500).json({
        error: 'Failed to update status',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   PUT /api/foia/admin/requests/:id/assign
 * @desc    Assign FOIA request to staff member
 * @access  Private (Admin)
 */
router.put('/admin/requests/:id/assign',
  authMiddleware,
  requireRole('admin'),
  auditSensitiveOperation('ASSIGN_FOIA_REQUEST'),
  async (req, res) => {
    try {
      const { assignedTo } = req.body;

      const request = await FoiaRequest.findByPk(req.params.id);
      if (!request) {
        return res.status(404).json({
          error: 'Request not found'
        });
      }

      const oldAssignee = request.assignedTo;
      request.assignedTo = assignedTo;
      request.updatedBy = req.user.id;

      if (request.status === 'submitted') {
        request.status = 'assigned';
      }

      await request.save();

      // Log activity
      await FoiaService.logActivity({
        requestId: request.id,
        activityType: 'assignment',
        action: `Request assigned to staff member`,
        actorId: req.user.id,
        actorName: req.user.name,
        oldValue: oldAssignee,
        newValue: assignedTo
      });

      res.json({
        success: true,
        message: 'Request assigned successfully',
        request
      });
    } catch (error) {
      console.error('Assign FOIA request error:', error);

      res.status(500).json({
        error: 'Failed to assign request',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   POST /api/foia/admin/requests/:id/documents
 * @desc    Upload document to FOIA request
 * @access  Private (Staff/Admin)
 */
router.post('/admin/requests/:id/documents',
  authMiddleware,
  requireRole('staff', 'admin'),
  auditSensitiveOperation('UPLOAD_FOIA_DOCUMENT'),
  async (req, res) => {
    try {
      const fileData = req.body;

      const document = await FoiaService.uploadDocument(
        req.params.id,
        fileData,
        req.user
      );

      res.status(201).json({
        success: true,
        message: 'Document uploaded successfully',
        document
      });
    } catch (error) {
      console.error('Upload FOIA document error:', error);

      if (error.message === 'FOIA request not found') {
        return res.status(404).json({
          error: 'Request not found'
        });
      }

      res.status(500).json({
        error: 'Failed to upload document',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   GET /api/foia/admin/dashboard
 * @desc    Get FOIA dashboard statistics
 * @access  Private (Staff/Admin)
 */
router.get('/admin/dashboard',
  authMiddleware,
  requireRole('staff', 'admin'),
  async (req, res) => {
    try {
      const stats = await FoiaService.getDashboardStats();

      res.json({
        success: true,
        stats
      });
    } catch (error) {
      console.error('Get FOIA dashboard error:', error);

      res.status(500).json({
        error: 'Failed to fetch dashboard stats',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   GET /api/foia/admin/templates
 * @desc    Get all email templates
 * @access  Private (Staff/Admin)
 */
router.get('/admin/templates',
  authMiddleware,
  requireRole('staff', 'admin'),
  async (req, res) => {
    try {
      const templates = await FoiaTemplate.findAll({
        where: { isActive: true },
        order: [['templateType', 'ASC'], ['name', 'ASC']]
      });

      res.json({
        success: true,
        templates
      });
    } catch (error) {
      console.error('Get FOIA templates error:', error);

      res.status(500).json({
        error: 'Failed to fetch templates',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

// ============================================================================
// DOCUMENT ANALYSIS & REDACTION ENDPOINTS
// ============================================================================

/**
 * @route   GET /api/foia/admin/documents
 * @desc    Get all documents with analysis status
 * @access  Private (Staff/Admin)
 */
router.get('/admin/documents',
  authMiddleware,
  requireRole('staff', 'admin'),
  async (req, res) => {
    try {
      const { DocumentAnalysis } = require('../models');

      const documents = await FoiaDocument.findAll({
        include: [
          {
            model: FoiaRequest,
            as: 'request',
            attributes: ['trackingNumber', 'subject', 'status']
          },
          {
            model: DocumentAnalysis,
            as: 'analysis',
            attributes: ['id', 'documentType', 'typeConfidence', 'processingStatus', 'metadata']
          }
        ],
        order: [['createdAt', 'DESC']],
        limit: 100
      });

      res.json({
        success: true,
        documents
      });
    } catch (error) {
      console.error('Get documents error:', error);

      res.status(500).json({
        error: 'Failed to fetch documents',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   POST /api/foia/admin/documents/:id/analyze
 * @desc    Analyze document for PII, classification, and exemptions
 * @access  Private (Staff/Admin)
 */
router.post('/admin/documents/:id/analyze',
  authMiddleware,
  requireRole('staff', 'admin'),
  async (req, res) => {
    try {
      const { documentText, pageCount } = req.body;

      if (!documentText) {
        return res.status(400).json({
          error: 'Document text is required',
          message: 'Please provide extracted text from the document'
        });
      }

      // Perform analysis
      const analysis = await FoiaDocumentService.analyzeDocument(
        req.params.id,
        documentText,
        { pageCount: pageCount || 1 }
      );

      res.json({
        success: true,
        analysis
      });
    } catch (error) {
      console.error('Document analysis error:', error);

      res.status(500).json({
        error: 'Failed to analyze document',
        message: config.nodeEnv === 'development' ? error.message : 'Analysis failed'
      });
    }
  }
);

/**
 * @route   GET /api/foia/admin/documents/:id/analysis
 * @desc    Get analysis results for a document
 * @access  Private (Staff/Admin)
 */
router.get('/admin/documents/:id/analysis',
  authMiddleware,
  requireRole('staff', 'admin'),
  async (req, res) => {
    try {
      const analysis = await FoiaDocumentService.getAnalysisResults(req.params.id);

      if (!analysis) {
        return res.status(404).json({
          error: 'Analysis not found',
          message: 'No analysis exists for this document'
        });
      }

      res.json({
        success: true,
        analysis
      });
    } catch (error) {
      console.error('Get analysis error:', error);

      res.status(500).json({
        error: 'Failed to fetch analysis',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   POST /api/foia/admin/documents/:id/apply-redactions
 * @desc    Apply approved redactions to document
 * @access  Private (Staff/Admin)
 */
router.post('/admin/documents/:id/apply-redactions',
  authMiddleware,
  requireRole('staff', 'admin'),
  auditSensitiveOperation('APPLY_REDACTIONS'),
  async (req, res) => {
    try {
      const { approvedRedactionIds } = req.body;

      if (!approvedRedactionIds || !Array.isArray(approvedRedactionIds)) {
        return res.status(400).json({
          error: 'Invalid request',
          message: 'Please provide an array of approved redaction IDs'
        });
      }

      // Get analysis ID for this document
      const analysis = await FoiaDocumentService.getAnalysisResults(req.params.id);

      if (!analysis) {
        return res.status(404).json({
          error: 'Analysis not found'
        });
      }

      // Apply redactions
      const result = await FoiaDocumentService.applyRedactions(
        analysis.analysisId,
        approvedRedactionIds
      );

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('Apply redactions error:', error);

      res.status(500).json({
        error: 'Failed to apply redactions',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   POST /api/foia/admin/documents/batch-analyze
 * @desc    Batch analyze multiple documents
 * @access  Private (Staff/Admin)
 */
router.post('/admin/documents/batch-analyze',
  authMiddleware,
  requireRole('staff', 'admin'),
  async (req, res) => {
    try {
      const { documents } = req.body;

      if (!documents || !Array.isArray(documents)) {
        return res.status(400).json({
          error: 'Invalid request',
          message: 'Please provide an array of documents to analyze'
        });
      }

      const results = [];
      const errors = [];

      // Process each document
      for (const doc of documents) {
        try {
          const analysis = await FoiaDocumentService.analyzeDocument(
            doc.id,
            doc.text,
            { pageCount: doc.pageCount || 1 }
          );
          results.push({
            documentId: doc.id,
            success: true,
            analysis
          });
        } catch (error) {
          errors.push({
            documentId: doc.id,
            error: error.message
          });
        }
      }

      res.json({
        success: true,
        processed: results.length,
        failed: errors.length,
        results,
        errors
      });
    } catch (error) {
      console.error('Batch analysis error:', error);

      res.status(500).json({
        error: 'Failed to process batch',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

module.exports = router;
