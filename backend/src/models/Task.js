const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const Task = sequelize.define('Task', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  workflowExecutionId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'workflow_execution_id',
    references: {
      model: 'WorkflowExecutions',
      key: 'id'
    }
  },
  workflowStepId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'workflow_step_id',
    references: {
      model: 'WorkflowSteps',
      key: 'id'
    }
  },
  permitId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'permit_id',
    references: {
      model: 'Permits',
      key: 'id'
    }
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  type: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Task type: review, approval, inspection, document_upload, etc.'
  },
  status: {
    type: DataTypes.ENUM('pending', 'assigned', 'in_progress', 'completed', 'cancelled', 'overdue'),
    defaultValue: 'pending',
    allowNull: false
  },
  priority: {
    type: DataTypes.ENUM('low', 'medium', 'high', 'urgent'),
    defaultValue: 'medium',
    allowNull: false
  },
  assignedTo: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'assigned_to',
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  assignedBy: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'assigned_by',
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  assignedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'assigned_at'
  },
  dueDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'due_date'
  },
  startedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'started_at'
  },
  completedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'completed_at'
  },
  completedBy: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'completed_by',
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  outcome: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Task outcome: approved, rejected, completed, etc.'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Notes or comments from the assignee'
  },
  formData: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'form_data',
    comment: 'Form data submitted with task completion'
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {},
    comment: 'Additional task metadata'
  },
  estimatedHours: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
    field: 'estimated_hours'
  },
  actualHours: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
    field: 'actual_hours'
  },
  tags: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    comment: 'Tags for categorization'
  },
  parentTaskId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'parent_task_id',
    references: {
      model: 'Tasks',
      key: 'id'
    },
    comment: 'Parent task for subtasks'
  },
  reminderSent: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'reminder_sent'
  },
  reminderSentAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'reminder_sent_at'
  }
}, {
  tableName: 'Tasks',
  timestamps: true,
  underscored: false,  // Use camelCase column names
  indexes: [
    {
      fields: ['workflow_execution_id']
    },
    {
      fields: ['workflow_step_id']
    },
    {
      fields: ['permit_id']
    },
    {
      fields: ['assigned_to']
    },
    {
      fields: ['status']
    },
    {
      fields: ['priority']
    },
    {
      fields: ['due_date']
    },
    {
      fields: ['type']
    },
    {
      fields: ['parent_task_id']
    },
    {
      fields: ['createdAt']
    }
  ]
});

// Check if task is overdue
Task.prototype.isOverdue = function() {
  return this.dueDate && new Date() > new Date(this.dueDate) && this.status !== 'completed' && this.status !== 'cancelled';
};

module.exports = Task;
