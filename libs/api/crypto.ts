// import { randomBytes } from "node:crypto";

// // libs/api/crypto — the shape of it
// const iv = randomBytes(12);
// const c = createCipheriv('aes-256-gcm', masterKey, iv);
// const ct = Buffer.concat([c.update(secret, 'utf8'), c.final()]);
// return { ct, iv, tag: c.getAuthTag(), keyVersion: 1 };