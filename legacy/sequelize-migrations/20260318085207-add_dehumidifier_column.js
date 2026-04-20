'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn(
      'devices',
      'actuator_dehumidifier_on_reason',
      {
        type: Sequelize.ENUM(
          'predictive',
          'critical',
          'manual',
          'firmware_safety'
        ),
        allowNull: true
      }
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn(
      'devices',
      'actuator_dehumidifier_on_reason'
    );
  }
};
