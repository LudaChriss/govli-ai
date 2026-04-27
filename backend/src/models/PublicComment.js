const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const PublicComment = sequelize.define('PublicComment', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },

  // Reference Information
  referenceType: {
    type: DataTypes.ENUM('permit', 'document', 'meeting', 'survey', 'policy', 'general'),
    allowNull: false,
    field: 'reference_type',
    comment: 'Type of item being commented on'
  },
  referenceId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'reference_id',
    comment: 'ID of the referenced item (permit, document, etc.)'
  },

  // Comment Content
  subject: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Comment subject/title'
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'Comment text content'
  },

  // Commenter Information
  commenterName: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'commenter_name',
    comment: 'Name of person making comment'
  },
  commenterEmail: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'commenter_email',
    validate: {
      isEmail: true
    },
    comment: 'Email of commenter'
  },
  commenterPhone: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'commenter_phone',
    comment: 'Phone of commenter'
  },
  commenterAddress: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'commenter_address',
    comment: 'Address of commenter'
  },

  // User Association (if authenticated)
  userId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'user_id',
    references: {
      model: 'Users',
      key: 'id'
    },
    comment: 'Link to User account if authenticated'
  },

  // Status and Moderation
  status: {
    type: DataTypes.ENUM('pending', 'approved', 'rejected', 'flagged', 'archived'),
    defaultValue: 'pending',
    allowNull: false,
    comment: 'Moderation status of comment'
  },
  moderationNotes: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'moderation_notes',
    comment: 'Internal notes from moderators'
  },
  moderatedBy: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'moderated_by',
    references: {
      model: 'Users',
      key: 'id'
    },
    comment: 'Staff member who moderated this comment'
  },
  moderatedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'moderated_at',
    comment: 'When comment was moderated'
  },

  // Threading and Replies
  parentCommentId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'parent_comment_id',
    references: {
      model: 'PublicComments',
      key: 'id'
    },
    comment: 'Parent comment ID for threaded discussions'
  },

  // Engagement Metrics
  upvotes: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Number of upvotes/likes'
  },
  downvotes: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Number of downvotes/dislikes'
  },
  flagCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'flag_count',
    comment: 'Number of times flagged as inappropriate'
  },

  // Metadata
  isPublic: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_public',
    comment: 'Whether comment is publicly visible'
  },
  ipAddress: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'ip_address',
    comment: 'IP address of commenter (for spam prevention)'
  },
  userAgent: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'user_agent',
    comment: 'Browser/device information'
  },
  attachments: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of attachment file information'
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
  tableName: 'PublicComments',
  timestamps: true,
  underscored: false,  // Use camelCase column names
  paranoid: true, // Soft deletes
  indexes: [
    {
      fields: ['reference_type', 'reference_id']
    },
    {
      fields: ['user_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['parent_comment_id']
    },
    {
      fields: ['createdAt']
    },
    {
      fields: ['commenter_email']
    },
    {
      fields: ['is_public']
    }
  ]
});

module.exports = PublicComment;
