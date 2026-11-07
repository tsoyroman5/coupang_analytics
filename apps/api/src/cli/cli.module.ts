import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Env } from '../config/env';
import { DbModule } from '../db/db.module';
import { CredentialsModule } from '../credentials/credentials.module';
import { ConnectCoupangCommand } from './connect-coupang.command';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: (c) => Env.parse(c) }),
    DbModule,
    CredentialsModule,
  ],
  providers: [ConnectCoupangCommand],
})
export class CliModule {}