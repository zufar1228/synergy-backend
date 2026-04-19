/**
 * @file schema.ts
 * @purpose Drizzle ORM table definitions and relations for all entities
 * @usedBy drizzle.ts, all services
 * @deps drizzle-orm/pg-core
 * @exports All table schemas + relations + insert/select types
 * @sideEffects None (schema definition only)
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  real,
  integer,
  boolean,
  jsonb,
  bigint,
  bigserial,
  varchar,
  index
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ─── Core Tables ──────────────────────────────────────────

export const warehouses = pgTable('warehouses', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  location: text('location'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

export const areas = pgTable('areas', {
  id: uuid('id').primaryKey().defaultRandom(),
  warehouse_id: uuid('warehouse_id')
    .notNull()
    .references(() => warehouses.id),
  name: text('name').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

export const devices = pgTable(
  'devices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    area_id: uuid('area_id')
      .notNull()
      .references(() => areas.id),
    name: text('name').notNull(),
    system_type: text('system_type').notNull(),
    status: text('status')
      .$type<'Online' | 'Offline'>()
      .notNull()
      .default('Offline'),
    last_heartbeat: timestamp('last_heartbeat'),
    fan_state: text('fan_state').$type<'ON' | 'OFF'>().notNull().default('OFF'),
    dehumidifier_state: text('dehumidifier_state').notNull().default('OFF'),
    control_mode: text('control_mode').notNull().default('AUTO'),
    manual_override_until: timestamp('manual_override_until'),
    last_temperature: real('last_temperature'),
    last_humidity: real('last_humidity'),
    last_co2: real('last_co2'),
    door_state: text('door_state').$type<'OPEN' | 'CLOSED'>(),
    intrusi_system_state: text('intrusi_system_state').$type<
      'ARMED' | 'DISARMED'
    >(),
    siren_state: text('siren_state').$type<'ON' | 'COOLDOWN' | 'OFF'>(),
    power_source: text('power_source').$type<'MAINS' | 'BATTERY'>(),
    vbat_voltage: real('vbat_voltage'),
    vbat_pct: integer('vbat_pct'),
    last_prediction_temperature: real('last_prediction_temperature'),
    last_prediction_humidity: real('last_prediction_humidity'),
    last_prediction_co2: real('last_prediction_co2'),
    actuator_fan_on_reason: text('actuator_fan_on_reason'),
    actuator_ac_on_reason: text('actuator_ac_on_reason'),
    actuator_purifier_on_reason: text('actuator_purifier_on_reason'),
    actuator_dehumidifier_on_reason: text('actuator_dehumidifier_on_reason'),
    created_at: timestamp('created_at').defaultNow().notNull(),
    updated_at: timestamp('updated_at').defaultNow().notNull()
  },
  (table) => [
    index('idx_devices_status_heartbeat').on(table.status, table.last_heartbeat)
  ]
);

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(),
  username: text('username').notNull().unique(),
  security_timestamp: timestamp('security_timestamp').defaultNow().notNull(),
  telegram_user_id: bigint('telegram_user_id', { mode: 'number' }).unique(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

export const user_roles = pgTable('user_roles', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  user_id: uuid('user_id')
    .notNull()
    .unique()
    .references(() => profiles.id),
  role: varchar('role', { length: 255 }).default('user')
});

export const incidents = pgTable('incidents', {
  id: uuid('id').primaryKey().defaultRandom(),
  created_at: timestamp('created_at').defaultNow(),
  device_id: uuid('device_id')
    .notNull()
    .references(() => devices.id),
  incident_type: text('incident_type').notNull(),
  confidence: real('confidence'),
  raw_features: jsonb('raw_features'),
  status: text('status')
    .$type<'unacknowledged' | 'acknowledged' | 'resolved' | 'false_alarm'>()
    .notNull()
    .default('unacknowledged'),
  acknowledged_by: uuid('acknowledged_by'),
  acknowledged_at: timestamp('acknowledged_at'),
  notes: text('notes')
});

export const user_notification_preferences = pgTable(
  'user_notification_preferences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id')
      .notNull()
      .references(() => profiles.id),
    system_type: text('system_type').notNull(),
    is_enabled: boolean('is_enabled').notNull().default(true),
    created_at: timestamp('created_at').defaultNow().notNull(),
    updated_at: timestamp('updated_at').defaultNow().notNull()
  }
);

export const push_subscriptions = pgTable('push_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id')
    .notNull()
    .references(() => profiles.id),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

export const telegram_subscribers = pgTable('telegram_subscribers', {
  user_id: bigint('user_id', { mode: 'number' }).primaryKey(),
  username: text('username'),
  first_name: text('first_name'),
  status: text('status')
    .$type<'active' | 'left' | 'kicked'>()
    .notNull()
    .default('active'),
  joined_at: timestamp('joined_at').defaultNow().notNull(),
  left_at: timestamp('left_at'),
  kicked_at: timestamp('kicked_at'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// ─── Feature Log Tables ───────────────────────────────────

export const lingkungan_logs = pgTable(
  'lingkungan_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    device_id: uuid('device_id')
      .notNull()
      .references(() => devices.id),
    timestamp: timestamp('timestamp').defaultNow(),
    temperature: real('temperature').notNull(),
    humidity: real('humidity').notNull(),
    co2: real('co2').notNull(),
    status: text('status')
      .$type<'unacknowledged' | 'acknowledged' | 'resolved' | 'false_alarm'>()
      .notNull()
      .default('unacknowledged'),
    acknowledged_by: uuid('acknowledged_by'),
    acknowledged_at: timestamp('acknowledged_at'),
    notes: text('notes'),
    notification_sent_at: timestamp('notification_sent_at')
  },
  (table) => [
    index('idx_lingkungan_logs_device_ts').on(table.device_id, table.timestamp)
  ]
);

export const prediction_results = pgTable(
  'prediction_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    device_id: uuid('device_id')
      .notNull()
      .references(() => devices.id),
    timestamp: timestamp('timestamp').defaultNow(),
    predicted_temperature: real('predicted_temperature').notNull(),
    predicted_humidity: real('predicted_humidity').notNull(),
    predicted_co2: real('predicted_co2').notNull(),
    prediction_horizon_min: integer('prediction_horizon_min')
      .notNull()
      .default(15),
    fan_triggered: boolean('fan_triggered').notNull().default(false),
    dehumidifier_triggered: boolean('dehumidifier_triggered')
      .notNull()
      .default(false),
    alert_sent: boolean('alert_sent').notNull().default(false)
  },
  (table) => [
    index('idx_prediction_results_device_ts').on(
      table.device_id,
      table.timestamp
    )
  ]
);

export const intrusi_logs = pgTable(
  'intrusi_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    device_id: uuid('device_id')
      .notNull()
      .references(() => devices.id),
    timestamp: timestamp('timestamp').defaultNow(),
    event_type: text('event_type').notNull(),
    system_state: text('system_state').notNull(),
    door_state: text('door_state').notNull(),
    peak_delta_g: real('peak_delta_g'),
    hit_count: integer('hit_count'),
    payload: jsonb('payload'),
    status: text('status')
      .$type<'unacknowledged' | 'acknowledged' | 'resolved' | 'false_alarm'>()
      .notNull()
      .default('unacknowledged'),
    acknowledged_by: uuid('acknowledged_by'),
    acknowledged_at: timestamp('acknowledged_at'),
    notes: text('notes'),
    notification_sent_at: timestamp('notification_sent_at')
  },
  (table) => [
    index('idx_intrusi_logs_device_ts').on(table.device_id, table.timestamp),
    index('idx_intrusi_logs_device_event_ts').on(
      table.device_id,
      table.event_type,
      table.timestamp
    )
  ]
);

export const keamanan_logs = pgTable(
  'keamanan_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    device_id: uuid('device_id')
      .notNull()
      .references(() => devices.id),
    created_at: timestamp('created_at').defaultNow(),
    image_url: text('image_url').notNull(),
    detected: boolean('detected').notNull().default(false),
    box: jsonb('box'),
    confidence: real('confidence'),
    attributes: jsonb('attributes'),
    status: text('status')
      .$type<'unacknowledged' | 'acknowledged' | 'resolved' | 'false_alarm'>()
      .notNull()
      .default('unacknowledged'),
    acknowledged_by: uuid('acknowledged_by'),
    acknowledged_at: timestamp('acknowledged_at'),
    notes: text('notes'),
    notification_sent_at: timestamp('notification_sent_at')
  },
  (table) => [
    index('idx_keamanan_logs_device_created').on(
      table.device_id,
      table.created_at
    ),
    index('idx_keamanan_logs_detected_status').on(
      table.detected,
      table.status,
      table.notification_sent_at
    )
  ]
);

// ─── Relations ────────────────────────────────────────────

export const warehousesRelations = relations(warehouses, ({ many }) => ({
  areas: many(areas)
}));

export const areasRelations = relations(areas, ({ one, many }) => ({
  warehouse: one(warehouses, {
    fields: [areas.warehouse_id],
    references: [warehouses.id]
  }),
  devices: many(devices)
}));

export const devicesRelations = relations(devices, ({ one, many }) => ({
  area: one(areas, {
    fields: [devices.area_id],
    references: [areas.id]
  }),
  incidents: many(incidents),
  keamanan_logs: many(keamanan_logs),
  intrusi_logs: many(intrusi_logs),
  lingkungan_logs: many(lingkungan_logs),
  prediction_results: many(prediction_results)
}));

export const profilesRelations = relations(profiles, ({ one, many }) => ({
  user_role: one(user_roles, {
    fields: [profiles.id],
    references: [user_roles.user_id]
  }),
  notification_preferences: many(user_notification_preferences),
  push_subscriptions: many(push_subscriptions)
}));

export const userRolesRelations = relations(user_roles, ({ one }) => ({
  profile: one(profiles, {
    fields: [user_roles.user_id],
    references: [profiles.id]
  })
}));

export const incidentsRelations = relations(incidents, ({ one }) => ({
  device: one(devices, {
    fields: [incidents.device_id],
    references: [devices.id]
  })
}));

export const userNotificationPreferencesRelations = relations(
  user_notification_preferences,
  ({ one }) => ({
    profile: one(profiles, {
      fields: [user_notification_preferences.user_id],
      references: [profiles.id]
    })
  })
);

export const pushSubscriptionsRelations = relations(
  push_subscriptions,
  ({ one }) => ({
    profile: one(profiles, {
      fields: [push_subscriptions.user_id],
      references: [profiles.id]
    })
  })
);

export const lingkunganLogsRelations = relations(
  lingkungan_logs,
  ({ one }) => ({
    device: one(devices, {
      fields: [lingkungan_logs.device_id],
      references: [devices.id]
    })
  })
);

export const predictionResultsRelations = relations(
  prediction_results,
  ({ one }) => ({
    device: one(devices, {
      fields: [prediction_results.device_id],
      references: [devices.id]
    })
  })
);

export const intrusiLogsRelations = relations(intrusi_logs, ({ one }) => ({
  device: one(devices, {
    fields: [intrusi_logs.device_id],
    references: [devices.id]
  })
}));

export const keamananLogsRelations = relations(keamanan_logs, ({ one }) => ({
  device: one(devices, {
    fields: [keamanan_logs.device_id],
    references: [devices.id]
  })
}));

// ─── Shared Types ─────────────────────────────────────────

export type IncidentStatus =
  | 'unacknowledged'
  | 'acknowledged'
  | 'resolved'
  | 'false_alarm';

export type IntrusiEventType =
  | 'ARMED'
  | 'DISARM'
  | 'DOOR_OPEN'
  | 'DOOR_CLOSE'
  | 'IMPACT_WARNING'
  | 'UNAUTHORIZED_OPEN'
  | 'FORCED_ENTRY_ALARM'
  | 'SIREN_SILENCED'
  | 'HEARTBEAT';

export type DoorState = 'OPEN' | 'CLOSED';
export type SystemState = 'ARMED' | 'DISARMED';
export type AcknowledgeStatus = IncidentStatus;

// Inferred types
export type WarehouseSelect = typeof warehouses.$inferSelect;
export type WarehouseInsert = typeof warehouses.$inferInsert;
export type DeviceSelect = typeof devices.$inferSelect;
export type DeviceInsert = typeof devices.$inferInsert;
export type AreaSelect = typeof areas.$inferSelect;
