import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient } from "../src/main/core/api";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function connectionReset(): TypeError {
  const cause = Object.assign(new Error("socket reset"), { code: "ECONNRESET" });
  return Object.assign(new TypeError("fetch failed"), { cause });
}

describe("ApiClient network retries", () => {
  it("retries an idempotent GET once after a transient connection reset", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(connectionReset())
      .mockResolvedValueOnce(new Response(JSON.stringify({ slug: "pixel", name: "Pixel" }), { status: 200 }));
    globalThis.fetch = fetchMock;
    const api = new ApiClient(() => "https://codress.dev", () => null);

    await expect(api.getPet("pixel")).resolves.toMatchObject({ slug: "pixel" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry POST requests that may have side effects", async () => {
    const fetchMock = vi.fn().mockRejectedValue(connectionReset());
    globalThis.fetch = fetchMock;
    const api = new ApiClient(() => "https://codress.dev", () => null);

    await expect(api.downloadPet("pixel")).rejects.toThrow("fetch failed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
