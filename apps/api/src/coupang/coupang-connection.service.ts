// apps/api/src/coupang/coupang-connection.service.ts
import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DRIZZLE, Db } from "../db/db.module";
import { coupangConnections } from "../db/schema";
import { CredentialsCryptoService } from "../credentials/credentials-crypto.service";
import {
  CoupangApiError,
  CoupangClient,
  CoupangCredentials,
} from "./coupang.client";

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
   * Loads and decrypts the credentials of a single connection.
   * @param connectionId - `app.coupang_connections.id`
   * @throws Error if the connection doesn't exist
   */
  async getCredentials(
    connectionId: string,
  ): Promise<CoupangCredentials & { connectionId: string }> {
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
      vendorId: row.vendorId,
      accessKey,
      secretKey,
    };
  }

  /**
   * Verifies a connection with a cheap read-only call (seller products, 1 item)
   * and updates its status.
   *
   * @returns `'active'` if the API accepted the credentials, `'invalid'` on 401/403
   * @throws CoupangApiError or a network error for anything else: an outage isn't bad credentials,
   *         so the status is left unchanged
   */
  async verify(connectionId: string): Promise<"active" | "invalid"> {
    const creds = await this.getCredentials(connectionId);
    try {
      await this.client.get(creds, SELLER_PRODUCTS, {
        vendorId: creds.vendorId,
        maxPerPage: 1,
      });
      await this.db
        .update(coupangConnections)
        .set({
          status: "active",
          lastVerifiedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(coupangConnections.id, creds.connectionId));
      return "active";
    } catch (e) {
      if (
        e instanceof CoupangApiError &&
        (e.status === 401 || e.status === 403)
      ) {
        await this.db
          .update(coupangConnections)
          .set({ status: "invalid", updatedAt: new Date() })
          .where(eq(coupangConnections.id, creds.connectionId));
        return "invalid";
      }
      throw e; // network or 5xx: an outage isn't bad credentials
    }
  }
}
