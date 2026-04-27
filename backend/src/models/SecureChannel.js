const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const SecureChannel = sequelize.define('SecureChannel', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },

  // Channel Identification
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Channel name'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Channel description and purpose'
  },
  channelType: {
    type: DataTypes.ENUM(
      'direct',          // 1-on-1 communication
      'group',           // Group discussion
      'broadcast',       // One-way announcements
      'incident',        // Incident response channel
      'inter_municipal', // Cross-municipality collaboration
      'emergency',       // Emergency communications
      'department'       // Department-specific channel
    ),
    allowNull: false,
    defaultValue: 'group',
    field: 'channel_type',
    comment: 'Type of communication channel'
  },

  // Security and Privacy
  encryptionEnabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'encryption_enabled',
    comment: 'Whether messages are encrypted at rest'
  },
  encryptionKey: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'encryption_key',
    comment: 'Encryption key for channel (encrypted itself)'
  },
  securityLevel: {
    type: DataTypes.ENUM('public', 'internal', 'confidential', 'classified'),
    defaultValue: 'internal',
    field: 'security_level',
    comment: 'Security classification level'
  },
  isPrivate: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_private',
    comment: 'Whether channel is invitation-only'
  },

  // Organization
  organizationId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'organization_id',
    comment: 'ID of municipality/organization owning channel'
  },
  departmentName: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'department_name',
    comment: 'Department associated with channel'
  },
  category: {
    type: DataTypes.ENUM(
      'general',
      'emergency_response',
      'public_safety',
      'infrastructure',
      'planning',
      'legal',
      'finance',
      'it_security',
      'other'
    ),
    defaultValue: 'general',
    comment: 'Channel category'
  },

  // Status and Activity
  status: {
    type: DataTypes.ENUM('active', 'archived', 'locked', 'deleted'),
    defaultValue: 'active',
    comment: 'Channel status'
  },
  isArchived: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_archived',
    comment: 'Whether channel is archived'
  },
  lastActivityAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_activity_at',
    comment: 'Timestamp of last message/activity'
  },
  messageCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'message_count',
    comment: 'Total number of messages in channel'
  },

  // Incident Tracking (for incident-type channels)
  incidentId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'incident_id',
    comment: 'Related incident ID if channel is for incident response'
  },
  incidentType: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'incident_type',
    comment: 'Type of incident (fire, flood, etc.)'
  },
  incidentSeverity: {
    type: DataTypes.ENUM('low', 'medium', 'high', 'critical'),
    allowNull: true,
    field: 'incident_severity'
  },
  incidentStatus: {
    type: DataTypes.ENUM('active', 'monitoring', 'resolved', 'closed'),
    allowNull: true,
    field: 'incident_status'
  },
  incidentResolvedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'incident_resolved_at'
  },

  // Settings
  allowFileSharing: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'allow_file_sharing',
    comment: 'Whether file uploads are allowed'
  },
  allowExternalMembers: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'allow_external_members',
    comment: 'Whether external users can be added'
  },
  retentionDays: {
    type: DataTypes.INTEGER,
    defaultValue: 365,
    field: 'retention_days',
    comment: 'Number of days to retain messages (0 = forever)'
  },
  notificationLevel: {
    type: DataTypes.ENUM('all', 'mentions', 'none'),
    defaultValue: 'all',
    field: 'notification_level',
    comment: 'Default notification setting for members'
  },

  // Members
  createdBy: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'created_by',
    references: {
      model: 'Users',
      key: 'id'
    },
    comment: 'User who created the channel'
  },
  ownerId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'owner_id',
    references: {
      model: 'Users',
      key: 'id'
    },
    comment: 'Primary owner of the channel'
  },
  memberCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'member_count',
    comment: 'Total number of members'
  },

  // Collaboration
  sharedWithMunicipalities: {
    type: DataTypes.ARRAY(DataTypes.UUID),
    defaultValue: [],
    field: 'shared_with_municipalities',
    comment: 'IDs of municipalities this channel is shared with'
  },
  sharedWithDepartments: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    field: 'shared_with_departments',
    comment: 'Department names this channel is shared with'
  },

  // Metadata
  tags: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    comment: 'Tags for categorization and search'
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Additional channel metadata'
  },
  pinnedMessages: {
    type: DataTypes.ARRAY(DataTypes.UUID),
    defaultValue: [],
    field: 'pinned_messages',
    comment: 'IDs of pinned messages'
  },

  // Audit Trail
  updatedBy: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'updated_by',
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  archivedBy: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'archived_by',
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  archivedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'archived_at'
  }
}, {
  tableName: 'SecureChannels',
  timestamps: true,
  underscored: false,  // Use camelCase column names
  paranoid: true, // Soft deletes
  indexes: [
    {
      fields: ['channel_type']
    },
    {
      fields: ['status']
    },
    {
      fields: ['security_level']
    },
    {
      fields: ['category']
    },
    {
      fields: ['created_by']
    },
    {
      fields: ['owner_id']
    },
    {
      fields: ['organization_id']
    },
    {
      fields: ['incident_id']
    },
    {
      fields: ['last_activity_at']
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

module.exports = SecureChannel;
