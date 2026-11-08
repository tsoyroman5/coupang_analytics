import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { DRIZZLE, Db } from '../../db/db.module';
import { coupangOrders, ingestionRuns } from '../../db/schema';
import { DateWindow, isIsoDate, splitWindow } from '../../common/kst';
import { CoupangClient } from '../coupang.client';
import { ConnectionCredentials, CoupangConnectionService } from '../coupang-connection.service';
import { COUPANG_SOURCES, coupangDate } from '../coupang-sources';

/** Every PO status Coupang accepts. The API requires exactly one per call. */
export const ORDER_STATUSES = ['ACCEPT', 'INSTRUCT', 'DEPARTURE', 'DELIVERING', 'FINAL_DELIVERY', 'NONE_TRACKING'] as const;

/**
 * Top-level shipment-box fields that are kept. Anything not listed is dropped, including
 * `orderer`, `receiver`, `overseaShippingInfoDto`, `parcelPrintMessage` and `invoiceNumber`
 * (a tracking number can be used to look up the delivery address).
 */
const ALLOWED_BOX_KEYS = [
  'shipmentBoxId', 'orderId', 'orderedAt', 'paidAt', 'status', 'shippingPrice', 'remotePrice', 'remoteArea',
  'splitShipping', 'orderItems', 'deliveryCompanyName', 'inTrasitDateTime', 'deliveredDate', 'refer', 'shipmentType',
] as const;

/** Order-item fields that may contain buyer free text (custom option input). */
const PII_ITEM_KEYS = new Set(['etcInfoHeader', 'etcInfoValue', 'etcInfoValues']);

const SOURCE = COUPANG_SOURCES.orderSheets;

/** One shipment box as returned by the PO list endpoint (only the fields the loader reads are typed). */
export type OrderSheet = Record<string, unknown> & {
  shipmentBoxId: string | number;
  orderId: string | number;
  orderedAt: string;
  status: string;
  orderItems?: Record<string, unknown>[];
};

interface OrderSheetPage {
  code: number;
  message: string;
  data: OrderSheet[] | null;
  nextToken: string | null;
}

/** Outcome of a `sync` call. */
export interface OrdersSyncResult {
  /** Number of API windows (≤31 days each) that were loaded. */
  windows: number;
  /** Shipment boxes written across all windows. Re-loaded boxes count again. */
  rows: number;
}

/**
 * Whitelist-based PII removal for one shipment box.
 *
 * Whitelist on purpose: if Coupang adds a new personal field, it's dropped by default
 * instead of leaking into the database.
 */
export function stripOrderPii(sheet: OrderSheet): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of ALLOWED_BOX_KEYS) {
    if (key in sheet) out[key] = sheet[key];
  }
  out['orderItems'] = (sheet.orderItems ?? []).map((item) =>
    Object.fromEntries(Object.entries(item).filter(([key]) => !PII_ITEM_KEYS.has(key))),
  );
  return out;
}

/**
 * Loads Coupang order sheets (PO list, paging by day) into `raw.coupang_orders`.
 *
 * - Splits long ranges into ≤31-day windows (API limit); one `ingestion_runs` row per window.
 * - Queries all six statuses, because the API requires one per call.
 * - Upserts by (tenant, shipmentBoxId): re-running a window is safe, and an order that moved
 *   to another status keeps only its latest state.
 * - Return-completed orders are not in this list; they come from the return-requests loader.
 */
@Injectable()
export class CoupangOrdersLoader {
  private readonly logger = new Logger(CoupangOrdersLoader.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly connections: CoupangConnectionService,
    private readonly client: CoupangClient,
  ) {}

  /**
   * Loads all orders created between `from` and `to` (KST, inclusive).
   * Stops at the first failed window; already loaded windows stay, and re-running is safe.
   *
   * @param connectionId - connection to load for
   * @param from - first day, `yyyy-mm-dd` (KST)
   * @param to - last day, `yyyy-mm-dd` (KST); any length, split automatically
   */
  async sync(connectionId: string, from: string, to: string): Promise<OrdersSyncResult> {
    if (!isIsoDate(from) || !isIsoDate(to)) throw new Error(`Invalid window ${from}..${to}, expected yyyy-mm-dd`);

    const creds = await this.connections.getCredentials(connectionId);
    const windows = splitWindow(from, to, SOURCE.maxWindowDays);

    let rows = 0;
    for (const window of windows) {
      rows += await this.syncWindow(creds, window);
    }
    return { windows: windows.length, rows };
  }

  /** Loads one ≤31-day window for every status and records it as one ingestion run. */
  private async syncWindow(creds: ConnectionCredentials, window: DateWindow): Promise<number> {
    const [run] = await this.db
      .insert(ingestionRuns)
      .values({
        tenantId: creds.tenantId,
        connectionId: creds.connectionId,
        source: SOURCE.name,
        windowFrom: window.from,
        windowTo: window.to,
      })
      .returning({ id: ingestionRuns.id });

    let total = 0;
    try {
      for (const status of ORDER_STATUSES) {
        let nextToken: string | undefined;
        do {
          const page = await this.client.get<OrderSheetPage>(
            creds,
            `/v2/providers/openapi/apis/api/v5/vendors/${creds.vendorId}/ordersheets`,
            {
              createdAtFrom: coupangDate.orderSheet(window.from),
              createdAtTo: coupangDate.orderSheet(window.to),
              status,
              maxPerPage: 50,
              nextToken,
            },
            { timeoutMs: SOURCE.timeoutMs },
          );
          total += await this.upsert(creds.tenantId, run.id, page.data ?? []);
          nextToken = page.nextToken || undefined; // last page returns null or ""
        } while (nextToken);
      }

      await this.finishRun(run.id, 'succeeded', total);
      this.logger.log(`${SOURCE.name} ${creds.vendorId} ${window.from}..${window.to}: ${total} boxes`);
      return total;
    } catch (err) {
      await this.finishRun(run.id, 'failed', total, (err as Error).message);
      throw err;
    }
  }

  /**
   * Upserts one page of shipment boxes.
   * Deduplicates within the batch: Postgres can't update the same row twice in one statement.
   * @returns number of rows written
   */
  private async upsert(tenantId: string, runId: string, sheets: OrderSheet[]): Promise<number> {
    if (sheets.length === 0) return 0;

    const byBox = new Map(sheets.map((sheet) => [String(sheet.shipmentBoxId), sheet]));
    const rows = [...byBox.values()].map((sheet) => {
      const orderedAt = new Date(sheet.orderedAt);
      if (Number.isNaN(orderedAt.getTime())) {
        throw new Error(`Invalid orderedAt "${sheet.orderedAt}" for shipment box ${sheet.shipmentBoxId}`);
      }
      return {
        tenantId,
        runId,
        shipmentBoxId: String(sheet.shipmentBoxId),
        orderId: String(sheet.orderId),
        status: sheet.status,
        orderedAt,
        payload: stripOrderPii(sheet),
      };
    });

    await this.db
      .insert(coupangOrders)
      .values(rows)
      .onConflictDoUpdate({
        target: [coupangOrders.tenantId, coupangOrders.shipmentBoxId],
        set: {
          orderId: sql`excluded.order_id`,
          status: sql`excluded.status`,
          payload: sql`excluded.payload`,
          runId: sql`excluded.run_id`,
          loadedAt: sql`now()`,
        },
      });
    return rows.length;
  }

  private async finishRun(id: string, status: 'succeeded' | 'failed', rowsLoaded: number, error?: string): Promise<void> {
    await this.db
      .update(ingestionRuns)
      .set({ status, rowsLoaded, error: error ?? null, finishedAt: new Date() })
      .where(eq(ingestionRuns.id, id));
  }
}
