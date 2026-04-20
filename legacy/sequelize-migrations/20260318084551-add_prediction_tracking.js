'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('devices', 'last_prediction_temperature', {
      type: Sequelize.DECIMAL(5, 2),
      allowNull: true
    });
    await queryInterface.addColumn('devices', 'last_prediction_humidity', {
      type: Sequelize.DECIMAL(5, 2),
      allowNull: true
    });
    await queryInterface.addColumn('devices', 'last_prediction_co2', {
      type: Sequelize.INTEGER,
      allowNull: true
    });
    await queryInterface.addColumn('devices', 'actuator_fan_on_reason', {
      type: Sequelize.ENUM(
        'predictive',
        'critical',
        'manual',
        'firmware_safety'
      ),
      allowNull: true
    });
    await queryInterface.addColumn('devices', 'actuator_ac_on_reason', {
      type: Sequelize.ENUM(
        'predictive',
        'critical',
        'manual',
        'firmware_safety'
      ),
      allowNull: true
    });
    await queryInterface.addColumn('devices', 'actuator_purifier_on_reason', {
      type: Sequelize.ENUM(
        'predictive',
        'critical',
        'manual',
        'firmware_safety'
      ),
      allowNull: true
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('devices', 'last_prediction_temperature');
    await queryInterface.removeColumn('devices', 'last_prediction_humidity');
    await queryInterface.removeColumn('devices', 'last_prediction_co2');
    await queryInterface.removeColumn('devices', 'actuator_fan_on_reason');
    await queryInterface.removeColumn('devices', 'actuator_ac_on_reason');
    await queryInterface.removeColumn('devices', 'actuator_purifier_on_reason');
  }
};
