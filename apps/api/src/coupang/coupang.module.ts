import { Module } from "@nestjs/common";
import { CredentialsModule } from "../credentials/credentials.module";
import { CoupangConnectionService } from "./coupang-connection.service";
import { CoupangClient } from "./coupang.client";

// apps/api/src/coupang/coupang.module.ts
@Module({
  imports: [CredentialsModule],
  providers: [CoupangClient, CoupangConnectionService],
  exports: [CoupangConnectionService, CoupangClient],
})
export class CoupangModule {}
