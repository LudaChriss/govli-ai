const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const Poll = sequelize.define('Poll', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },

  // Poll Information
  question: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Poll question'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Additional context or description'
  },

  // Poll Type
  pollType: {
    type: DataTypes.ENUM('single_choice', 'multiple_choice', 'rating', 'yes_no', 'ranking'),
    defaultValue: 'single_choice',
    field: 'poll_type',
    comment: 'Type of poll'
  },

  // Options
  options: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: [],
    comment: 'Array of poll options with {id, text, votes, votesPercentage}'
  },
  allowOtherOption: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'allow_other_option',
    comment: 'Whether to allow "Other" write-in option'
  },
  maxChoices: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'max_choices',
    comment: 'Maximum number of choices for multiple choice polls'
  },

  // Rating specific (if pollType is rating)
  ratingMin: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    field: 'rating_min',
    comment: 'Minimum rating value'
  },
  ratingMax: {
    type: DataTypes.INTEGER,
    defaultValue: 5,
    field: 'rating_max',
    comment: 'Maximum rating value'
  },
  ratingLabels: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'rating_labels',
    comment: 'Labels for rating values'
  },

  // Timing and Availability
  startDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'start_date',
    comment: 'When poll becomes available'
  },
  endDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'end_date',
    comment: 'When poll closes'
  },
  status: {
    type: DataTypes.ENUM('draft', 'active', 'paused', 'closed', 'archived'),
    defaultValue: 'draft',
    allowNull: false,
    comment: 'Poll status'
  },

  // Access and Permissions
  isPublic: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_public',
    comment: 'Whether poll is publicly accessible'
  },
  requiresAuth: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'requires_auth',
    comment: 'Whether login is required to vote'
  },
  allowMultipleVotes: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'allow_multiple_votes',
    comment: 'Whether users can vote multiple times'
  },
  allowAnonymous: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'allow_anonymous',
    comment: 'Whether anonymous votes are allowed'
  },
  ipRestriction: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'ip_restriction',
    comment: 'Prevent multiple votes from same IP'
  },

  // Vote Tracking
  totalVotes: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'total_votes',
    comment: 'Total number of votes'
  },
  uniqueVoters: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'unique_voters',
    comment: 'Number of unique voters'
  },
  targetVotes: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'target_votes',
    comment: 'Target number of votes'
  },

  // Display and Behavior
  showResults: {
    type: DataTypes.ENUM('always', 'after_vote', 'after_end', 'never'),
    defaultValue: 'after_vote',
    field: 'show_results',
    comment: 'When to show poll results'
  },
  showVoteCount: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'show_vote_count',
    comment: 'Whether to show vote counts'
  },
  showPercentages: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'show_percentages',
    comment: 'Whether to show percentages'
  },
  randomizeOptions: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'randomize_options',
    comment: 'Whether to randomize option order'
  },

  // Results and Analysis
  resultsPublic: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'results_public',
    comment: 'Whether results are publicly visible'
  },
  resultsPublishedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'results_published_at',
    comment: 'When results were published'
  },
  winner: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Winning option(s) after poll closes'
  },

  // Context and Association
  category: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Poll category'
  },
  department: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Department conducting poll'
  },
  tags: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    comment: 'Tags for categorization'
  },

  // Optional Reference
  referenceType: {
    type: DataTypes.ENUM('permit', 'document', 'meeting', 'project', 'general'),
    allowNull: true,
    field: 'reference_type',
    comment: 'Type of related item'
  },
  referenceId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'reference_id',
    comment: 'ID of related item'
  },

  // Notification
  notifyOnVote: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'notify_on_vote',
    comment: 'Whether to notify on new votes'
  },
  notifyThresholds: {
    type: DataTypes.ARRAY(DataTypes.INTEGER),
    defaultValue: [],
    field: 'notify_thresholds',
    comment: 'Vote count milestones to trigger notifications'
  },

  // Metadata
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Additional metadata'
  },
  displaySettings: {
    type: DataTypes.JSONB,
    defaultValue: {},
    field: 'display_settings',
    comment: 'Custom display/UI settings'
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
    comment: 'Poll owner/creator'
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
  tableName: 'Polls',
  timestamps: true,
  underscored: false,  // Use camelCase column names
  paranoid: true, // Soft deletes
  indexes: [
    {
      fields: ['status']
    },
    {
      fields: ['poll_type']
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
      fields: ['reference_type', 'reference_id']
    },
    {
      fields: ['createdAt']
    },
    {
      // Composite index for active public polls
      fields: ['status', 'is_public']
    }
  ]
});

module.exports = Poll;
