const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const Grant = sequelize.define('Grant', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  // Grant Identification
  grantNumber: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false,
    field: 'grant_number',
    comment: 'Unique grant identifier (e.g., CFDA number or Grants.gov ID)'
  },
  externalId: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'external_id',
    comment: 'External ID from Grants.gov or other source'
  },

  // Basic Information
  title: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Grant opportunity title'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Full grant description'
  },
  summary: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Brief summary of grant opportunity'
  },

  // Agency Information
  agencyName: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'agency_name',
    comment: 'Federal or state agency offering grant'
  },
  agencyCode: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'agency_code',
    comment: 'Agency code (e.g., CFDA code)'
  },
  programName: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'program_name',
    comment: 'Specific program offering the grant'
  },

  // Grant Category and Type
  category: {
    type: DataTypes.ENUM(
      'infrastructure',
      'public_safety',
      'education',
      'healthcare',
      'environment',
      'economic_development',
      'housing',
      'transportation',
      'technology',
      'other'
    ),
    defaultValue: 'other',
    comment: 'Grant category'
  },
  grantType: {
    type: DataTypes.ENUM(
      'discretionary',
      'mandatory',
      'continuation',
      'earmark'
    ),
    allowNull: true,
    field: 'grant_type'
  },

  // Financial Information
  awardFloor: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    field: 'award_floor',
    comment: 'Minimum award amount'
  },
  awardCeiling: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    field: 'award_ceiling',
    comment: 'Maximum award amount'
  },
  estimatedTotalFunding: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    field: 'estimated_total_funding',
    comment: 'Total funding available'
  },
  estimatedAwards: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'estimated_awards',
    comment: 'Estimated number of awards to be made'
  },

  // Important Dates
  postDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'post_date',
    comment: 'Date grant was posted'
  },
  closeDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'close_date',
    comment: 'Application deadline'
  },
  archiveDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'archive_date',
    comment: 'Date grant will be archived'
  },

  // Eligibility
  eligibleApplicants: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    field: 'eligible_applicants',
    comment: 'Types of eligible applicants (e.g., city, county, nonprofit)'
  },
  eligibilityRequirements: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'eligibility_requirements',
    comment: 'Detailed eligibility requirements'
  },

  // Application Information
  applicationUrl: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'application_url',
    validate: {
      isUrl: true
    }
  },
  grantInfoUrl: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'grant_info_url',
    validate: {
      isUrl: true
    }
  },
  contactInfo: {
    type: DataTypes.JSONB,
    defaultValue: {},
    field: 'contact_info',
    comment: 'Grant contact information (name, email, phone)'
  },

  // Matching Requirements
  costSharing: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'cost_sharing',
    comment: 'Whether cost sharing/matching is required'
  },
  matchPercentage: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
    field: 'match_percentage',
    comment: 'Required match percentage if applicable'
  },

  // Status and Tracking
  status: {
    type: DataTypes.ENUM('open', 'closed', 'forecasted', 'archived'),
    defaultValue: 'open',
    comment: 'Grant opportunity status'
  },
  competitiveness: {
    type: DataTypes.ENUM('low', 'medium', 'high', 'very_high'),
    allowNull: true,
    comment: 'Estimated competitiveness level'
  },

  // Additional Data
  keywords: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    comment: 'Keywords for search and matching'
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Additional grant metadata'
  },

  // Source Tracking
  source: {
    type: DataTypes.STRING,
    defaultValue: 'manual',
    comment: 'Source of grant data (grants_gov, manual, state, etc.)'
  },
  lastSyncedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_synced_at',
    comment: 'Last time data was synced from external source'
  },

  // AI Matching Score (for municipal needs)
  matchScore: {
    type: DataTypes.DECIMAL(3, 2),
    allowNull: true,
    field: 'match_score',
    comment: 'AI-calculated match score for municipality (0.00-1.00)'
  },
  matchReasons: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    field: 'match_reasons',
    comment: 'Reasons why this grant matches municipality needs'
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
  tableName: 'Grants',
  timestamps: true,
  underscored: false,  // Use camelCase column names
  paranoid: true, // Soft deletes
  indexes: [
    {
      fields: ['grant_number'],
      unique: true
    },
    {
      fields: ['external_id']
    },
    {
      fields: ['agency_name']
    },
    {
      fields: ['category']
    },
    {
      fields: ['status']
    },
    {
      fields: ['close_date']
    },
    {
      fields: ['keywords'],
      using: 'gin' // GIN index for array search
    },
    {
      fields: ['match_score']
    },
    {
      fields: ['createdAt']
    }
  ]
});

module.exports = Grant;
