const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const Document = sequelize.define('Document', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
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
  inspectionId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'inspection_id',
    references: {
      model: 'Inspections',
      key: 'id'
    }
  },
  fileName: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'file_name'
  },
  originalName: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'original_name',
    comment: 'Original filename from upload'
  },
  filePath: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'file_path',
    comment: 'Path to file in storage (S3 key or local path)'
  },
  fileType: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'file_type',
    comment: 'MIME type'
  },
  fileSize: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'file_size',
    comment: 'File size in bytes'
  },
  category: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Document category: blueprint, photo, report, etc.'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {},
    comment: 'Additional metadata (dimensions, pages, etc.)'
  },
  ocrText: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'ocr_text',
    comment: 'Extracted text from OCR processing'
  },
  ocrMetadata: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'ocr_metadata',
    comment: 'OCR processing metadata and confidence scores'
  },
  processed: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Whether document has been processed (OCR, classification, etc.)'
  },
  processedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'processed_at'
  },
  uploadedBy: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'uploaded_by',
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  deletedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'deleted_at'
  }
}, {
  tableName: 'Documents',
  timestamps: true,
  underscored: false,  // Use camelCase column names
  paranoid: true, // Soft deletes
  indexes: [
    {
      fields: ['permit_id']
    },
    {
      fields: ['inspection_id']
    },
    {
      fields: ['uploaded_by']
    },
    {
      fields: ['file_type']
    },
    {
      fields: ['category']
    },
    {
      fields: ['createdAt']
    }
  ]
});

module.exports = Document;
