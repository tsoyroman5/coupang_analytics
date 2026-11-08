import { Module } from "@nestjs/common";
import { CredentialsModule } from "../credentials/credentials.module";
import { CoupangConnectionService } from "./coupang-connection.service";
import { CoupangClient } from "./coupang.client";
import { CoupangOrdersLoader } from './loaders/coupang-orders.loader';

// apps/api/src/coupang/coupang.module.ts
@Module({
  imports: [CredentialsModule],
  providers: [CoupangClient, CoupangConnectionService, CoupangOrdersLoader],
  exports: [CoupangConnectionService, CoupangClient, CoupangOrdersLoader],
})
export class CoupangModule {}
