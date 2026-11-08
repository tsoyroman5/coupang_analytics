import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Env } from '../config/env';
import { DbModule } from '../db/db.module';
import { CredentialsModule } from '../credentials/credentials.module';
import { ConnectCoupangCommand } from './connect-coupang.command';
import { CoupangModule } from '../coupang/coupang.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: (c) => Env.parse(c) }),
    DbModule,
    CredentialsModule,
    CoupangModule
  ],
  providers: [ConnectCoupangCommand],
})
export class CliModule {}