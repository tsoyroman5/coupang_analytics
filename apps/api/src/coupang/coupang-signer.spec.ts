// apps/api/src/coupang/coupang-signer.spec.ts
import { coupangSignedDate, signCoupang } from "./coupang-signer";

describe("coupang signer", () => {
  it("formats signed-date in UTC", () => {
    expect(coupangSignedDate(new Date("2026-11-08T03:45:12.345Z"))).toBe(
      "261108T034512Z",
    );
  });

  it("matches a known HMAC-SHA256 signature", () => {
    const auth = signCoupang({
      method: "GET",
      path: "/v2/providers/seller_api/apis/api/v1/marketplace/seller-products",
      query: "vendorId=A00012345&maxPerPage=1",
      accessKey: "test-access-key",
      secretKey: "test-secret-key",
      signedDate: "261108T034512Z",
    });
    expect(auth).toBe(
      "CEA algorithm=HmacSHA256, access-key=test-access-key, signed-date=261108T034512Z, " +
        "signature=ece2cea2ffad26d742752ed1557b603c8a3550c25d304fb2158c0275e0df15b5",
    );
  });
});
