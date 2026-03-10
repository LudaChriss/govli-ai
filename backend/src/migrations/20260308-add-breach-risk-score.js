/**
 * Migration: Add breach_risk_score to FoiaRequests
 * Purpose: Support A-3 Tracking v2.0 Overlay with real-time SLA risk tracking
 * Date: 2026-03-08
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add breach_risk_score column to FoiaRequests table
    await queryInterface.addColumn('FoiaRequests', 'breach_risk_score', {
      type: Sequelize.DECIMAL(5, 2),
      allowNull: true,
      defaultValue: 0,
      comment: 'SLA breach risk score (0-100), calculated on status transitions'
    });

    // Add index for efficient SLA wall queries (sorted by risk score DESC)
    await queryInterface.addIndex('FoiaRequests', ['breach_risk_score'], {
      name: 'idx_foia_requests_breach_risk_score'
    });

    console.log('✓ Added breach_risk_score column to FoiaRequests');
    console.log('✓ Added index on breach_risk_score for SLA wall queries');
  },

  down: async (queryInterface, Sequelize) => {
    // Remove index first
    await queryInterface.removeIndex('FoiaRequests', 'idx_foia_requests_breach_risk_score');

    // Remove column
    await queryInterface.removeColumn('FoiaRequests', 'breach_risk_score');

    console.log('✓ Removed breach_risk_score column from FoiaRequests');
  }
};
