CREATE TABLE "areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"area_id" uuid NOT NULL,
	"name" text NOT NULL,
	"system_type" text NOT NULL,
	"status" text DEFAULT 'Offline' NOT NULL,
	"last_heartbeat" timestamp,
	"fan_state" text DEFAULT 'OFF' NOT NULL,
	"dehumidifier_state" text DEFAULT 'OFF' NOT NULL,
	"control_mode" text DEFAULT 'AUTO' NOT NULL,
	"manual_override_until" timestamp,
	"last_temperature" real,
	"last_humidity" real,
	"last_co2" real,
	"door_state" text,
	"intrusi_system_state" text,
	"siren_state" text,
	"power_source" text,
	"vbat_voltage" real,
	"vbat_pct" integer,
	"last_prediction_temperature" real,
	"last_prediction_humidity" real,
	"last_prediction_co2" real,
	"actuator_fan_on_reason" text,
	"actuator_ac_on_reason" text,
	"actuator_purifier_on_reason" text,
	"actuator_dehumidifier_on_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"device_id" uuid NOT NULL,
	"incident_type" text NOT NULL,
	"confidence" real,
	"raw_features" jsonb,
	"status" text DEFAULT 'unacknowledged' NOT NULL,
	"acknowledged_by" uuid,
	"acknowledged_at" timestamp,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "intrusi_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"timestamp" timestamp DEFAULT now(),
	"event_type" text NOT NULL,
	"system_state" text NOT NULL,
	"door_state" text NOT NULL,
	"peak_delta_g" real,
	"hit_count" integer,
	"payload" jsonb,
	"status" text DEFAULT 'unacknowledged' NOT NULL,
	"acknowledged_by" uuid,
	"acknowledged_at" timestamp,
	"notes" text,
	"notification_sent_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "keamanan_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"image_url" text NOT NULL,
	"detected" boolean DEFAULT false NOT NULL,
	"box" jsonb,
	"confidence" real,
	"attributes" jsonb,
	"status" text DEFAULT 'unacknowledged' NOT NULL,
	"acknowledged_by" uuid,
	"acknowledged_at" timestamp,
	"notes" text,
	"notification_sent_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "lingkungan_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"timestamp" timestamp DEFAULT now(),
	"temperature" real NOT NULL,
	"humidity" real NOT NULL,
	"co2" real NOT NULL,
	"status" text DEFAULT 'unacknowledged' NOT NULL,
	"acknowledged_by" uuid,
	"acknowledged_at" timestamp,
	"notes" text,
	"notification_sent_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "prediction_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"timestamp" timestamp DEFAULT now(),
	"predicted_temperature" real NOT NULL,
	"predicted_humidity" real NOT NULL,
	"predicted_co2" real NOT NULL,
	"prediction_horizon_min" integer DEFAULT 15 NOT NULL,
	"fan_triggered" boolean DEFAULT false NOT NULL,
	"dehumidifier_triggered" boolean DEFAULT false NOT NULL,
	"alert_sent" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"security_timestamp" timestamp DEFAULT now() NOT NULL,
	"telegram_user_id" bigint,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_username_unique" UNIQUE("username"),
	CONSTRAINT "profiles_telegram_user_id_unique" UNIQUE("telegram_user_id")
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "telegram_subscribers" (
	"user_id" bigint PRIMARY KEY NOT NULL,
	"username" text,
	"first_name" text,
	"status" text DEFAULT 'active' NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"left_at" timestamp,
	"kicked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"system_type" text NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"role" varchar(255) DEFAULT 'user',
	CONSTRAINT "user_roles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "warehouses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"location" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "areas" ADD CONSTRAINT "areas_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intrusi_logs" ADD CONSTRAINT "intrusi_logs_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keamanan_logs" ADD CONSTRAINT "keamanan_logs_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lingkungan_logs" ADD CONSTRAINT "lingkungan_logs_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_results" ADD CONSTRAINT "prediction_results_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_notification_preferences" ADD CONSTRAINT "user_notification_preferences_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_devices_status_heartbeat" ON "devices" USING btree ("status","last_heartbeat");--> statement-breakpoint
CREATE INDEX "idx_intrusi_logs_device_ts" ON "intrusi_logs" USING btree ("device_id","timestamp");--> statement-breakpoint
CREATE INDEX "idx_intrusi_logs_device_event_ts" ON "intrusi_logs" USING btree ("device_id","event_type","timestamp");--> statement-breakpoint
CREATE INDEX "idx_keamanan_logs_device_created" ON "keamanan_logs" USING btree ("device_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_keamanan_logs_detected_status" ON "keamanan_logs" USING btree ("detected","status","notification_sent_at");--> statement-breakpoint
CREATE INDEX "idx_lingkungan_logs_device_ts" ON "lingkungan_logs" USING btree ("device_id","timestamp");--> statement-breakpoint
CREATE INDEX "idx_prediction_results_device_ts" ON "prediction_results" USING btree ("device_id","timestamp");