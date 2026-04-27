const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const Notification = sequelize.define('Notification', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'user_id',
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  type: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Notification type: permit_update, inspection_scheduled, payment_received, etc.'
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  priority: {
    type: DataTypes.ENUM('low', 'medium', 'high', 'urgent'),
    defaultValue: 'medium',
    allowNull: false
  },
  channel: {
    type: DataTypes.ENUM('in_app', 'email', 'sms', 'push'),
    defaultValue: 'in_app',
    allowNull: false,
    comment: 'Delivery channel'
  },
  relatedEntity: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'related_entity',
    comment: 'Related entity type: permit, inspection, payment, etc.'
  },
  relatedEntityId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'related_entity_id',
    comment: 'ID of related entity'
  },
  actionUrl: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'action_url',
    comment: 'URL for user to take action'
  },
  actionLabel: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'action_label',
    comment: 'Label for action button'
  },
  read: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false
  },
  readAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'read_at'
  },
  sent: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false,
    comment: 'Whether notification was successfully sent'
  },
  sentAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'sent_at'
  },
  deliveryStatus: {
    type: DataTypes.ENUM('pending', 'sent', 'delivered', 'failed', 'bounced'),
    defaultValue: 'pending',
    field: 'delivery_status'
  },
  deliveryMetadata: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'delivery_metadata',
    comment: 'Metadata from delivery service (email ID, SMS ID, etc.)'
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'expires_at',
    comment: 'When notification should expire/be auto-archived'
  }
}, {
  tableName: 'Notifications',
  timestamps: true,
  underscored: false,  // Use camelCase column names
  indexes: [
    {
      fields: ['user_id']
    },
    {
      fields: ['type']
    },
    {
      fields: ['read']
    },
    {
      fields: ['priority']
    },
    {
      fields: ['channel']
    },
    {
      fields: ['delivery_status']
    },
    {
      fields: ['related_entity', 'related_entity_id']
    },
    {
      fields: ['createdAt']
    },
    {
      fields: ['expires_at']
    }
  ]
});

// Mark as read
Notification.prototype.markAsRead = async function() {
  this.read = true;
  this.readAt = new Date();
  return this.save();
};

module.exports = Notification;
