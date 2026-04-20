"use strict";
/**
 * @file schema.ts
 * @purpose Drizzle ORM table definitions and relations for all entities
 * @usedBy drizzle.ts, all services
 * @deps drizzle-orm/pg-core
 * @exports All table schemas + relations + insert/select types
 * @sideEffects None (schema definition only)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.keamananLogsRelations = exports.intrusiLogsRelations = exports.predictionResultsRelations = exports.lingkunganLogsRelations = exports.pushSubscriptionsRelations = exports.userNotificationPreferencesRelations = exports.incidentsRelations = exports.userRolesRelations = exports.profilesRelations = exports.devicesRelations = exports.areasRelations = exports.warehousesRelations = exports.keamanan_logs = exports.intrusi_logs = exports.prediction_results = exports.lingkungan_logs = exports.telegram_subscribers = exports.push_subscriptions = exports.user_notification_preferences = exports.incidents = exports.user_roles = exports.profiles = exports.devices = exports.areas = exports.warehouses = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
// ─── Core Tables ──────────────────────────────────────────
exports.warehouses = (0, pg_core_1.pgTable)('warehouses', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    name: (0, pg_core_1.text)('name').notNull(),
    location: (0, pg_core_1.text)('location'),
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updated_at: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull()
});
exports.areas = (0, pg_core_1.pgTable)('areas', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    warehouse_id: (0, pg_core_1.uuid)('warehouse_id')
        .notNull()
        .references(() => exports.warehouses.id),
    name: (0, pg_core_1.text)('name').notNull(),
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updated_at: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull()
});
exports.devices = (0, pg_core_1.pgTable)('devices', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    area_id: (0, pg_core_1.uuid)('area_id')
        .notNull()
        .references(() => exports.areas.id),
    name: (0, pg_core_1.text)('name').notNull(),
    system_type: (0, pg_core_1.text)('system_type').notNull(),
    status: (0, pg_core_1.text)('status')
        .$type()
        .notNull()
        .default('Offline'),
    last_heartbeat: (0, pg_core_1.timestamp)('last_heartbeat'),
    fan_state: (0, pg_core_1.text)('fan_state').$type().notNull().default('OFF'),
    dehumidifier_state: (0, pg_core_1.text)('dehumidifier_state').notNull().default('OFF'),
    control_mode: (0, pg_core_1.text)('control_mode').notNull().default('AUTO'),
    manual_override_until: (0, pg_core_1.timestamp)('manual_override_until'),
    last_temperature: (0, pg_core_1.real)('last_temperature'),
    last_humidity: (0, pg_core_1.real)('last_humidity'),
    last_co2: (0, pg_core_1.real)('last_co2'),
    door_state: (0, pg_core_1.text)('door_state').$type(),
    intrusi_system_state: (0, pg_core_1.text)('intrusi_system_state').$type(),
    siren_state: (0, pg_core_1.text)('siren_state').$type(),
    power_source: (0, pg_core_1.text)('power_source').$type(),
    vbat_voltage: (0, pg_core_1.real)('vbat_voltage'),
    vbat_pct: (0, pg_core_1.integer)('vbat_pct'),
    last_prediction_temperature: (0, pg_core_1.real)('last_prediction_temperature'),
    last_prediction_humidity: (0, pg_core_1.real)('last_prediction_humidity'),
    last_prediction_co2: (0, pg_core_1.real)('last_prediction_co2'),
    actuator_fan_on_reason: (0, pg_core_1.text)('actuator_fan_on_reason'),
    actuator_ac_on_reason: (0, pg_core_1.text)('actuator_ac_on_reason'),
    actuator_purifier_on_reason: (0, pg_core_1.text)('actuator_purifier_on_reason'),
    actuator_dehumidifier_on_reason: (0, pg_core_1.text)('actuator_dehumidifier_on_reason'),
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updated_at: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull()
}, (table) => [
    (0, pg_core_1.index)('idx_devices_status_heartbeat').on(table.status, table.last_heartbeat)
]);
exports.profiles = (0, pg_core_1.pgTable)('profiles', {
    id: (0, pg_core_1.uuid)('id').primaryKey(),
    username: (0, pg_core_1.text)('username').notNull().unique(),
    security_timestamp: (0, pg_core_1.timestamp)('security_timestamp').defaultNow().notNull(),
    telegram_user_id: (0, pg_core_1.bigint)('telegram_user_id', { mode: 'number' }).unique(),
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updated_at: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull()
});
exports.user_roles = (0, pg_core_1.pgTable)('user_roles', {
    id: (0, pg_core_1.bigserial)('id', { mode: 'number' }).primaryKey(),
    user_id: (0, pg_core_1.uuid)('user_id')
        .notNull()
        .unique()
        .references(() => exports.profiles.id),
    role: (0, pg_core_1.varchar)('role', { length: 255 }).default('user')
});
exports.incidents = (0, pg_core_1.pgTable)('incidents', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow(),
    device_id: (0, pg_core_1.uuid)('device_id')
        .notNull()
        .references(() => exports.devices.id),
    incident_type: (0, pg_core_1.text)('incident_type').notNull(),
    confidence: (0, pg_core_1.real)('confidence'),
    raw_features: (0, pg_core_1.jsonb)('raw_features'),
    status: (0, pg_core_1.text)('status')
        .$type()
        .notNull()
        .default('unacknowledged'),
    acknowledged_by: (0, pg_core_1.uuid)('acknowledged_by'),
    acknowledged_at: (0, pg_core_1.timestamp)('acknowledged_at'),
    notes: (0, pg_core_1.text)('notes')
});
exports.user_notification_preferences = (0, pg_core_1.pgTable)('user_notification_preferences', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    user_id: (0, pg_core_1.uuid)('user_id')
        .notNull()
        .references(() => exports.profiles.id),
    system_type: (0, pg_core_1.text)('system_type').notNull(),
    is_enabled: (0, pg_core_1.boolean)('is_enabled').notNull().default(true),
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updated_at: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull()
});
exports.push_subscriptions = (0, pg_core_1.pgTable)('push_subscriptions', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    user_id: (0, pg_core_1.uuid)('user_id')
        .notNull()
        .references(() => exports.profiles.id),
    endpoint: (0, pg_core_1.text)('endpoint').notNull().unique(),
    p256dh: (0, pg_core_1.text)('p256dh').notNull(),
    auth: (0, pg_core_1.text)('auth').notNull(),
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updated_at: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull()
});
exports.telegram_subscribers = (0, pg_core_1.pgTable)('telegram_subscribers', {
    user_id: (0, pg_core_1.bigint)('user_id', { mode: 'number' }).primaryKey(),
    username: (0, pg_core_1.text)('username'),
    first_name: (0, pg_core_1.text)('first_name'),
    status: (0, pg_core_1.text)('status')
        .$type()
        .notNull()
        .default('active'),
    joined_at: (0, pg_core_1.timestamp)('joined_at').defaultNow().notNull(),
    left_at: (0, pg_core_1.timestamp)('left_at'),
    kicked_at: (0, pg_core_1.timestamp)('kicked_at'),
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updated_at: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull()
});
// ─── Feature Log Tables ───────────────────────────────────
exports.lingkungan_logs = (0, pg_core_1.pgTable)('lingkungan_logs', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    device_id: (0, pg_core_1.uuid)('device_id')
        .notNull()
        .references(() => exports.devices.id),
    timestamp: (0, pg_core_1.timestamp)('timestamp').defaultNow(),
    temperature: (0, pg_core_1.real)('temperature').notNull(),
    humidity: (0, pg_core_1.real)('humidity').notNull(),
    co2: (0, pg_core_1.real)('co2').notNull(),
    status: (0, pg_core_1.text)('status')
        .$type()
        .notNull()
        .default('unacknowledged'),
    acknowledged_by: (0, pg_core_1.uuid)('acknowledged_by'),
    acknowledged_at: (0, pg_core_1.timestamp)('acknowledged_at'),
    notes: (0, pg_core_1.text)('notes'),
    notification_sent_at: (0, pg_core_1.timestamp)('notification_sent_at')
}, (table) => [
    (0, pg_core_1.index)('idx_lingkungan_logs_device_ts').on(table.device_id, table.timestamp)
]);
exports.prediction_results = (0, pg_core_1.pgTable)('prediction_results', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    device_id: (0, pg_core_1.uuid)('device_id')
        .notNull()
        .references(() => exports.devices.id),
    timestamp: (0, pg_core_1.timestamp)('timestamp').defaultNow(),
    predicted_temperature: (0, pg_core_1.real)('predicted_temperature').notNull(),
    predicted_humidity: (0, pg_core_1.real)('predicted_humidity').notNull(),
    predicted_co2: (0, pg_core_1.real)('predicted_co2').notNull(),
    prediction_horizon_min: (0, pg_core_1.integer)('prediction_horizon_min')
        .notNull()
        .default(15),
    fan_triggered: (0, pg_core_1.boolean)('fan_triggered').notNull().default(false),
    dehumidifier_triggered: (0, pg_core_1.boolean)('dehumidifier_triggered')
        .notNull()
        .default(false),
    alert_sent: (0, pg_core_1.boolean)('alert_sent').notNull().default(false)
}, (table) => [
    (0, pg_core_1.index)('idx_prediction_results_device_ts').on(table.device_id, table.timestamp)
]);
exports.intrusi_logs = (0, pg_core_1.pgTable)('intrusi_logs', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    device_id: (0, pg_core_1.uuid)('device_id')
        .notNull()
        .references(() => exports.devices.id),
    timestamp: (0, pg_core_1.timestamp)('timestamp').defaultNow(),
    event_type: (0, pg_core_1.text)('event_type').notNull(),
    system_state: (0, pg_core_1.text)('system_state').notNull(),
    door_state: (0, pg_core_1.text)('door_state').notNull(),
    peak_delta_g: (0, pg_core_1.real)('peak_delta_g'),
    hit_count: (0, pg_core_1.integer)('hit_count'),
    payload: (0, pg_core_1.jsonb)('payload'),
    status: (0, pg_core_1.text)('status')
        .$type()
        .notNull()
        .default('unacknowledged'),
    acknowledged_by: (0, pg_core_1.uuid)('acknowledged_by'),
    acknowledged_at: (0, pg_core_1.timestamp)('acknowledged_at'),
    notes: (0, pg_core_1.text)('notes'),
    notification_sent_at: (0, pg_core_1.timestamp)('notification_sent_at')
}, (table) => [
    (0, pg_core_1.index)('idx_intrusi_logs_device_ts').on(table.device_id, table.timestamp),
    (0, pg_core_1.index)('idx_intrusi_logs_device_event_ts').on(table.device_id, table.event_type, table.timestamp)
]);
exports.keamanan_logs = (0, pg_core_1.pgTable)('keamanan_logs', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    device_id: (0, pg_core_1.uuid)('device_id')
        .notNull()
        .references(() => exports.devices.id),
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow(),
    image_url: (0, pg_core_1.text)('image_url').notNull(),
    detected: (0, pg_core_1.boolean)('detected').notNull().default(false),
    box: (0, pg_core_1.jsonb)('box'),
    confidence: (0, pg_core_1.real)('confidence'),
    attributes: (0, pg_core_1.jsonb)('attributes'),
    status: (0, pg_core_1.text)('status')
        .$type()
        .notNull()
        .default('unacknowledged'),
    acknowledged_by: (0, pg_core_1.uuid)('acknowledged_by'),
    acknowledged_at: (0, pg_core_1.timestamp)('acknowledged_at'),
    notes: (0, pg_core_1.text)('notes'),
    notification_sent_at: (0, pg_core_1.timestamp)('notification_sent_at')
}, (table) => [
    (0, pg_core_1.index)('idx_keamanan_logs_device_created').on(table.device_id, table.created_at),
    (0, pg_core_1.index)('idx_keamanan_logs_detected_status').on(table.detected, table.status, table.notification_sent_at)
]);
// ─── Relations ────────────────────────────────────────────
exports.warehousesRelations = (0, drizzle_orm_1.relations)(exports.warehouses, ({ many }) => ({
    areas: many(exports.areas)
}));
exports.areasRelations = (0, drizzle_orm_1.relations)(exports.areas, ({ one, many }) => ({
    warehouse: one(exports.warehouses, {
        fields: [exports.areas.warehouse_id],
        references: [exports.warehouses.id]
    }),
    devices: many(exports.devices)
}));
exports.devicesRelations = (0, drizzle_orm_1.relations)(exports.devices, ({ one, many }) => ({
    area: one(exports.areas, {
        fields: [exports.devices.area_id],
        references: [exports.areas.id]
    }),
    incidents: many(exports.incidents),
    keamanan_logs: many(exports.keamanan_logs),
    intrusi_logs: many(exports.intrusi_logs),
    lingkungan_logs: many(exports.lingkungan_logs),
    prediction_results: many(exports.prediction_results)
}));
exports.profilesRelations = (0, drizzle_orm_1.relations)(exports.profiles, ({ one, many }) => ({
    user_role: one(exports.user_roles, {
        fields: [exports.profiles.id],
        references: [exports.user_roles.user_id]
    }),
    notification_preferences: many(exports.user_notification_preferences),
    push_subscriptions: many(exports.push_subscriptions)
}));
exports.userRolesRelations = (0, drizzle_orm_1.relations)(exports.user_roles, ({ one }) => ({
    profile: one(exports.profiles, {
        fields: [exports.user_roles.user_id],
        references: [exports.profiles.id]
    })
}));
exports.incidentsRelations = (0, drizzle_orm_1.relations)(exports.incidents, ({ one }) => ({
    device: one(exports.devices, {
        fields: [exports.incidents.device_id],
        references: [exports.devices.id]
    })
}));
exports.userNotificationPreferencesRelations = (0, drizzle_orm_1.relations)(exports.user_notification_preferences, ({ one }) => ({
    profile: one(exports.profiles, {
        fields: [exports.user_notification_preferences.user_id],
        references: [exports.profiles.id]
    })
}));
exports.pushSubscriptionsRelations = (0, drizzle_orm_1.relations)(exports.push_subscriptions, ({ one }) => ({
    profile: one(exports.profiles, {
        fields: [exports.push_subscriptions.user_id],
        references: [exports.profiles.id]
    })
}));
exports.lingkunganLogsRelations = (0, drizzle_orm_1.relations)(exports.lingkungan_logs, ({ one }) => ({
    device: one(exports.devices, {
        fields: [exports.lingkungan_logs.device_id],
        references: [exports.devices.id]
    })
}));
exports.predictionResultsRelations = (0, drizzle_orm_1.relations)(exports.prediction_results, ({ one }) => ({
    device: one(exports.devices, {
        fields: [exports.prediction_results.device_id],
        references: [exports.devices.id]
    })
}));
exports.intrusiLogsRelations = (0, drizzle_orm_1.relations)(exports.intrusi_logs, ({ one }) => ({
    device: one(exports.devices, {
        fields: [exports.intrusi_logs.device_id],
        references: [exports.devices.id]
    })
}));
exports.keamananLogsRelations = (0, drizzle_orm_1.relations)(exports.keamanan_logs, ({ one }) => ({
    device: one(exports.devices, {
        fields: [exports.keamanan_logs.device_id],
        references: [exports.devices.id]
    })
}));
