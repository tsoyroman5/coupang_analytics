import { Module } from '@nestjs/common';
import { CredentialsCryptoService } from './credentials-crypto.service';

@Module({ providers: [CredentialsCryptoService], exports: [CredentialsCryptoService] })
export class CredentialsModule {}