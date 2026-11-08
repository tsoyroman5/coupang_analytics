/** Query parameter values accepted by Coupang requests. `undefined` means "omit". */
export type CoupangQueryParams = Record<string, string | number | undefined>;

/**
 * `JSON.parse` that keeps integers beyond `Number.MAX_SAFE_INTEGER` as exact strings.
 *
 * Coupang IDs such as `shipmentBoxId` can be 18 digits (> 2^53) and would otherwise be
 * rounded silently, so two different shipment boxes could collapse into one row.
 * Relies on the reviver `context.source` argument (Node 21+).
 */
export function parseJsonLossless<T>(text: string): T {
  return JSON.parse(text, (_key, value, context?: { source?: string }) =>
    typeof value === "number" &&
    Number.isInteger(value) &&
    !Number.isSafeInteger(value) &&
    context?.source
      ? context.source
      : value,
  ) as T;
}

/**
 * Builds a query string exactly the way Coupang's docs show it: values are URI-encoded
 * (`+` → `%2B`), but `:` stays literal (`2025-07-21%2B09:00`).
 *
 * The HMAC signature covers this exact string, so the encoding must be deterministic and
 * identical to what is sent. `undefined` values are dropped; empty strings are kept,
 * because some endpoints require an empty first-page token (`token=`).
 *
 * @example buildCoupangQuery({ createdAtFrom: '2025-07-21+09:00', status: 'ACCEPT' })
 */
export function buildCoupangQuery(params: CoupangQueryParams): string {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined)
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value)).replace(/%3A/gi, ":")}`,
    )
    .join("&");
}
