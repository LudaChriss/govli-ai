const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const ContactInteraction = sequelize.define('ContactInteraction', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  contactId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'contact_id',
    references: {
      model: 'Contacts',
      key: 'id'
    }
  },

  // Interaction Type
  type: {
    type: DataTypes.ENUM(
      'email',
      'phone_call',
      'meeting',
      'permit_application',
      'inspection',
      'payment',
      'document_upload',
      'portal_login',
      'notification_sent',
      'support_ticket',
      'other'
    ),
    allowNull: false,
    comment: 'Type of interaction'
  },

  // Interaction Direction
  direction: {
    type: DataTypes.ENUM('inbound', 'outbound', 'system'),
    defaultValue: 'system',
    comment: 'Direction of interaction'
  },

  // Subject and Content
  subject: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Interaction subject or title'
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Interaction content or notes'
  },

  // Outcome and Status
  outcome: {
    type: DataTypes.ENUM('successful', 'unsuccessful', 'pending', 'cancelled'),
    defaultValue: 'successful'
  },
  status: {
    type: DataTypes.ENUM('completed', 'scheduled', 'in_progress', 'cancelled'),
    defaultValue: 'completed'
  },

  // Scheduling
  scheduledDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'scheduled_date',
    comment: 'For scheduled interactions (meetings, calls)'
  },
  completedDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'completed_date'
  },
  duration: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Duration in minutes'
  },

  // Related Records
  permitId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'permit_id',
    references: {
      model: 'Permits',
      key: 'id'
    },
    comment: 'Related permit if applicable'
  },
  inspectionId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'inspection_id',
    references: {
      model: 'Inspections',
      key: 'id'
    },
    comment: 'Related inspection if applicable'
  },
  documentId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'document_id',
    references: {
      model: 'Documents',
      key: 'id'
    },
    comment: 'Related document if applicable'
  },
  paymentId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'payment_id',
    references: {
      model: 'Payments',
      key: 'id'
    },
    comment: 'Related payment if applicable'
  },

  // User Who Handled Interaction
  handledBy: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'handled_by',
    references: {
      model: 'Users',
      key: 'id'
    },
    comment: 'Staff member who handled this interaction'
  },

  // Additional Metadata
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Additional interaction metadata'
  },

  // Tags for Categorization
  tags: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    comment: 'Tags for categorization'
  },

  // Follow-up
  requiresFollowup: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'requires_followup',
    comment: 'Whether this interaction requires follow-up'
  },
  followupDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'followup_date',
    comment: 'Date for follow-up'
  },
  followupNotes: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'followup_notes',
    comment: 'Notes for follow-up action'
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
  }
}, {
  tableName: 'ContactInteractions',
  timestamps: true,
  underscored: false,  // Use camelCase column names
  indexes: [
    {
      fields: ['contact_id']
    },
    {
      fields: ['type']
    },
    {
      fields: ['direction']
    },
    {
      fields: ['status']
    },
    {
      fields: ['scheduled_date']
    },
    {
      fields: ['completed_date']
    },
    {
      fields: ['permit_id']
    },
    {
      fields: ['handled_by']
    },
    {
      fields: ['requires_followup']
    },
    {
      fields: ['createdAt']
    }
  ]
});

module.exports = ContactInteraction;
