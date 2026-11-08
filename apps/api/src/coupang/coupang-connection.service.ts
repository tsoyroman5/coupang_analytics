// apps/api/src/coupang/coupang-connection.service.ts
import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { DRIZZLE, Db } from "../db/db.module";
import { coupangConnections } from "../db/schema";
import { CredentialsCryptoService } from "../credentials/credentials-crypto.service";
import {
  CoupangApiError,
  CoupangClient,
  CoupangCredentials,
} from "./coupang.client";

/** Decrypted credentials plus the identifiers loaders need. */
export interface ConnectionCredentials extends CoupangCredentials {
  connectionId: string;
  tenantId: string;
}

/** Non-secret view of a connection. Safe to log and to return to the UI. */
export interface ConnectionSummary {
  id: string;
  tenantId: string;
  vendorId: string;
}

const SELLER_PRODUCTS =
  "/v2/providers/seller_api/apis/api/v1/marketplace/seller-products";

@Injectable()
export class CoupangConnectionService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly crypto: CredentialsCryptoService,
    private readonly client: CoupangClient,
  ) {}

  /**
   * Loads and decrypts the credentials of one connection.
   * @param connectionId - `app.coupang_connections.id`
   * @throws Error if the connection doesn't exist or can't be decrypted
   */
  async getCredentials(connectionId: string): Promise<ConnectionCredentials> {
    const [row] = await this.db
      .select()
      .from(coupangConnections)
      .where(eq(coupangConnections.id, connectionId))
      .limit(1);
    if (!row) throw new Error(`Coupang connection ${connectionId} not found`);

    const { accessKey, secretKey } = this.crypto.open<{
      accessKey: string;
      secretKey: string;
    }>({
      ciphertext: row.credentialsEnc,
      iv: row.iv,
      authTag: row.authTag,
      keyVersion: row.keyVersion,
    });
    return {
      connectionId: row.id,
      tenantId: row.tenantId,
      vendorId: row.vendorId,
      accessKey,
      secretKey,
    };
  }

  /**
   * Lists connections with status `active`.
   * @param tenantId - optional filter; omit to list across all tenants (scheduler use)
   */
  async listActive(tenantId?: string): Promise<ConnectionSummary[]> {
    return this.db
      .select({
        id: coupangConnections.id,
        tenantId: coupangConnections.tenantId,
        vendorId: coupangConnections.vendorId,
      })
      .from(coupangConnections)
      .where(
        and(
          eq(coupangConnections.status, "active"),
          tenantId ? eq(coupangConnections.tenantId, tenantId) : undefined,
        ),
      );
  }

  /**
   * Verifies a connection with a cheap read-only call (seller products, 1 item)
   * and updates its status.
   *
   * @returns `'active'` if Coupang accepted the credentials; `'invalid'` on 401/403
   *          (wrong keys, or an IP whitelist change that hasn't applied yet, ~30 min)
   * @throws CoupangApiError or a network error for anything else. An outage is not bad
   *         credentials, so the status is left unchanged in that case.
   */
  async verify(connectionId: string): Promise<"active" | "invalid"> {
    const creds = await this.getCredentials(connectionId);
    try {
      await this.client.get(creds, SELLER_PRODUCTS, {
        vendorId: creds.vendorId,
        maxPerPage: 1,
      });
      await this.setStatus(connectionId, "active", new Date());
      return "active";
    } catch (err) {
      if (
        err instanceof CoupangApiError &&
        (err.status === 401 || err.status === 403)
      ) {
        await this.setStatus(connectionId, "invalid");
        return "invalid";
      }
      throw err;
    }
  }

  private async setStatus(
    id: string,
    status: "active" | "invalid",
    verifiedAt?: Date,
  ): Promise<void> {
    await this.db
      .update(coupangConnections)
      .set({
        status,
        updatedAt: new Date(),
        ...(verifiedAt ? { lastVerifiedAt: verifiedAt } : {}),
      })
      .where(eq(coupangConnections.id, id));
  }
}
