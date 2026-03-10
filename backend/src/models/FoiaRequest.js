const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const FoiaRequest = sequelize.define('FoiaRequest', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },

  // Request Identification
  trackingNumber: {
    type: DataTypes.STRING(20),
    unique: true,
    allowNull: false,
    field: 'tracking_number',
    comment: 'Unique tracking number (e.g., FOIA-2024-00001)'
  },

  // Requester Information
  requesterId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'requester_id',
    references: {
      model: 'Users',
      key: 'id'
    },
    comment: 'Reference to user account if requester has one'
  },
  requesterName: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'requester_name',
    comment: 'Full name of requester'
  },
  requesterEmail: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'requester_email',
    validate: {
      isEmail: true
    },
    comment: 'Email address for communications'
  },
  requesterPhone: {
    type: DataTypes.STRING(20),
    allowNull: true,
    field: 'requester_phone',
    comment: 'Contact phone number'
  },
  requesterOrganization: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'requester_organization',
    comment: 'Organization or company name'
  },
  requesterType: {
    type: DataTypes.ENUM('citizen', 'media', 'attorney', 'commercial', 'government', 'other'),
    defaultValue: 'citizen',
    field: 'requester_type',
    comment: 'Type/category of requester'
  },
  isAnonymous: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_anonymous',
    comment: 'Whether request is submitted anonymously'
  },

  // Request Details
  requestType: {
    type: DataTypes.ENUM('general', 'police_report', 'building_permit', 'personnel', 'contracts', 'meetings', 'financial', 'other'),
    allowNull: false,
    field: 'request_type',
    comment: 'Category of records being requested'
  },
  subject: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'Brief subject/title of request'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'Detailed description of records requested'
  },
  dateRangeStart: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'date_range_start',
    comment: 'Start date for records search period'
  },
  dateRangeEnd: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'date_range_end',
    comment: 'End date for records search period'
  },
  departmentsInvolved: {
    type: DataTypes.ARRAY(DataTypes.UUID),
    defaultValue: [],
    field: 'departments_involved',
    comment: 'Array of department IDs that may have relevant records'
  },

  // AI Classification
  aiClassification: {
    type: DataTypes.JSONB,
    defaultValue: {},
    field: 'ai_classification',
    comment: 'AI-generated classification and metadata'
  },
  complexityScore: {
    type: DataTypes.DECIMAL(3, 2),
    allowNull: true,
    field: 'complexity_score',
    comment: 'AI-estimated complexity score (0.00-1.00)'
  },
  sensitivityScore: {
    type: DataTypes.DECIMAL(3, 2),
    allowNull: true,
    field: 'sensitivity_score',
    comment: 'AI-estimated sensitivity score (0.00-1.00)'
  },
  priority: {
    type: DataTypes.ENUM('low', 'normal', 'high', 'urgent'),
    defaultValue: 'normal',
    comment: 'Request priority level'
  },

  // Status & Workflow
  status: {
    type: DataTypes.ENUM(
      'submitted',
      'acknowledged',
      'assigned',
      'records_gathering',
      'processing',
      'redaction',
      'legal_review',
      'fee_pending',
      'ready_release',
      'released',
      'closed',
      'denied'
    ),
    defaultValue: 'submitted',
    allowNull: false,
    comment: 'Current status of FOIA request'
  },
  currentStep: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'current_step',
    comment: 'Current workflow step description'
  },
  assignedTo: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'assigned_to',
    references: {
      model: 'Users',
      key: 'id'
    },
    comment: 'Staff member assigned to handle request'
  },
  assignedDepartment: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'assigned_department',
    comment: 'Department assigned to handle request (reference only)'
  },

  // SLA Tracking
  dateSubmitted: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'date_submitted',
    comment: 'Date request was submitted'
  },
  dateAcknowledged: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'date_acknowledged',
    comment: 'Date request was acknowledged'
  },
  dateDue: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'date_due',
    comment: 'Due date for response (typically 10-30 business days)'
  },
  dateCompleted: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'date_completed',
    comment: 'Date request was completed/closed'
  },
  extensionCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'extension_count',
    comment: 'Number of deadline extensions granted'
  },
  extensionReason: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'extension_reason',
    comment: 'Reason for extension(s)'
  },
  breachRiskScore: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
    defaultValue: 0,
    field: 'breach_risk_score',
    comment: 'SLA breach risk score (0-100), calculated on status transitions'
  },

  // Fees
  estimatedFee: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    field: 'estimated_fee',
    comment: 'Estimated fee for processing request'
  },
  actualFee: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    field: 'actual_fee',
    comment: 'Actual fee charged'
  },
  feePaid: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'fee_paid',
    comment: 'Whether fee has been paid'
  },
  feeWaived: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'fee_waived',
    comment: 'Whether fee was waived'
  },
  feeWaiverReason: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'fee_waiver_reason',
    comment: 'Reason for fee waiver'
  },

  // Resolution
  resolutionType: {
    type: DataTypes.ENUM('full_grant', 'partial_grant', 'denial', 'withdrawn', 'no_records'),
    allowNull: true,
    field: 'resolution_type',
    comment: 'Type of resolution/outcome'
  },
  denialReason: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'denial_reason',
    comment: 'Reason for denial if applicable'
  },
  exemptionsApplied: {
    type: DataTypes.ARRAY(DataTypes.STRING(10)),
    defaultValue: [],
    field: 'exemptions_applied',
    comment: 'Array of exemption codes applied (e.g., b1, b6, b7)'
  },

  // Internal Notes
  internalNotes: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'internal_notes',
    comment: 'Internal staff notes (not visible to requester)'
  },
  publicNotes: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'public_notes',
    comment: 'Public notes visible to requester'
  },

  // Metadata
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Additional request metadata and custom fields'
  },

  // Audit Fields
  createdBy: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'created_by',
    references: {
      model: 'Users',
      key: 'id'
    },
    comment: 'User who created the request'
  },
  updatedBy: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'updated_by',
    references: {
      model: 'Users',
      key: 'id'
    },
    comment: 'User who last updated the request'
  }
}, {
  tableName: 'FoiaRequests',
  timestamps: true,
  underscored: false,
  paranoid: true, // Soft deletes
  indexes: [
    {
      fields: ['tracking_number'],
      unique: true
    },
    {
      fields: ['status']
    },
    {
      fields: ['priority']
    },
    {
      fields: ['assigned_to']
    },
    {
      fields: ['assigned_department']
    },
    {
      fields: ['date_due']
    },
    {
      fields: ['date_submitted']
    },
    {
      fields: ['breach_risk_score']
    },
    {
      fields: ['requester_email']
    },
    {
      fields: ['request_type']
    },
    {
      fields: ['exemptions_applied'],
      using: 'gin'
    },
    {
      fields: ['departments_involved'],
      using: 'gin'
    },
    {
      fields: ['createdAt']
    }
  ]
});

module.exports = FoiaRequest;
