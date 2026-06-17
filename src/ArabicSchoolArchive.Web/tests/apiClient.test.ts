import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiClient } from "../src/api/ApiClient.ts";
import type { ApiError } from "../src/api/ApiClient.ts";

const OK_BODY = { ok: true };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function makeClient(impl: typeof fetch): ApiClient {
  return new ApiClient({
    baseUrl: "http://api.local",
    fetchImpl: impl,
    getDevBypassHeaders: () => ({
      "X-Dev-School-Id": "11111111-1111-1111-1111-111111111111",
      "X-Dev-User-Id": "22222222-2222-2222-2222-222222222222",
    }),
  });
}

test("get() returns parsed JSON on 2xx", async () => {
  const client = makeClient(async () => jsonResponse(200, OK_BODY));
  const result = await client.get<typeof OK_BODY>("/api/v1/archive/archives");
  assert.deepEqual(result, OK_BODY);
});

test("get() throws ApiError with Arabic message on 401", async () => {
  const client = makeClient(async () => jsonResponse(401, { code: "UNAUTH" }));
  await assert.rejects(
    client.get("/api/v1/archive/archives"),
    (err: ApiError) => {
      assert.equal(err.status, 401);
      assert.equal(err.code, "UNAUTH");
      assert.match(err.message, /الجلسة/);
      return true;
    }
  );
});

test("get() surfaces SUBSCRIPTION_EXPIRED with 402 and Arabic message", async () => {
  const client = makeClient(async () =>
    jsonResponse(402, { code: "SUBSCRIPTION_EXPIRED", state: "Expired" })
  );
  await assert.rejects(
    client.get("/api/v1/archive/archives"),
    (err: ApiError) => {
      assert.equal(err.status, 402);
      assert.equal(err.code, "SUBSCRIPTION_EXPIRED");
      assert.equal(err.state, "Expired");
      assert.match(err.message, /انتهت صلاحية/);
      return true;
    }
  );
});

test("get() surfaces SUBSCRIPTION_SUSPENDED with 403 and Arabic message", async () => {
  const client = makeClient(async () =>
    jsonResponse(403, { code: "SUBSCRIPTION_SUSPENDED", state: "Suspended" })
  );
  await assert.rejects(
    client.get("/api/v1/archive/archives"),
    (err: ApiError) => {
      assert.equal(err.status, 403);
      assert.equal(err.code, "SUBSCRIPTION_SUSPENDED");
      assert.equal(err.state, "Suspended");
      assert.match(err.message, /تعليق|إعادة التفعيل/);
      return true;
    }
  );
});

test("get() surfaces 429 with Arabic rate-limit message", async () => {
  const client = makeClient(async () => jsonResponse(429, { code: "RATE_LIMITED" }));
  await assert.rejects(
    client.get("/api/v1/archive/archives"),
    (err: ApiError) => {
      assert.equal(err.status, 429);
      assert.equal(err.code, "RATE_LIMITED");
      assert.match(err.message, /الحد المسموح/);
      return true;
    }
  );
});

test("postForm() sends multipart with dev-bypass headers and Content-Type is not set manually", async () => {
  let captured: { url: string; init: RequestInit | undefined } = { url: "", init: undefined };
  const client = new ApiClient({
    baseUrl: "http://api.local",
    fetchImpl: async (input, init) => {
      captured = { url: String(input), init };
      return jsonResponse(200, { totalFiles: 0, successfulFiles: 0, failedFiles: 0, results: [] });
    },
    getDevBypassHeaders: () => ({
      "X-Dev-School-Id": "11111111-1111-1111-1111-111111111111",
    }),
  });

  const form = new FormData();
  form.append("files", new Blob(["x"]), "a.pdf");
  await client.postForm("/api/v1/archive/upload", form);

  assert.equal(captured.url, "http://api.local/api/v1/archive/upload");
  assert.equal(captured.init?.method, "POST");
  const headers = captured.init?.headers as Record<string, string>;
  assert.equal(headers["X-Dev-School-Id"], "11111111-1111-1111-1111-111111111111");
  // Content-Type is left to the browser (FormData boundary).
  assert.equal(headers["Content-Type"], undefined);
  assert.ok(captured.init?.body instanceof FormData);
});

test("getBlob() returns the response body as a Blob with dev-bypass headers", async () => {
  let captured: { url: string; init: RequestInit | undefined } = { url: "", init: undefined };
  const client = new ApiClient({
    baseUrl: "http://api.local",
    fetchImpl: async (input, init) => {
      captured = { url: String(input), init };
      return new Response(new Blob(["hello"]), {
        status: 200,
        headers: { "content-type": "application/octet-stream" },
      });
    },
    getDevBypassHeaders: () => ({
      "X-Dev-School-Id": "11111111-1111-1111-1111-111111111111",
    }),
  });

  const blob = await client.getBlob("/api/v1/archive/archives/abc/content");
  assert.equal(captured.url, "http://api.local/api/v1/archive/archives/abc/content");
  const headers = captured.init?.headers as Record<string, string>;
  assert.equal(headers["X-Dev-School-Id"], "11111111-1111-1111-1111-111111111111");
  assert.ok(blob instanceof Blob);
});

test("getBlob() throws ApiError on 403", async () => {
  const client = new ApiClient({
    baseUrl: "http://api.local",
    fetchImpl: async () => jsonResponse(403, { code: "SUBSCRIPTION_SUSPENDED" }),
  });
  await assert.rejects(
    client.getBlob("/api/v1/archive/archives/abc/content"),
    (err: ApiError) => {
      assert.equal(err.status, 403);
      assert.equal(err.code, "SUBSCRIPTION_SUSPENDED");
      return true;
    }
  );
});

test("query string builder omits empty values", async () => {
  let capturedUrl = "";
  const client = new ApiClient({
    baseUrl: "http://api.local",
    fetchImpl: async (input) => {
      capturedUrl = String(input);
      return jsonResponse(200, OK_BODY);
    },
  });
  await client.get("/api/v1/archive/archives", {
    page: 1,
    pageSize: 20,
    originalNameContains: undefined,
    category: "",
  });
  assert.equal(capturedUrl, "http://api.local/api/v1/archive/archives?page=1&pageSize=20");
});

test("get() works with empty baseUrl (same-origin / Vite proxy) and returns a relative path", async () => {
  let capturedUrl = "";
  const client = new ApiClient({
    baseUrl: "",
    fetchImpl: async (input) => {
      capturedUrl = String(input);
      return jsonResponse(200, { items: [], page: 1, pageSize: 20, totalCount: 0, totalPages: 0 });
    },
  });
  const result = await client.get<{ items: unknown[]; totalCount: number; totalPages: number }>(
    "/api/v1/archive/archives",
    { page: 1, pageSize: 20 }
  );
  assert.equal(capturedUrl, "/api/v1/archive/archives?page=1&pageSize=20");
  assert.equal(result.items.length, 0);
  assert.equal(result.totalCount, 0);
  assert.equal(result.totalPages, 0);
});

test("postForm() works with empty baseUrl (same-origin / Vite proxy) without throwing Invalid URL", async () => {
  let capturedUrl = "";
  const client = new ApiClient({
    baseUrl: "",
    fetchImpl: async (input) => {
      capturedUrl = String(input);
      return jsonResponse(200, { totalFiles: 0, successfulFiles: 0, failedFiles: 0, results: [] });
    },
  });
  const form = new FormData();
  form.append("files", new Blob(["x"]), "a.pdf");
  await client.postForm("/api/v1/archive/upload", form);
  assert.equal(capturedUrl, "/api/v1/archive/upload");
});

test("constructor throws a clean TypeError on a malformed baseUrl instead of Invalid URL", () => {
  assert.throws(
    () => new ApiClient({ baseUrl: "not a url", fetchImpl: async () => jsonResponse(200, OK_BODY) }),
    (err: Error) => {
      assert.match(err.message, /Invalid API base URL/);
      return true;
    }
  );
});

test("constructor throws on unsupported baseUrl protocol", () => {
  assert.throws(
    () => new ApiClient({ baseUrl: "ftp://api.local", fetchImpl: async () => jsonResponse(200, OK_BODY) }),
    (err: Error) => {
      assert.match(err.message, /protocol/);
      return true;
    }
  );
});

test("constructor accepts an explicit absolute https baseUrl", async () => {
  let capturedUrl = "";
  const client = new ApiClient({
    baseUrl: "https://api.example.com/",
    fetchImpl: async (input) => {
      capturedUrl = String(input);
      return jsonResponse(200, OK_BODY);
    },
  });
  await client.get("/health");
  assert.equal(capturedUrl, "https://api.example.com/health");
});
