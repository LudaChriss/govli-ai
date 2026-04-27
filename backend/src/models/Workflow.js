const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const Workflow = sequelize.define('Workflow', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Workflow name'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  type: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Workflow type: permit_review, inspection_process, document_approval, etc.'
  },
  version: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    allowNull: false,
    comment: 'Workflow version for versioning'
  },
  status: {
    type: DataTypes.ENUM('draft', 'active', 'inactive', 'archived'),
    defaultValue: 'draft',
    allowNull: false
  },
  config: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {},
    comment: 'Workflow configuration and settings'
  },
  triggerType: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'trigger_type',
    comment: 'What triggers this workflow: manual, permit_submitted, status_change, etc.'
  },
  triggerConditions: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'trigger_conditions',
    comment: 'Conditions that must be met to trigger workflow'
  },
  priority: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Workflow priority (higher = more important)'
  },
  tags: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    comment: 'Tags for categorization and search'
  },
  estimatedDuration: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'estimated_duration',
    comment: 'Estimated duration in minutes'
  },
  createdBy: {
    type: DataTypes.UUID,
    allowNull: false,
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
  },
  publishedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'published_at'
  },
  archivedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'archived_at'
  }
}, {
  tableName: 'Workflows',
  timestamps: true,
  underscored: false,  // Use camelCase column names
  indexes: [
    {
      fields: ['type']
    },
    {
      fields: ['status']
    },
    {
      fields: ['trigger_type']
    },
    {
      fields: ['created_by']
    },
    {
      fields: ['name']
    },
    {
      fields: ['createdAt']
    }
  ]
});

module.exports = Workflow;
