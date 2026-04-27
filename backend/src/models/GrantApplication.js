const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const GrantApplication = sequelize.define('GrantApplication', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },

  // Related Records
  grantId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'grant_id',
    references: {
      model: 'Grants',
      key: 'id'
    },
    comment: 'Reference to the grant opportunity'
  },
  applicantId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'applicant_id',
    references: {
      model: 'Users',
      key: 'id'
    },
    comment: 'User who submitted the application'
  },
  workflowExecutionId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'workflow_execution_id',
    references: {
      model: 'WorkflowExecutions',
      key: 'id'
    },
    comment: 'Link to workflow if application process is automated'
  },

  // Application Identification
  applicationNumber: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false,
    field: 'application_number',
    comment: 'Unique application identifier'
  },
  externalApplicationId: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'external_application_id',
    comment: 'External application ID from Grants.gov or other system'
  },

  // Application Status
  status: {
    type: DataTypes.ENUM(
      'draft',
      'in_review',
      'submitted',
      'under_federal_review',
      'awarded',
      'declined',
      'withdrawn',
      'cancelled'
    ),
    defaultValue: 'draft',
    comment: 'Current status of the application'
  },

  // Financial Information
  requestedAmount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    field: 'requested_amount',
    comment: 'Amount of funding requested'
  },
  matchingFunds: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    field: 'matching_funds',
    comment: 'Amount of matching/cost-sharing funds committed'
  },
  awardedAmount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    field: 'awarded_amount',
    comment: 'Actual amount awarded (if successful)'
  },

  // Application Content
  projectTitle: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'project_title',
    comment: 'Title of the proposed project'
  },
  projectDescription: {
    type: DataTypes.TEXT,
    allowNull: false,
    field: 'project_description',
    comment: 'Detailed description of the proposed project'
  },
  projectObjectives: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    field: 'project_objectives',
    comment: 'List of project objectives'
  },
  justification: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Justification for funding request'
  },
  expectedOutcomes: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'expected_outcomes',
    comment: 'Expected outcomes and benefits'
  },
  impactStatement: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'impact_statement',
    comment: 'Statement of community impact'
  },

  // Timeline
  projectStartDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'project_start_date',
    comment: 'Proposed project start date'
  },
  projectEndDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'project_end_date',
    comment: 'Proposed project end date'
  },
  draftCreatedDate: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'draft_created_date',
    comment: 'When application draft was created'
  },
  submittedDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'submitted_date',
    comment: 'When application was submitted'
  },
  reviewStartDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'review_start_date',
    comment: 'When review process started'
  },
  decisionDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'decision_date',
    comment: 'When final decision was made'
  },

  // Organizational Information
  departmentName: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'department_name',
    comment: 'Department responsible for project'
  },
  projectManager: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'project_manager',
    comment: 'Name of project manager'
  },
  projectManagerEmail: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'project_manager_email',
    validate: {
      isEmail: true
    }
  },
  projectManagerPhone: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'project_manager_phone'
  },

  // Budget Information
  budgetSummary: {
    type: DataTypes.JSONB,
    defaultValue: {},
    field: 'budget_summary',
    comment: 'Detailed budget breakdown'
  },
  budgetNarrative: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'budget_narrative',
    comment: 'Narrative explanation of budget'
  },

  // Review and Decision
  reviewNotes: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'review_notes',
    comment: 'Internal review notes and feedback'
  },
  reviewScore: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
    field: 'review_score',
    comment: 'Internal review score (if applicable)'
  },
  decisionNotes: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'decision_notes',
    comment: 'Notes about award/decline decision'
  },
  decisionMadeBy: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'decision_made_by',
    references: {
      model: 'Users',
      key: 'id'
    }
  },

  // Compliance and Requirements
  eligibilityVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'eligibility_verified',
    comment: 'Whether eligibility has been verified'
  },
  eligibilityNotes: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'eligibility_notes',
    comment: 'Notes about eligibility verification'
  },
  complianceChecked: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'compliance_checked',
    comment: 'Whether compliance requirements are met'
  },
  requiredDocuments: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    field: 'required_documents',
    comment: 'List of required document types'
  },
  submittedDocuments: {
    type: DataTypes.ARRAY(DataTypes.UUID),
    defaultValue: [],
    field: 'submitted_documents',
    comment: 'Array of document IDs attached to application'
  },

  // AI Assistance
  aiAssisted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'ai_assisted',
    comment: 'Whether AI was used to help draft application'
  },
  aiSuggestions: {
    type: DataTypes.JSONB,
    defaultValue: {},
    field: 'ai_suggestions',
    comment: 'AI-generated suggestions and recommendations'
  },
  matchAnalysis: {
    type: DataTypes.JSONB,
    defaultValue: {},
    field: 'match_analysis',
    comment: 'AI analysis of how well project matches grant criteria'
  },

  // Tracking and Metadata
  priority: {
    type: DataTypes.ENUM('low', 'medium', 'high', 'critical'),
    defaultValue: 'medium',
    comment: 'Priority level for this application'
  },
  tags: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    comment: 'Tags for categorization and search'
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Additional application metadata'
  },
  internalNotes: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'internal_notes',
    comment: 'Internal notes not visible to applicant'
  },

  // Award Management (if awarded)
  awardNotificationDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'award_notification_date',
    comment: 'Date applicant was notified of award'
  },
  awardAcceptanceDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'award_acceptance_date',
    comment: 'Date award was accepted'
  },
  fundsDisbursed: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0,
    field: 'funds_disbursed',
    comment: 'Amount of funds actually disbursed'
  },
  projectStatus: {
    type: DataTypes.ENUM('not_started', 'in_progress', 'completed', 'delayed', 'cancelled'),
    allowNull: true,
    field: 'project_status',
    comment: 'Status of project implementation (for awarded grants)'
  },
  completionPercentage: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'completion_percentage',
    comment: 'Project completion percentage (0-100)'
  },

  // Audit Fields
  createdBy: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'created_by',
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  updatedBy: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'updated_by',
    references: {
      model: 'Users',
      key: 'id'
    }
  }
}, {
  tableName: 'GrantApplications',
  timestamps: true,
  underscored: false,  // Use camelCase column names
  paranoid: true, // Soft deletes
  indexes: [
    {
      fields: ['application_number'],
      unique: true
    },
    {
      fields: ['grant_id']
    },
    {
      fields: ['applicant_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['submitted_date']
    },
    {
      fields: ['decision_date']
    },
    {
      fields: ['priority']
    },
    {
      fields: ['tags'],
      using: 'gin' // GIN index for array search
    },
    {
      fields: ['createdAt']
    }
  ]
});

module.exports = GrantApplication;
