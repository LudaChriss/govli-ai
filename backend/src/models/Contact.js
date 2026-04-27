const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const Contact = sequelize.define('Contact', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  // Basic Information
  firstName: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'first_name'
  },
  lastName: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'last_name'
  },
  fullName: {
    type: DataTypes.VIRTUAL,
    get() {
      return `${this.firstName} ${this.lastName}`;
    }
  },
  email: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      isEmail: true
    },
    comment: 'Primary email address'
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Primary phone number'
  },
  alternatePhone: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'alternate_phone',
    comment: 'Secondary phone number'
  },

  // Organization Information
  organization: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Company or organization name'
  },
  title: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Job title or position'
  },
  department: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Department within organization'
  },

  // Address Information
  address: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Street address'
  },
  city: {
    type: DataTypes.STRING,
    allowNull: true
  },
  state: {
    type: DataTypes.STRING,
    allowNull: true
  },
  zipCode: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'zip_code'
  },
  country: {
    type: DataTypes.STRING,
    defaultValue: 'USA'
  },

  // Contact Type and Classification
  contactType: {
    type: DataTypes.ENUM('citizen', 'business', 'contractor', 'vendor', 'government', 'other'),
    defaultValue: 'citizen',
    field: 'contact_type',
    comment: 'Type of contact'
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'archived'),
    defaultValue: 'active',
    comment: 'Contact status'
  },

  // Tags and Categories
  tags: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    comment: 'Tags for categorization and search'
  },

  // Source and Attribution
  source: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'How the contact was acquired (permit_app, web_form, import, manual, etc.)'
  },
  sourceDetails: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'source_details',
    comment: 'Additional details about contact source'
  },

  // Communication Preferences
  preferredContactMethod: {
    type: DataTypes.ENUM('email', 'phone', 'mail', 'portal'),
    defaultValue: 'email',
    field: 'preferred_contact_method'
  },
  allowMarketing: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'allow_marketing',
    comment: 'Opt-in for marketing communications'
  },
  doNotContact: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'do_not_contact',
    comment: 'Do not contact flag'
  },

  // Additional Information
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Internal notes about contact'
  },
  customFields: {
    type: DataTypes.JSONB,
    defaultValue: {},
    field: 'custom_fields',
    comment: 'Custom fields for extended data'
  },

  // Social Media and Web
  website: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      isUrl: true
    }
  },
  linkedIn: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'linkedin'
  },

  // Engagement Metrics
  lastContactDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_contact_date',
    comment: 'Date of last interaction'
  },
  totalInteractions: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'total_interactions',
    comment: 'Total number of interactions recorded'
  },

  // User Association
  linkedUserId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'linked_user_id',
    references: {
      model: 'Users',
      key: 'id'
    },
    comment: 'Link to User account if contact has portal access'
  },

  // Duplicate Detection
  duplicateOf: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'duplicate_of',
    references: {
      model: 'Contacts',
      key: 'id'
    },
    comment: 'If this is a duplicate, reference to primary contact'
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
  tableName: 'Contacts',
  timestamps: true,
  underscored: false,  // Use camelCase column names
  paranoid: true, // Soft deletes
  indexes: [
    {
      fields: ['email']
    },
    {
      fields: ['phone']
    },
    {
      fields: ['organization']
    },
    {
      fields: ['contact_type']
    },
    {
      fields: ['status']
    },
    {
      fields: ['tags'],
      using: 'gin' // GIN index for array search
    },
    {
      fields: ['linked_user_id']
    },
    {
      fields: ['createdAt']
    },
    {
      // Composite index for name search
      fields: ['first_name', 'last_name']
    }
  ]
});

module.exports = Contact;
