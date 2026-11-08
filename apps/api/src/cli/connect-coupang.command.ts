import { Inject } from "@nestjs/common";
import { Command, CommandRunner } from "nest-commander";
import { input, password } from "@inquirer/prompts";
import { asc } from "drizzle-orm";
import { DRIZZLE, Db } from "../db/db.module";
import { tenants, coupangConnections } from "../db/schema";
import { CredentialsCryptoService } from "../credentials/credentials-crypto.service";
import { CoupangConnectionService } from "../coupang/coupang-connection.service";

/** Prompt validator: rejects empty or whitespace-only input. */
const required = (v: string) => v.trim().length > 0 || "Required";

/**
 * CLI command that stores Coupang Open API credentials for a tenant and verifies them.
 *
 * Dev/single-user flow:
 * - Reuses the oldest tenant, or creates one if the database has none.
 * - Credentials are sealed with AES-256-GCM before they touch the database.
 * - Re-running with the same vendor ID replaces the stored keys (e.g. after a 180-day re-issue).
 *
 * @example
 * npx nx run api:connect-coupang
 */
@Command({
  name: "connect-coupang",
  description: "Store encrypted Coupang Open API credentials and verify them",
})
export class ConnectCoupangCommand extends CommandRunner {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly crypto: CredentialsCryptoService,
    private readonly connections: CoupangConnectionService,
  ) {
    super();
  }

  /**
   * Collects input, persists the sealed credentials, then verifies them against the Coupang API.
   * Sets a non-zero exit code if verification can't be completed.
   */
  async run(): Promise<void> {
    // 1. Collect all input BEFORE opening a transaction.
    const vendorId = (
      await input({
        message: "Vendor ID",
        validate: (v) => /^A\d+$/.test(v.trim()) || "Must look like A00123456",
      })
    ).trim();
    const accessKey = (
      await password({ message: "Access key", mask: "*", validate: required })
    ).trim();
    const secretKey = (
      await password({ message: "Secret key", mask: "*", validate: required })
    ).trim();

    const existingTenant = await this.findFirstTenant();
    const newTenantName = existingTenant
      ? undefined
      : await input({ message: "Store name", default: "My store" });

    // 2. Encryption
    const sealed = this.crypto.seal({ accessKey, secretKey });

    // 3. DB write
    const connectionId = await this.db.transaction(async (tx) => {
      const tenantId =
        existingTenant?.id ??
        (
          await tx
            .insert(tenants)
            .values({ name: newTenantName! })
            .returning({ id: tenants.id })
        )[0].id;

      const values = {
        credentialsEnc: sealed.ciphertext,
        iv: sealed.iv,
        authTag: sealed.authTag,
        keyVersion: sealed.keyVersion,
        accessKeyHint: accessKey.slice(-4),
        status: "pending" as const, // new keys are unverified until proven otherwise
        updatedAt: new Date(),
      };

      const [row] = await tx
        .insert(coupangConnections)
        .values({ tenantId, vendorId, ...values })
        .onConflictDoUpdate({
          target: [coupangConnections.tenantId, coupangConnections.vendorId],
          set: values,
        })
        .returning({ id: coupangConnections.id });

      return row.id;
    });

    const hint = `••••${accessKey.slice(-4)}`;

    // 4. Verify outside the transaction
    try {
      const status = await this.connections.verify(connectionId);
      console.log(`Saved ${vendorId} (key ${hint}), status: ${status}`);
      if (status === "invalid") {
        console.log(
          "Hint: a fresh IP whitelist change in Wing takes ~30 minutes to apply.",
        );
        process.exitCode = 1;
      }
    } catch (err) {
      console.error(
        `Saved ${vendorId} (key ${hint}), but verification failed: ${(err as Error).message}`,
      );
      console.error('Status stays "pending". Re-run later to verify.');
      process.exitCode = 1;
    }
  }

  /** Returns the oldest tenant, or `undefined` if none exist yet. */
  private async findFirstTenant() {
    const [tenant] = await this.db
      .select()
      .from(tenants)
      .orderBy(asc(tenants.createdAt))
      .limit(1);
    return tenant;
  }
}
