import { randomBytes } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { CredentialsCryptoService, Sealed } from "./credentials-crypto.service";

const make = (key = randomBytes(32).toString("base64"), version = 1) =>
  new CredentialsCryptoService({
    get: (k: string) => (k === "CREDENTIALS_MASTER_KEY" ? key : version),
  } as unknown as ConfigService<any, true>);

const payload = { accessKey: "ak-test-1234", secretKey: "sk-test-5678" };

describe("CredentialsCryptoService", () => {
  it("round-trips a payload", () => {
    const svc = make();
    expect(svc.open(svc.seal(payload))).toEqual(payload);
  });

  it("uses a fresh IV every time", () => {
    const svc = make();
    const a = svc.seal(payload);
    const b = svc.seal(payload);
    expect(a.iv).not.toEqual(b.iv);
    expect(a.ciphertext).not.toEqual(b.ciphertext);
  });

  it("rejects tampered ciphertext", () => {
    const svc = make();
    const s = svc.seal(payload);
    const bytes = Buffer.from(s.ciphertext, "base64");
    bytes[0] ^= 0xff;
    expect(() =>
      svc.open({ ...s, ciphertext: bytes.toString("base64") }),
    ).toThrow();
  });

  it("rejects a tampered auth tag", () => {
    const svc = make();
    const s = svc.seal(payload);
    const tag = Buffer.from(s.authTag, "base64");
    tag[0] ^= 0xff;
    expect(() => svc.open({ ...s, authTag: tag.toString("base64") })).toThrow();
  });

  it("cannot be opened with a different master key", () => {
    const sealed = make().seal(payload);
    expect(() => make().open(sealed)).toThrow();
  });

  it("rejects an unknown key version", () => {
    const svc = make();
    const s: Sealed = { ...svc.seal(payload), keyVersion: 99 };
    expect(() => svc.open(s)).toThrow(/key version 99/);
  });

  it("never leaves the plaintext in the sealed output", () => {
    const s = make().seal(payload);
    expect(JSON.stringify(s)).not.toContain("sk-test-5678");
  });
});
