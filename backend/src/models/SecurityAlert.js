const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const SecurityAlert = sequelize.define('SecurityAlert', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },

  // Alert Classification
  alertType: {
    type: DataTypes.ENUM(
      'intrusion_detection',
      'malware',
      'data_breach',
      'unauthorized_access',
      'brute_force',
      'ddos',
      'insider_threat',
      'policy_violation',
      'vulnerability',
      'anomaly',
      'compliance_violation',
      'system_compromise'
    ),
    allowNull: false,
    field: 'alert_type',
    comment: 'Type of security alert'
  },
  severity: {
    type: DataTypes.ENUM('low', 'medium', 'high', 'critical'),
    allowNull: false,
    comment: 'Alert severity level'
  },
  priority: {
    type: DataTypes.ENUM('p1', 'p2', 'p3', 'p4'),
    defaultValue: 'p3',
    comment: 'Response priority (P1=highest)'
  },

  // Alert Details
  title: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Alert title'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'Detailed alert description'
  },
  recommendation: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Recommended actions to take'
  },

  // Source and Detection
  source: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Detection source (IDS, SIEM, manual, etc.)'
  },
  detectionMethod: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'detection_method',
    comment: 'Method used for detection'
  },
  detectedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'detected_at',
    comment: 'When alert was first detected'
  },
  firstSeenAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'first_seen_at',
    comment: 'When threat was first observed'
  },
  lastSeenAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_seen_at',
    comment: 'When threat was last observed'
  },
  occurrenceCount: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    field: 'occurrence_count',
    comment: 'Number of times this alert has triggered'
  },

  // Status and Workflow
  status: {
    type: DataTypes.ENUM(
      'new',
      'acknowledged',
      'investigating',
      'contained',
      'mitigated',
      'resolved',
      'false_positive',
      'ignored'
    ),
    defaultValue: 'new',
    comment: 'Alert status'
  },
  assignedTo: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'assigned_to',
    references: {
      model: 'Users',
      key: 'id'
    },
    comment: 'Security analyst assigned'
  },
  assignedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'assigned_at'
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

  // Threat Information
  threatLevel: {
    type: DataTypes.ENUM('minimal', 'low', 'medium', 'high', 'critical'),
    defaultValue: 'medium',
    field: 'threat_level',
    comment: 'Assessed threat level'
  },
  threatActor: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'threat_actor',
    comment: 'Identified or suspected threat actor'
  },
  attackVector: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'attack_vector',
    comment: 'Method of attack (phishing, exploit, etc.)'
  },
  indicators: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Indicators of Compromise (IoCs)'
  },

  // Affected Resources
  affectedSystems: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    field: 'affected_systems',
    comment: 'List of affected systems/resources'
  },
  affectedUsers: {
    type: DataTypes.ARRAY(DataTypes.UUID),
    defaultValue: [],
    field: 'affected_users',
    comment: 'List of affected user IDs'
  },
  sourceIp: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'source_ip',
    comment: 'Source IP address of threat'
  },
  destinationIp: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'destination_ip',
    comment: 'Destination IP address'
  },

  // Impact Assessment
  potentialImpact: {
    type: DataTypes.ENUM('none', 'low', 'medium', 'high', 'critical'),
    defaultValue: 'medium',
    field: 'potential_impact',
    comment: 'Assessed potential impact'
  },
  actualImpact: {
    type: DataTypes.ENUM('none', 'low', 'medium', 'high', 'critical'),
    allowNull: true,
    field: 'actual_impact',
    comment: 'Actual impact after investigation'
  },
  dataAtRisk: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'data_at_risk',
    comment: 'Description of data at risk'
  },
  estimatedLoss: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    field: 'estimated_loss',
    comment: 'Estimated financial loss'
  },

  // Response Actions
  actionsTaken: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'actions_taken',
    comment: 'Actions taken in response'
  },
  containmentStatus: {
    type: DataTypes.ENUM('not_started', 'in_progress', 'contained', 'failed'),
    defaultValue: 'not_started',
    field: 'containment_status',
    comment: 'Containment status'
  },
  containedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'contained_at'
  },
  mitigatedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'mitigated_at'
  },
  resolvedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'resolved_at'
  },
  resolutionNotes: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'resolution_notes',
    comment: 'Notes on how alert was resolved'
  },

  // Related Records
  relatedEventIds: {
    type: DataTypes.ARRAY(DataTypes.UUID),
    defaultValue: [],
    field: 'related_event_ids',
    comment: 'Related security event IDs'
  },
  relatedIncidentId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'related_incident_id',
    comment: 'Related security incident ID'
  },
  parentAlertId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'parent_alert_id',
    references: {
      model: 'SecurityAlerts',
      key: 'id'
    },
    comment: 'Parent alert if this is a sub-alert'
  },

  // Automation and Rules
  triggeredByRule: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'triggered_by_rule',
    comment: 'Security rule that triggered this alert'
  },
  autoTriaged: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'auto_triaged',
    comment: 'Whether alert was auto-triaged'
  },
  confidence: {
    type: DataTypes.DECIMAL(3, 2),
    allowNull: true,
    comment: 'Confidence level (0.00-1.00) for automated alerts'
  },
  falsePositive: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'false_positive',
    comment: 'Whether determined to be false positive'
  },

  // Notifications
  notificationsSent: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    field: 'notifications_sent',
    comment: 'List of notification methods used (email, sms, etc.)'
  },
  escalated: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Whether alert was escalated'
  },
  escalatedTo: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'escalated_to',
    references: {
      model: 'Users',
      key: 'id'
    },
    comment: 'User alert was escalated to'
  },
  escalatedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'escalated_at'
  },

  // Evidence and Documentation
  evidenceCollected: {
    type: DataTypes.JSONB,
    defaultValue: [],
    field: 'evidence_collected',
    comment: 'Evidence and artifacts collected'
  },
  forensicData: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'forensic_data',
    comment: 'Forensic analysis data'
  },
  attachments: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'File attachments (logs, screenshots, etc.)'
  },

  // Metadata
  tags: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    comment: 'Alert tags'
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Additional alert metadata'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Investigation notes'
  },

  // SLA Tracking
  responseTime: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'response_time',
    comment: 'Time to acknowledge (minutes)'
  },
  resolutionTime: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'resolution_time',
    comment: 'Time to resolve (minutes)'
  },
  slaBreached: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'sla_breached',
    comment: 'Whether SLA was breached'
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
  tableName: 'SecurityAlerts',
  timestamps: true,
  underscored: false,  // Use camelCase column names
  indexes: [
    {
      fields: ['alert_type']
    },
    {
      fields: ['severity']
    },
    {
      fields: ['priority']
    },
    {
      fields: ['status']
    },
    {
      fields: ['assigned_to']
    },
    {
      fields: ['source_ip']
    },
    {
      fields: ['detected_at']
    },
    {
      fields: ['resolved_at']
    },
    {
      fields: ['false_positive']
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

module.exports = SecurityAlert;
