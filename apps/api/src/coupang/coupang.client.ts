import { Injectable, Logger } from "@nestjs/common";
import { coupangSignedDate, signCoupang } from "./coupang-signer";
import {
  buildCoupangQuery,
  CoupangQueryParams,
  parseJsonLossless,
} from "./coupang-json";
import { Env } from "../config/env";
import { ConfigService } from "@nestjs/config";

/** The three values needed to call Coupang on behalf of one seller. */
export interface CoupangCredentials {
  vendorId: string;
  accessKey: string;
  secretKey: string;
}

/** Per-request options. */
export interface CoupangRequestOptions {
  /** Timeout for each attempt, in ms. Default 30 000. List endpoints should pass a higher value. */
  timeoutMs?: number;
}

/** A non-retryable (or retries-exhausted) error response from Coupang. */
export class CoupangApiError extends Error {
  constructor(
    /** HTTP status. A CDN block page is reported as 403. */
    readonly status: number,
    /** Raw response body, for logs. Never contains credentials. */
    readonly body: string,
  ) {
    super(`Coupang API ${status}: ${body.slice(0, 300)}`);
    this.name = "CoupangApiError";
  }
}

const BASE_URL = "https://api-gateway.coupang.com";
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 4;
const DEFAULT_TIMEOUT_MS = 30_000;
const USER_AGENT = "coupang-analytics/0.1";

/**
 * Read-only HTTP client for the Coupang Open API.
 *
 * - **GET only.** There is no write method, so no code path can modify a seller's store.
 *   Write operations are a separate, permission-gated client (see ADR 0001).
 * - Signs every attempt anew, because `signed-date` is part of the HMAC message.
 * - Retries network errors, timeouts, 429 and 5xx with exponential backoff + jitter.
 * - Detects the CDN's HTML "Access denied" page, which Coupang serves with status 200
 *   (e.g. for requests from non-Korean IPs).
 * - Parses JSON losslessly so 18-digit IDs survive.
 */
@Injectable()
export class CoupangClient {
  private readonly logger = new Logger(CoupangClient.name);
  private readonly baseUrl: string;

  constructor(cfg: ConfigService<Env, true>) {
    this.baseUrl = cfg.get("COUPANG_BASE_URL", { infer: true });
  }

  /**
   * Sends a signed GET request and returns the parsed JSON body.
   *
   * @param creds - seller credentials
   * @param path - API path starting with `/v2/...`, without query string
   * @param params - query parameters; `undefined` values are omitted
   * @param options - per-request options (timeout)
   * @throws CoupangApiError for non-retryable statuses or after the last retry
   * @throws the underlying network/timeout error if every attempt failed without a response
   */
  async get<T>(
    creds: CoupangCredentials,
    path: string,
    params: CoupangQueryParams = {},
    options: CoupangRequestOptions = {},
  ): Promise<T> {
    const query = buildCoupangQuery(params);
    const url = `${BASE_URL}${path}${query ? `?${query}` : ""}`;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    for (let attempt = 1; ; attempt++) {
      const backoffMs = 500 * 2 ** (attempt - 1) + Math.random() * 250;
      const isLastAttempt = attempt >= MAX_ATTEMPTS;

      let res: Response;
      try {
        res = await fetch(url, {
          method: "GET",
          headers: {
            Authorization: signCoupang({
              method: "GET",
              path,
              query,
              accessKey: creds.accessKey,
              secretKey: creds.secretKey,
              signedDate: coupangSignedDate(this.now()),
            }),
            "Content-Type": "application/json;charset=UTF-8",
            "User-Agent": USER_AGENT,
          },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        if (isLastAttempt) throw err;
        this.logger.warn(
          `Coupang ${path}: ${(err as Error).name}, retry ${attempt} in ${Math.round(backoffMs)}ms`,
        );
        await this.delay(backoffMs);
        continue;
      }

      const body = await res.text();

      if (res.ok && res.headers.get("content-type")?.includes("text/html")) {
        throw new CoupangApiError(
          403,
          "Blocked at CDN (HTML access-denied page). Check the egress IP region.",
        );
      }
      if (res.ok) return parseJsonLossless<T>(body);

      if (RETRYABLE_STATUSES.has(res.status) && !isLastAttempt) {
        this.logger.warn(
          `Coupang ${path}: HTTP ${res.status}, retry ${attempt} in ${Math.round(backoffMs)}ms`,
        );
        await this.delay(backoffMs);
        continue;
      }
      throw new CoupangApiError(res.status, body);
    }
  }

  /** Current time, used for `signed-date`. Overridable in tests. */
  protected now(): Date {
    return new Date();
  }

  /** Waits between retries. Overridable in tests to avoid real sleeps. */
  protected delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
