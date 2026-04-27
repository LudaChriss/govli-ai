const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const Payment = sequelize.define('Payment', {
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
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'user_id',
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    comment: 'Payment amount in dollars'
  },
  currency: {
    type: DataTypes.STRING(3),
    defaultValue: 'USD',
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed', 'refunded', 'cancelled'),
    defaultValue: 'pending',
    allowNull: false
  },
  paymentMethod: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'payment_method',
    comment: 'Payment method: credit_card, debit_card, ach, etc.'
  },
  transactionId: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true,
    field: 'transaction_id',
    comment: 'External payment processor transaction ID'
  },
  paymentProcessor: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'payment_processor',
    comment: 'Payment processor used: stripe, paypal, etc.'
  },
  paymentType: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'payment_type',
    comment: 'Type of payment: permit_fee, inspection_fee, fine, etc.'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {},
    comment: 'Additional payment metadata from processor'
  },
  receiptUrl: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'receipt_url'
  },
  receiptNumber: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true,
    field: 'receipt_number'
  },
  paidAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'paid_at'
  },
  refundedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'refunded_at'
  },
  refundAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    field: 'refund_amount'
  },
  refundReason: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'refund_reason'
  },
  failureReason: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'failure_reason'
  }
}, {
  tableName: 'Payments',
  timestamps: true,
  underscored: false,  // Use camelCase column names
  indexes: [
    {
      fields: ['permit_id']
    },
    {
      fields: ['user_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['transaction_id']
    },
    {
      fields: ['receipt_number']
    },
    {
      fields: ['createdAt']
    },
    {
      fields: ['paid_at']
    }
  ]
});

// Generate receipt number before creation
Payment.beforeCreate(async (payment) => {
  if (!payment.receiptNumber) {
    const count = await Payment.count();
    payment.receiptNumber = `RCP-${new Date().getFullYear()}-${String(count + 1).padStart(6, '0')}`;
  }
});

module.exports = Payment;
