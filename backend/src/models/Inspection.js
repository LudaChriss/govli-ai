const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const Inspection = sequelize.define('Inspection', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  permitId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'permit_id',
    references: {
      model: 'Permits',
      key: 'id'
    }
  },
  inspectorId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'inspector_id',
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  type: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Type of inspection: initial, follow-up, final, etc.'
  },
  scheduledDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'scheduled_date'
  },
  completedDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'completed_date'
  },
  status: {
    type: DataTypes.ENUM('scheduled', 'in_progress', 'completed', 'cancelled', 'failed'),
    defaultValue: 'scheduled',
    allowNull: false
  },
  result: {
    type: DataTypes.ENUM('passed', 'failed', 'conditional', 'pending'),
    allowNull: true
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Inspector notes and findings'
  },
  checklist: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {},
    comment: 'Inspection checklist items as JSON'
  },
  location: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'GPS coordinates and location details'
  },
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
  tableName: 'Inspections',
  timestamps: true,
  underscored: false,  // Use camelCase column names
  indexes: [
    {
      fields: ['permit_id']
    },
    {
      fields: ['inspector_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['scheduled_date']
    },
    {
      fields: ['createdAt']
    }
  ]
});

module.exports = Inspection;
