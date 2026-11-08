import { Injectable, Logger } from "@nestjs/common";
import { coupangSignedDate, signCoupang } from "./coupang-signer";

export interface CoupangCredentials {
  vendorId: string;
  accessKey: string;
  secretKey: string;
}

export class CoupangApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`Coupang API ${status}: ${body.slice(0, 300)}`);
  }
}

const BASE_URL = "https://api-gateway.coupang.com";
const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 4;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

@Injectable()
export class CoupangClient {
  private readonly logger = new Logger(CoupangClient.name);

  /** GET only — this client can't write to a seller's store. */
  async get<T>(
    creds: CoupangCredentials,
    path: string,
    params: Record<string, string | number> = {},
  ): Promise<T> {
    const query = new URLSearchParams(
      Object.entries(params).map(([k, v]) => [k, String(v)]),
    ).toString();
    const url = `${BASE_URL}${path}${query ? `?${query}` : ""}`;

    for (let attempt = 1; ; attempt++) {
      const backoff = 500 * 2 ** (attempt - 1) + Math.random() * 250;
      let res: Response;
      try {
        res = await fetch(url, {
          headers: {
            // Re-sign on every attempt: signed-date must be fresh
            Authorization: signCoupang({
              method: "GET",
              path,
              query,
              signedDate: coupangSignedDate(),
              ...creds,
            }),
            "Content-Type": "application/json;charset=UTF-8",
            "User-Agent": "coupang-analytics/0.1",
          },
          signal: AbortSignal.timeout(15_000),
        });
      } catch (err) {
        if (attempt < MAX_ATTEMPTS) {
          await sleep(backoff);
          continue;
        }
        throw err;
      }

      const body = await res.text();
      if (res.ok && res.headers.get("content-type")?.includes("text/html")) {
        throw new CoupangApiError(
          403,
          "Blocked at CDN (HTML access-denied page). Check the egress IP region.",
        );
      }
      if (res.ok) return JSON.parse(body) as T;
      if (RETRYABLE.has(res.status) && attempt < MAX_ATTEMPTS) {
        this.logger.warn(
          `Coupang ${res.status} on ${path}, retry ${attempt} in ${Math.round(backoff)}ms`,
        );
        await sleep(backoff);
        continue;
      }
      throw new CoupangApiError(res.status, body);
    }
  }
}
