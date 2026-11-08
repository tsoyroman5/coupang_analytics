import {
  pgSchema,
  uuid,
  text,
  jsonb,
  timestamp,
  date,
  integer,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";
import { tenants, coupangConnections } from "./app";

/**
 * Landing zone for API payloads: PII-stripped, otherwise unmodified.
 * Written by NestJS loaders (Drizzle owns this schema); read by dbt staging models.
 */
export const raw = pgSchema("raw");

export const runStatus = raw.enum("ingestion_run_status", [
  "running",
  "succeeded",
  "failed",
]);

/** One row per loader execution: the audit trail for every sync. */
export const ingestionRuns = raw.table(
  "ingestion_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => coupangConnections.id, { onDelete: "cascade" }),
    /** Logical source, e.g. `coupang.ordersheets`, `coupang.revenue_history`. */
    source: text("source").notNull(),
    windowFrom: date("window_from").notNull(),
    windowTo: date("window_to").notNull(),
    status: runStatus("status").notNull().default("running"),
    rowsLoaded: integer("rows_loaded").notNull().default(0),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    index("ingestion_runs_tenant_source_idx").on(
      t.tenantId,
      t.source,
      t.startedAt,
    ),
  ],
);

/**
 * Latest known state of each Coupang shipment box.
 * An order can be split into several boxes, so the key is the box, not the order.
 */
export const coupangOrders = raw.table(
  "coupang_orders",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Text, not number: Coupang IDs can exceed Number.MAX_SAFE_INTEGER. */
    shipmentBoxId: text("shipment_box_id").notNull(),
    orderId: text("order_id").notNull(),
    status: text("status").notNull(),
    orderedAt: timestamp("ordered_at", { withTimezone: true }).notNull(),
    /** PII-stripped API object, see `stripOrderPii`. */
    payload: jsonb("payload").notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    loadedAt: timestamp("loaded_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    runId: uuid("run_id").references(() => ingestionRuns.id),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.shipmentBoxId] }),
    index("coupang_orders_tenant_ordered_idx").on(t.tenantId, t.orderedAt),
  ],
);
