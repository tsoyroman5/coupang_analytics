import { CoupangApiError, CoupangClient } from "./coupang.client";
import { vi, type MockInstance } from "vitest";

/** Client with a controllable clock and no real sleeping between retries. */
class TestClient extends CoupangClient {
  private clock = Date.parse("2026-11-08T03:45:12Z");
  protected override now(): Date {
    return new Date(this.clock);
  }
  protected override delay(ms: number): Promise<void> {
    this.clock += Math.max(ms, 1000); // move the clock so signed-date changes between attempts
    return Promise.resolve();
  }
}

const creds = { vendorId: "A00012345", accessKey: "ak", secretKey: "sk" };
const PATH = "/v2/providers/seller_api/apis/api/v1/marketplace/seller-products";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/** Authorization header sent on the n-th fetch call. */
const authOf = (mock: MockInstance<typeof fetch>, n: number): string =>
  (mock.mock.calls[n][1] as RequestInit & { headers: Record<string, string> })
    .headers["Authorization"];

describe("CoupangClient.get", () => {
  let fetchMock: MockInstance<typeof fetch>;
  let client: TestClient;

  beforeEach(() => {
    fetchMock = vi.spyOn(globalThis, "fetch");
    client = new TestClient();
  });
  afterEach(() => fetchMock.mockRestore());

  it("retries 503 and returns data after success", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(json({ code: "SUCCESS", data: [1] }));

    await expect(
      client.get(creds, PATH, { vendorId: creds.vendorId }),
    ).resolves.toEqual({ code: "SUCCESS", data: [1] });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("re-signs every attempt with a fresh signed-date", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(json({ ok: true }));

    await client.get(creds, PATH);
    const first = authOf(fetchMock, 0).match(/signed-date=(\S+),/)?.[1];
    const second = authOf(fetchMock, 1).match(/signed-date=(\S+),/)?.[1];
    expect(first).toBe("261108T034512Z");
    expect(second).not.toBe(first);
  });

  it("does not retry 400 and throws CoupangApiError", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('{"message":"Invalid vendor ID"}', { status: 400 }),
    );

    const err = await client.get(creds, PATH).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CoupangApiError);
    expect((err as CoupangApiError).status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives up after 4 attempts on persistent 503", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(new Response("busy", { status: 503 })),
    );

    await expect(client.get(creds, PATH)).rejects.toMatchObject({
      status: 503,
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("treats a 200 HTML page as a CDN block", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("<!DOCTYPE html><title>Sorry! Access denied</title>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );

    await expect(client.get(creds, PATH)).rejects.toMatchObject({
      status: 403,
      message: expect.stringMatching(/CDN/),
    });
  });

  it("retries network errors", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(json({ ok: true }));

    await expect(client.get(creds, PATH)).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("sends the query exactly as signed, with a User-Agent", async () => {
    fetchMock.mockResolvedValueOnce(json({ ok: true }));

    await client.get(creds, "/x", {
      createdAtFrom: "2025-07-21+09:00",
      status: "ACCEPT",
    });
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit & { headers: Record<string, string> },
    ];
    expect(url).toBe(
      "https://api-gateway.coupang.com/x?createdAtFrom=2025-07-21%2B09:00&status=ACCEPT",
    );
    expect(init.headers["User-Agent"]).toMatch(/coupang-analytics/);
  });

  it("keeps 18-digit IDs exact", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('{"data":[{"shipmentBoxId":642538970006401429}]}', {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const res = await client.get<{ data: { shipmentBoxId: unknown }[] }>(
      creds,
      PATH,
    );
    expect(res.data[0].shipmentBoxId).toBe("642538970006401429");
  });
});
