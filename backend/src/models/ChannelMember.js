const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const ChannelMember = sequelize.define('ChannelMember', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },

  // Channel and User
  channelId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'channel_id',
    references: {
      model: 'SecureChannels',
      key: 'id'
    },
    comment: 'Channel ID'
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'user_id',
    references: {
      model: 'Users',
      key: 'id'
    },
    comment: 'User ID'
  },

  // Member Role
  role: {
    type: DataTypes.ENUM(
      'owner',       // Channel owner (full control)
      'admin',       // Can manage members and settings
      'moderator',   // Can delete messages, manage content
      'member',      // Regular member
      'guest'        // Limited access guest
    ),
    defaultValue: 'member',
    comment: 'Member role in channel'
  },

  // Permissions
  canPost: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'can_post',
    comment: 'Whether member can post messages'
  },
  canUploadFiles: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'can_upload_files',
    comment: 'Whether member can upload files'
  },
  canInviteMembers: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'can_invite_members',
    comment: 'Whether member can invite others'
  },
  canPinMessages: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'can_pin_messages',
    comment: 'Whether member can pin messages'
  },
  canDeleteOwnMessages: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'can_delete_own_messages',
    comment: 'Whether member can delete their own messages'
  },

  // Membership Status
  status: {
    type: DataTypes.ENUM(
      'active',
      'invited',
      'left',
      'removed',
      'banned'
    ),
    defaultValue: 'active',
    comment: 'Membership status'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_active',
    comment: 'Whether member is currently active'
  },

  // Join/Leave Tracking
  joinedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'joined_at',
    comment: 'When user joined the channel'
  },
  invitedBy: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'invited_by',
    references: {
      model: 'Users',
      key: 'id'
    },
    comment: 'User who invited this member'
  },
  leftAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'left_at',
    comment: 'When user left the channel'
  },
  removedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'removed_at',
    comment: 'When user was removed from channel'
  },
  removedBy: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'removed_by',
    references: {
      model: 'Users',
      key: 'id'
    },
    comment: 'User who removed this member'
  },
  removeReason: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'remove_reason',
    comment: 'Reason for removal/ban'
  },

  // Notification Settings
  notificationLevel: {
    type: DataTypes.ENUM(
      'all',         // Notify for all messages
      'mentions',    // Only when mentioned
      'important',   // Only for urgent/important messages
      'none'         // No notifications
    ),
    defaultValue: 'all',
    field: 'notification_level',
    comment: 'Notification preference for this channel'
  },
  muteUntil: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'mute_until',
    comment: 'Mute notifications until this timestamp'
  },
  isMuted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_muted',
    comment: 'Whether notifications are muted'
  },

  // Activity Tracking
  lastReadAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_read_at',
    comment: 'When user last read messages in this channel'
  },
  lastReadMessageId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'last_read_message_id',
    references: {
      model: 'SecureMessages',
      key: 'id'
    },
    comment: 'Last message ID that user read'
  },
  unreadCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'unread_count',
    comment: 'Number of unread messages'
  },
  lastPostedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_posted_at',
    comment: 'When user last posted a message'
  },
  messageCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'message_count',
    comment: 'Total messages posted by this member'
  },

  // Favorites and Bookmarks
  isFavorite: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_favorite',
    comment: 'Whether user has favorited this channel'
  },
  favoritedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'favorited_at'
  },
  bookmarkedMessages: {
    type: DataTypes.ARRAY(DataTypes.UUID),
    defaultValue: [],
    field: 'bookmarked_messages',
    comment: 'Message IDs bookmarked by this user'
  },

  // Custom Settings per Member
  customNickname: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'custom_nickname',
    comment: 'Custom nickname in this channel'
  },
  customColor: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'custom_color',
    comment: 'Custom color for this member in channel'
  },

  // Compliance and Audit
  acknowledgedMessages: {
    type: DataTypes.ARRAY(DataTypes.UUID),
    defaultValue: [],
    field: 'acknowledged_messages',
    comment: 'Message IDs that required and received acknowledgment'
  },
  acknowledgmentCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'acknowledgment_count',
    comment: 'Number of messages acknowledged'
  },

  // External Member Info (for inter-municipal collaboration)
  isExternal: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_external',
    comment: 'Whether member is from external organization'
  },
  externalOrganization: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'external_organization',
    comment: 'Name of external organization'
  },
  externalDepartment: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'external_department',
    comment: 'Department in external organization'
  },

  // Metadata
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Additional member metadata'
  },
  tags: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    comment: 'Member tags in this channel'
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
    comment: 'User who added this member'
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
  tableName: 'ChannelMembers',
  timestamps: true,
  underscored: false,  // Use camelCase column names
  paranoid: true, // Soft deletes
  indexes: [
    {
      fields: ['channel_id', 'user_id'],
      unique: true
    },
    {
      fields: ['channel_id', 'status']
    },
    {
      fields: ['user_id', 'status']
    },
    {
      fields: ['role']
    },
    {
      fields: ['is_active']
    },
    {
      fields: ['joined_at']
    },
    {
      fields: ['last_read_at']
    },
    {
      fields: ['is_favorite']
    },
    {
      fields: ['tags'],
      using: 'gin'
    },
    {
      fields: ['createdAt']
    }
  ]
});

module.exports = ChannelMember;
