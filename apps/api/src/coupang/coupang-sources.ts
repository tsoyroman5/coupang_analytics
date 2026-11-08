/**
 * Per-endpoint limits of the Coupang Open API (KR market), taken from the official reference.
 *
 * Every list endpoint has its own maximum window and date format. Keeping them in one table
 * stops loaders from silently assuming "31 days, yyyy-mm-dd" everywhere.
 */

/** Static description of one Coupang data source. */
export interface CoupangSourceSpec {
  /** Logical name, stored in `raw.ingestion_runs.source`. */
  readonly name: string;
  /** Largest window (inclusive days) a single request may cover. */
  readonly maxWindowDays: number;
  /** If true, the window may not end later than yesterday (KST). */
  readonly endNoLaterThanYesterday: boolean;
  /** Per-attempt HTTP timeout. List endpoints are slow on large accounts. */
  readonly timeoutMs: number;
}

export const COUPANG_SOURCES = {
  /** PO list (paging by day): `GET /v2/providers/openapi/apis/api/v5/vendors/{vendorId}/ordersheets`. */
  orderSheets: {
    name: "coupang.ordersheets",
    maxWindowDays: 31,
    endNoLaterThanYesterday: false,
    timeoutMs: 60_000,
  },
  /** Sales detail (매출내역): `GET /v2/providers/openapi/apis/api/v1/revenue-history`. */
  revenueHistory: {
    name: "coupang.revenue_history",
    maxWindowDays: 31,
    endNoLaterThanYesterday: true,
    timeoutMs: 60_000,
  },
  /** Return / cancellation requests: `GET /v2/providers/openapi/apis/api/v6/vendors/{vendorId}/returnRequests`. */
  returnRequests: {
    name: "coupang.return_requests",
    maxWindowDays: 31,
    endNoLaterThanYesterday: false,
    timeoutMs: 60_000,
  },
  /** Exchange requests: `GET /v2/providers/openapi/apis/api/v4/vendors/{vendorId}/exchangeRequests`. */
  exchangeRequests: {
    name: "coupang.exchange_requests",
    maxWindowDays: 7,
    endNoLaterThanYesterday: false,
    timeoutMs: 30_000,
  },
  /** Rocket Growth orders: `GET /v2/providers/rg_open_api/apis/api/v1/vendors/{vendorId}/rg/orders`. Rate limit 50 calls/min. */
  rgOrders: {
    name: "coupang.rg_orders",
    maxWindowDays: 30,
    endNoLaterThanYesterday: false,
    timeoutMs: 30_000,
  },
} as const satisfies Record<string, CoupangSourceSpec>;

/**
 * Date formatters, one per endpoint family. Input is always a KST `yyyy-mm-dd` string.
 * Settlement detail is queried per month (`YYYY-MM`) and doesn't use windows.
 */
export const coupangDate = {
  /** Order sheets: `2025-07-21+09:00`, sent as `2025-07-21%2B09:00` by `buildCoupangQuery`. */
  orderSheet: (date: string): string => `${date}+09:00`,
  /** Revenue history and return requests: plain `yyyy-mm-dd`. */
  plain: (date: string): string => date,
  /** Exchange requests, window start: `yyyy-MM-ddT00:00:00`. */
  exchangeFrom: (date: string): string => `${date}T00:00:00`,
  /** Exchange requests, window end: `yyyy-MM-ddT23:59:59`. */
  exchangeTo: (date: string): string => `${date}T23:59:59`,
  /** Rocket Growth orders: `YYYYMMDD`. */
  rocketGrowth: (date: string): string => date.replace(/-/g, ""),
} as const;
