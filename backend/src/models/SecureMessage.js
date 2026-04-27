const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const SecureMessage = sequelize.define('SecureMessage', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },

  // Channel and Sender
  channelId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'channel_id',
    references: {
      model: 'SecureChannels',
      key: 'id'
    },
    comment: 'Channel this message belongs to'
  },
  senderId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'sender_id',
    references: {
      model: 'Users',
      key: 'id'
    },
    comment: 'User who sent the message'
  },

  // Message Content
  content: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'Message content (encrypted if encryption enabled)'
  },
  contentPlain: {
    type: DataTypes.VIRTUAL,
    get() {
      // Virtual field for decrypted content (handled by service layer)
      return this.getDataValue('content');
    }
  },
  isEncrypted: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_encrypted',
    comment: 'Whether message content is encrypted'
  },

  // Message Type
  messageType: {
    type: DataTypes.ENUM(
      'text',
      'file',
      'image',
      'alert',
      'system',
      'incident_update',
      'status_change',
      'announcement'
    ),
    defaultValue: 'text',
    field: 'message_type',
    comment: 'Type of message'
  },

  // Priority and Urgency
  priority: {
    type: DataTypes.ENUM('low', 'normal', 'high', 'urgent'),
    defaultValue: 'normal',
    comment: 'Message priority level'
  },
  isUrgent: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_urgent',
    comment: 'Whether message requires immediate attention'
  },
  requiresAcknowledgment: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'requires_acknowledgment',
    comment: 'Whether recipients must acknowledge receipt'
  },
  acknowledgmentCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'acknowledgment_count',
    comment: 'Number of users who acknowledged'
  },

  // Thread/Reply
  parentMessageId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'parent_message_id',
    references: {
      model: 'SecureMessages',
      key: 'id'
    },
    comment: 'Parent message ID if this is a reply'
  },
  threadId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'thread_id',
    comment: 'Thread ID for grouping related messages'
  },
  replyCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'reply_count',
    comment: 'Number of replies to this message'
  },

  // Attachments
  hasAttachments: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'has_attachments',
    comment: 'Whether message has file attachments'
  },
  attachments: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of attachment metadata (file IDs, names, sizes)'
  },
  attachmentCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'attachment_count'
  },

  // Mentions and References
  mentions: {
    type: DataTypes.ARRAY(DataTypes.UUID),
    defaultValue: [],
    comment: 'Array of user IDs mentioned in message'
  },
  references: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'References to permits, incidents, documents, etc.'
  },

  // Status and Delivery
  status: {
    type: DataTypes.ENUM('sent', 'delivered', 'read', 'deleted', 'failed'),
    defaultValue: 'sent',
    comment: 'Message delivery status'
  },
  deliveredAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'delivered_at',
    comment: 'When message was delivered to all recipients'
  },
  readCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'read_count',
    comment: 'Number of users who have read the message'
  },
  readBy: {
    type: DataTypes.ARRAY(DataTypes.UUID),
    defaultValue: [],
    field: 'read_by',
    comment: 'Array of user IDs who have read the message'
  },

  // Editing and Deletion
  isEdited: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_edited',
    comment: 'Whether message has been edited'
  },
  editedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'edited_at',
    comment: 'When message was last edited'
  },
  editHistory: {
    type: DataTypes.JSONB,
    defaultValue: [],
    field: 'edit_history',
    comment: 'History of edits (timestamps and previous content hashes)'
  },
  isDeleted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_deleted',
    comment: 'Whether message has been deleted'
  },
  deletedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'deleted_at'
  },
  deletedBy: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'deleted_by',
    references: {
      model: 'Users',
      key: 'id'
    }
  },

  // Reactions
  reactions: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Message reactions (emoji -> [user IDs])'
  },
  reactionCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'reaction_count',
    comment: 'Total number of reactions'
  },

  // Pinning
  isPinned: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_pinned',
    comment: 'Whether message is pinned in channel'
  },
  pinnedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'pinned_at'
  },
  pinnedBy: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'pinned_by',
    references: {
      model: 'Users',
      key: 'id'
    }
  },

  // Security and Compliance
  securityLevel: {
    type: DataTypes.ENUM('public', 'internal', 'confidential', 'classified'),
    defaultValue: 'internal',
    field: 'security_level',
    comment: 'Security classification of message'
  },
  retentionExpiresAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'retention_expires_at',
    comment: 'When message should be auto-deleted per retention policy'
  },
  isAudited: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_audited',
    comment: 'Whether message has been reviewed for audit'
  },

  // Incident Context (for incident-related messages)
  incidentId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'incident_id',
    comment: 'Related incident ID'
  },
  incidentUpdate: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'incident_update',
    comment: 'Structured incident status update data'
  },

  // System Messages
  isSystemMessage: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_system_message',
    comment: 'Whether message is system-generated'
  },
  systemAction: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'system_action',
    comment: 'Type of system action (user_joined, channel_created, etc.)'
  },

  // Search and Metadata
  searchVector: {
    type: DataTypes.TSVECTOR,
    allowNull: true,
    field: 'search_vector',
    comment: 'Full-text search vector'
  },
  tags: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    comment: 'Message tags'
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Additional message metadata'
  },

  // Client Info
  clientInfo: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'client_info',
    comment: 'Client device/app info when message was sent'
  },
  ipAddress: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'ip_address',
    comment: 'IP address message was sent from (for audit)'
  }
}, {
  tableName: 'SecureMessages',
  timestamps: true,
  underscored: false,  // Use camelCase column names
  paranoid: true, // Soft deletes
  indexes: [
    {
      fields: ['channel_id', 'createdAt']
    },
    {
      fields: ['sender_id']
    },
    {
      fields: ['parent_message_id']
    },
    {
      fields: ['thread_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['message_type']
    },
    {
      fields: ['priority']
    },
    {
      fields: ['is_deleted']
    },
    {
      fields: ['incident_id']
    },
    {
      fields: ['mentions'],
      using: 'gin'
    },
    {
      fields: ['tags'],
      using: 'gin'
    },
    {
      fields: ['search_vector'],
      using: 'gin'
    },
    {
      fields: ['createdAt']
    }
  ]
});

module.exports = SecureMessage;
