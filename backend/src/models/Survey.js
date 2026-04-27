const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const Survey = sequelize.define('Survey', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },

  // Survey Information
  title: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Survey title'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Survey description and purpose'
  },
  instructions: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Instructions for completing survey'
  },

  // Survey Type and Category
  surveyType: {
    type: DataTypes.ENUM('opinion', 'satisfaction', 'feedback', 'needs_assessment', 'demographic', 'other'),
    defaultValue: 'feedback',
    field: 'survey_type',
    comment: 'Type of survey'
  },
  category: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Survey category (permits, services, community, etc.)'
  },
  department: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Department conducting survey'
  },

  // Timing and Availability
  startDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'start_date',
    comment: 'When survey becomes available'
  },
  endDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'end_date',
    comment: 'When survey closes'
  },
  status: {
    type: DataTypes.ENUM('draft', 'active', 'paused', 'closed', 'archived'),
    defaultValue: 'draft',
    allowNull: false,
    comment: 'Survey status'
  },

  // Questions Configuration
  questions: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: [],
    comment: 'Array of question objects with type, text, options, validation'
  },
  questionCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'question_count',
    comment: 'Total number of questions'
  },
  estimatedTime: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'estimated_time',
    comment: 'Estimated completion time in minutes'
  },

  // Access and Permissions
  isPublic: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_public',
    comment: 'Whether survey is publicly accessible'
  },
  requiresAuth: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'requires_auth',
    comment: 'Whether login is required'
  },
  allowMultipleResponses: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'allow_multiple_responses',
    comment: 'Whether users can submit multiple times'
  },
  allowAnonymous: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'allow_anonymous',
    comment: 'Whether anonymous responses are allowed'
  },
  targetAudience: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'target_audience',
    comment: 'Target audience description'
  },
  accessCode: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'access_code',
    comment: 'Optional access code for restricted surveys'
  },

  // Response Tracking
  totalResponses: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'total_responses',
    comment: 'Total number of responses received'
  },
  completeResponses: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'complete_responses',
    comment: 'Number of completed responses'
  },
  partialResponses: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'partial_responses',
    comment: 'Number of partial/incomplete responses'
  },
  targetResponseCount: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'target_response_count',
    comment: 'Target number of responses'
  },

  // Display and Behavior
  displayMode: {
    type: DataTypes.ENUM('all_at_once', 'one_per_page', 'progressive'),
    defaultValue: 'all_at_once',
    field: 'display_mode',
    comment: 'How questions are displayed'
  },
  randomizeQuestions: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'randomize_questions',
    comment: 'Whether to randomize question order'
  },
  randomizeOptions: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'randomize_options',
    comment: 'Whether to randomize answer options'
  },
  showProgress: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'show_progress',
    comment: 'Whether to show progress indicator'
  },
  allowBackNavigation: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'allow_back_navigation',
    comment: 'Whether users can go back to previous questions'
  },

  // Completion and Confirmation
  completionMessage: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'completion_message',
    comment: 'Message shown after completion'
  },
  redirectUrl: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'redirect_url',
    validate: {
      isUrl: true
    },
    comment: 'URL to redirect after completion'
  },
  sendConfirmationEmail: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'send_confirmation_email',
    comment: 'Whether to send confirmation email'
  },

  // Results and Analysis
  resultsPublic: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'results_public',
    comment: 'Whether results are publicly visible'
  },
  resultsPublishedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'results_published_at',
    comment: 'When results were published'
  },
  analysisNotes: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'analysis_notes',
    comment: 'Internal notes about survey analysis'
  },

  // Branding and Customization
  theme: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Custom theme/branding settings'
  },
  logoUrl: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'logo_url',
    comment: 'URL to custom logo'
  },
  customCss: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'custom_css',
    comment: 'Custom CSS for survey styling'
  },

  // Notifications
  notifyOnResponse: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'notify_on_response',
    comment: 'Whether to notify admin on each response'
  },
  notificationEmails: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    field: 'notification_emails',
    comment: 'Email addresses to notify'
  },

  // Metadata
  tags: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    comment: 'Tags for categorization'
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Additional metadata'
  },

  // Owner Information
  ownerId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'owner_id',
    references: {
      model: 'Users',
      key: 'id'
    },
    comment: 'Survey owner/creator'
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
  tableName: 'Surveys',
  timestamps: true,
  underscored: false,  // Use camelCase column names
  paranoid: true, // Soft deletes
  indexes: [
    {
      fields: ['status']
    },
    {
      fields: ['survey_type']
    },
    {
      fields: ['category']
    },
    {
      fields: ['department']
    },
    {
      fields: ['owner_id']
    },
    {
      fields: ['start_date', 'end_date']
    },
    {
      fields: ['is_public']
    },
    {
      fields: ['tags'],
      using: 'gin' // GIN index for array search
    },
    {
      fields: ['createdAt']
    },
    {
      // Composite index for active public surveys
      fields: ['status', 'is_public']
    }
  ]
});

module.exports = Survey;
