import { createHmac } from "node:crypto";

/** yyMMdd'T'HHmmss'Z' in UTC, e.g. 261108T034512Z */
export function coupangSignedDate(d = new Date()): string {
  const s = d.toISOString(); // 2026-11-08T03:45:12.345Z
  return `${s.slice(2, 4)}${s.slice(5, 7)}${s.slice(8, 10)}T${s.slice(11, 13)}${s.slice(14, 16)}${s.slice(17, 19)}Z`;
}

export function signCoupang(p: {
  method: string;
  path: string;
  query: string;
  accessKey: string;
  secretKey: string;
  signedDate: string;
}): string {
  const signature = createHmac("sha256", p.secretKey)
    .update(p.signedDate + p.method + p.path + p.query)
    .digest("hex");
  return `CEA algorithm=HmacSHA256, access-key=${p.accessKey}, signed-date=${p.signedDate}, signature=${signature}`;
}
