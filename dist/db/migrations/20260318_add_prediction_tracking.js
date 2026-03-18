"use strict";
/**
 * Database migration: Add prediction and actuator reason tracking to devices table
 * Run with: npm run db:migrate
 */
module.exports = {
    async up(queryInterface, Sequelize) {
        const tableDescription = await queryInterface.describeTable('devices');
        // Add columns if they don't already exist
        const addColumns = [];
        if (!tableDescription.last_prediction_temperature) {
            addColumns.push(queryInterface.addColumn('devices', 'last_prediction_temperature', {
                type: Sequelize.REAL,
                allowNull: true,
                defaultValue: null
            }));
        }
        if (!tableDescription.last_prediction_humidity) {
            addColumns.push(queryInterface.addColumn('devices', 'last_prediction_humidity', {
                type: Sequelize.REAL,
                allowNull: true,
                defaultValue: null
            }));
        }
        if (!tableDescription.last_prediction_co2) {
            addColumns.push(queryInterface.addColumn('devices', 'last_prediction_co2', {
                type: Sequelize.REAL,
                allowNull: true,
                defaultValue: null
            }));
        }
        if (!tableDescription.actuator_fan_on_reason) {
            addColumns.push(queryInterface.addColumn('devices', 'actuator_fan_on_reason', {
                type: Sequelize.TEXT,
                allowNull: true,
                defaultValue: null
            }));
        }
        if (!tableDescription.actuator_dehumidifier_on_reason) {
            addColumns.push(queryInterface.addColumn('devices', 'actuator_dehumidifier_on_reason', {
                type: Sequelize.TEXT,
                allowNull: true,
                defaultValue: null
            }));
        }
        if (addColumns.length > 0) {
            console.log(`Adding ${addColumns.length} columns to devices table...`);
            await Promise.all(addColumns);
        }
    },
    async down(queryInterface) {
        // Rollback - remove added columns
        const columnsToRemove = [
            'last_prediction_temperature',
            'last_prediction_humidity',
            'last_prediction_co2',
            'actuator_fan_on_reason',
            'actuator_dehumidifier_on_reason'
        ];
        await Promise.all(columnsToRemove.map((col) => queryInterface.removeColumn('devices', col).catch((err) => {
            // Silently ignore if column doesn't exists
            if (!err.message.includes('Unknown column'))
                throw err;
        })));
    }
};
