import { Inject } from "@nestjs/common";
import { Command, CommandRunner } from "nest-commander";
import { input, password } from "@inquirer/prompts";
import { asc } from "drizzle-orm";
import { DRIZZLE, Db } from "../db/db.module";
import { tenants, coupangConnections } from "../db/schema";
import { CredentialsCryptoService } from "../credentials/credentials-crypto.service";

const required = (v: string) => v.trim().length > 0 || "Required";

@Command({
  name: "connect-coupang",
  description: "Store encrypted Coupang Open API credentials",
})
export class ConnectCoupangCommand extends CommandRunner {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly crypto: CredentialsCryptoService,
  ) {
    super();
  }

  async run(): Promise<void> {
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

    const sealed = this.crypto.seal({ accessKey, secretKey });

    await this.db.transaction(async (tx) => {
      // Single-user dev flow: reuse the first tenant or create one.
      let [tenant] = await tx
        .select()
        .from(tenants)
        .orderBy(asc(tenants.createdAt))
        .limit(1);
      if (!tenant) {
        const name = await input({
          message: "Store name",
          default: "My store",
        });
        [tenant] = await tx.insert(tenants).values({ name }).returning();
      }

      const values = {
        credentialsEnc: sealed.ciphertext,
        iv: sealed.iv,
        authTag: sealed.authTag,
        keyVersion: sealed.keyVersion,
        accessKeyHint: accessKey.slice(-4),
        status: "pending" as const,
        updatedAt: new Date(),
      };

      await tx
        .insert(coupangConnections)
        .values({ tenantId: tenant.id, vendorId, ...values })
        .onConflictDoUpdate({
          target: [coupangConnections.tenantId, coupangConnections.vendorId],
          set: values,
        });
    });

    console.log(
      `Saved ${vendorId} (key ••••${accessKey.slice(-4)}), status: pending`,
    );
  }
}
