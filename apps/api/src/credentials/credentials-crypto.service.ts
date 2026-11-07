/**
 * Provides symmetric encryption for credential payloads using AES-256-GCM.
 *
 * The service is responsible for sealing arbitrary JSON-serializable values and
 * later opening them only when the encrypted payload was produced with the
 * currently configured key version. This allows rotating the master key without
 * breaking older ciphertexts immediately.
 */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Env } from '../config/env';

/**
 * Encrypted credential payload.
 *
 * The payload is stored as Base64-encoded ciphertext plus the nonce and
 * authentication tag required to verify and decrypt it.
 */
export interface Sealed {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
}

/**
 * Encrypts and decrypts credential payloads with the configured key.
 *
 * This service is designed for secure storage of sensitive values such as API
 * tokens or refresh credentials. The payload is serialized to JSON, encrypted
 * with AES-256-GCM, and returned with version metadata for key rotation.
 */
@Injectable()
export class CredentialsCryptoService {
  private readonly key: Buffer;
  private readonly version: number;

  /**
   * Creates the crypto service from the configured master key and key version.
   *
   * @param cfg Nest configuration service used to locate the credential master key.
   */
  constructor(cfg: ConfigService<Env, true>) {
    this.key = Buffer.from(cfg.get('CREDENTIALS_MASTER_KEY', { infer: true }), 'base64');
    this.version = cfg.get('CREDENTIALS_KEY_VERSION', { infer: true });
  }

  /**
   * Encrypts a JSON-serializable value and returns the sealed representation.
   *
   * @param payload Value to encrypt. It must be serializable via JSON.stringify().
   * @returns A sealed payload including ciphertext, nonce, auth tag, and key version.
   */
  seal(payload: unknown): Sealed {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ct = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
    return {
      ciphertext: ct.toString('base64'),
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
      keyVersion: this.version,
    };
  }

  /**
   * Decrypts a sealed payload and returns the original value.
   *
   * @param s Stored encrypted payload.
   * @returns The original JSON-decoded value.
   * @throws {Error} When the payload version does not match the configured version.
   */
  open<T>(s: Sealed): T {
    if (s.keyVersion !== this.version) throw new Error(`Unsupported key version ${s.keyVersion}`);
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(s.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(s.authTag, 'base64'));
    const pt = Buffer.concat([decipher.update(Buffer.from(s.ciphertext, 'base64')), decipher.final()]);
    return JSON.parse(pt.toString('utf8')) as T;
  }
}