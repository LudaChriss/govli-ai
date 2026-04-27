const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const SecurityEvent = sequelize.define('SecurityEvent', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },

  // Event Classification
  eventType: {
    type: DataTypes.ENUM(
      'authentication',
      'authorization',
      'data_access',
      'data_modification',
      'system_change',
      'network_activity',
      'malware_detection',
      'intrusion_attempt',
      'policy_violation',
      'suspicious_activity',
      'vulnerability_detected',
      'compliance_violation',
      'other'
    ),
    allowNull: false,
    field: 'event_type',
    comment: 'Type of security event'
  },
  severity: {
    type: DataTypes.ENUM('info', 'low', 'medium', 'high', 'critical'),
    defaultValue: 'info',
    comment: 'Event severity level'
  },
  category: {
    type: DataTypes.ENUM(
      'access_control',
      'data_protection',
      'network_security',
      'application_security',
      'physical_security',
      'operational_security',
      'compliance',
      'incident'
    ),
    defaultValue: 'operational_security',
    comment: 'Security category'
  },

  // Event Details
  title: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Brief event title'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'Detailed event description'
  },
  source: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Source system or component'
  },
  sourceIp: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'source_ip',
    comment: 'Source IP address'
  },
  sourceUser: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'source_user',
    references: {
      model: 'Users',
      key: 'id'
    },
    comment: 'User associated with event'
  },

  // Target Information
  targetResource: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'target_resource',
    comment: 'Resource or system affected'
  },
  targetUser: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'target_user',
    references: {
      model: 'Users',
      key: 'id'
    },
    comment: 'Target user if applicable'
  },
  targetData: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'target_data',
    comment: 'Additional target information'
  },

  // Event Status
  status: {
    type: DataTypes.ENUM(
      'detected',
      'acknowledged',
      'investigating',
      'contained',
      'resolved',
      'false_positive',
      'dismissed'
    ),
    defaultValue: 'detected',
    comment: 'Current event status'
  },
  acknowledged: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Whether event has been acknowledged'
  },
  acknowledgedBy: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'acknowledged_by',
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  acknowledgedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'acknowledged_at'
  },

  // Event Metadata
  eventData: {
    type: DataTypes.JSONB,
    defaultValue: {},
    field: 'event_data',
    comment: 'Additional event data and context'
  },
  requestData: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'request_data',
    comment: 'HTTP request data if applicable'
  },
  responseData: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'response_data',
    comment: 'HTTP response data if applicable'
  },

  // Detection and Analysis
  detectionMethod: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'detection_method',
    comment: 'How the event was detected (IDS, manual, automated, etc.)'
  },
  confidence: {
    type: DataTypes.DECIMAL(3, 2),
    allowNull: true,
    comment: 'Confidence level (0.00-1.00) for automated detections'
  },
  falsePositiveProbability: {
    type: DataTypes.DECIMAL(3, 2),
    allowNull: true,
    field: 'false_positive_probability',
    comment: 'Estimated probability of false positive'
  },

  // Related Events
  correlationId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'correlation_id',
    comment: 'ID to correlate related events'
  },
  parentEventId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'parent_event_id',
    references: {
      model: 'SecurityEvents',
      key: 'id'
    },
    comment: 'Parent event if this is a sub-event'
  },
  relatedIncidentId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'related_incident_id',
    comment: 'Related security incident ID'
  },
  relatedAlertId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'related_alert_id',
    comment: 'Related security alert ID'
  },

  // Impact Assessment
  impactLevel: {
    type: DataTypes.ENUM('none', 'minimal', 'moderate', 'significant', 'severe'),
    defaultValue: 'none',
    field: 'impact_level',
    comment: 'Assessed impact level'
  },
  affectedSystems: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    field: 'affected_systems',
    comment: 'List of affected systems'
  },
  affectedUsers: {
    type: DataTypes.ARRAY(DataTypes.UUID),
    defaultValue: [],
    field: 'affected_users',
    comment: 'List of affected user IDs'
  },
  dataCompromised: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'data_compromised',
    comment: 'Whether data was compromised'
  },

  // Response Actions
  actionTaken: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'action_taken',
    comment: 'Actions taken in response'
  },
  assignedTo: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'assigned_to',
    references: {
      model: 'Users',
      key: 'id'
    },
    comment: 'User assigned to handle event'
  },
  resolvedBy: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'resolved_by',
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  resolvedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'resolved_at'
  },
  resolution: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Resolution details'
  },

  // Compliance and Reporting
  requiresReporting: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'requires_reporting',
    comment: 'Whether event requires regulatory reporting'
  },
  reportedToAuthorities: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'reported_to_authorities',
    comment: 'Whether reported to authorities'
  },
  reportedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'reported_at'
  },
  complianceFrameworks: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    field: 'compliance_frameworks',
    comment: 'Relevant compliance frameworks (HIPAA, GDPR, etc.)'
  },

  // Timestamps
  eventTimestamp: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'event_timestamp',
    comment: 'When the event actually occurred'
  },
  detectedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'detected_at',
    comment: 'When the event was detected'
  },

  // Metadata
  tags: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    comment: 'Event tags for categorization'
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Additional event metadata'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Investigation notes'
  },

  // Audit
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
  tableName: 'SecurityEvents',
  timestamps: true,
  underscored: false,  // Use camelCase column names
  indexes: [
    {
      fields: ['event_type']
    },
    {
      fields: ['severity']
    },
    {
      fields: ['category']
    },
    {
      fields: ['status']
    },
    {
      fields: ['source_user']
    },
    {
      fields: ['target_user']
    },
    {
      fields: ['source_ip']
    },
    {
      fields: ['correlation_id']
    },
    {
      fields: ['related_incident_id']
    },
    {
      fields: ['event_timestamp']
    },
    {
      fields: ['detected_at']
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

module.exports = SecurityEvent;
