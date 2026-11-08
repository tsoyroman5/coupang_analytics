CREATE SCHEMA "raw";
--> statement-breakpoint
CREATE TYPE "raw"."ingestion_run_status" AS ENUM('running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TABLE "raw"."coupang_orders" (
	"tenant_id" uuid NOT NULL,
	"shipment_box_id" text NOT NULL,
	"order_id" text NOT NULL,
	"status" text NOT NULL,
	"ordered_at" timestamp with time zone NOT NULL,
	"payload" jsonb NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"loaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"run_id" uuid,
	CONSTRAINT "coupang_orders_tenant_id_shipment_box_id_pk" PRIMARY KEY("tenant_id","shipment_box_id")
);
--> statement-breakpoint
CREATE TABLE "raw"."ingestion_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"source" text NOT NULL,
	"window_from" date NOT NULL,
	"window_to" date NOT NULL,
	"status" "raw"."ingestion_run_status" DEFAULT 'running' NOT NULL,
	"rows_loaded" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "raw"."coupang_orders" ADD CONSTRAINT "coupang_orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw"."coupang_orders" ADD CONSTRAINT "coupang_orders_run_id_ingestion_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "raw"."ingestion_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw"."ingestion_runs" ADD CONSTRAINT "ingestion_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw"."ingestion_runs" ADD CONSTRAINT "ingestion_runs_connection_id_coupang_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "app"."coupang_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coupang_orders_tenant_ordered_idx" ON "raw"."coupang_orders" USING btree ("tenant_id","ordered_at");--> statement-breakpoint
CREATE INDEX "ingestion_runs_tenant_source_idx" ON "raw"."ingestion_runs" USING btree ("tenant_id","source","started_at");