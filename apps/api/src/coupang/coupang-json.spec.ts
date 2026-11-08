import { buildCoupangQuery, parseJsonLossless } from "./coupang-json";

describe("parseJsonLossless", () => {
  it("keeps unsafe integers as exact strings and leaves safe numbers alone", () => {
    const r = parseJsonLossless<{ id: unknown; n: unknown; price: unknown }>(
      '{"id":642538970006401429,"n":42,"price":19900.5}',
    );
    expect(r.id).toBe("642538970006401429");
    expect(r.n).toBe(42);
    expect(r.price).toBe(19900.5);
  });

  it("works inside nested arrays", () => {
    const r = parseJsonLossless<{ data: { shipmentBoxId: unknown }[] }>(
      '{"data":[{"shipmentBoxId":642538970006401429},{"shipmentBoxId":6425389776401429}]}',
    );
    expect(r.data[0].shipmentBoxId).toBe("642538970006401429");
    expect(r.data[1].shipmentBoxId).toBe(6425389776401429); // safe integer stays a number
  });
});

describe("buildCoupangQuery", () => {
  it("encodes + but keeps : literal, matching the docs example", () => {
    expect(
      buildCoupangQuery({
        createdAtFrom: "2025-07-21+09:00",
        status: "ACCEPT",
      }),
    ).toBe("createdAtFrom=2025-07-21%2B09:00&status=ACCEPT");
  });

  it("drops undefined but keeps empty strings (first-page token)", () => {
    expect(
      buildCoupangQuery({ token: "", nextToken: undefined, maxPerPage: 50 }),
    ).toBe("token=&maxPerPage=50");
  });

  it("encodes characters that would break the URL", () => {
    expect(buildCoupangQuery({ sellerProductName: "양말 & 신발" })).toBe(
      "sellerProductName=%EC%96%91%EB%A7%90%20%26%20%EC%8B%A0%EB%B0%9C",
    );
  });
});
