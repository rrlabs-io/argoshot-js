import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { Argoshot, ArgoshotError, buildQuery, parseError, sign } from "../index.js";

// The server's own test (jai-web-framework framework/Screenshots/tests/privacy/app.jai:194, test.jai:187):
// hmac_sha256("secret-of-the-customer-1234", "html=x&access_key=key-<tenant>"), lowercase hex.
test("signature matches the server's test vector", () => {
  const client = new Argoshot("key-2", { secretKey: "secret-of-the-customer-1234" });
  assert.equal(
    client.url({ html: "x" }),
    "https://api.argoshot.com/take?html=x&access_key=key-2&signature=9488e5f178e81282b921f410775de15b0767f894504cd18bd66f35616d60ffd1",
  );
});

test("signed URL: sorted names, RFC 3986 encoding, lists repeated, numbers and booleans", () => {
  const client = new Argoshot("AK_test", { secretKey: "SK_test" });
  const url = client.url({
    url: "https://example.com/a b?x=1&y=2",
    format: "png",
    full_page: true,
    viewport_width: 1280,
    device_scale_factor: 1.5,
    hide_selectors: [".a", "#b .c"],
  });
  assert.equal(
    url,
    "https://api.argoshot.com/take?device_scale_factor=1.5&format=png&full_page=true&hide_selectors=.a&hide_selectors=%23b%20.c&url=https%3A%2F%2Fexample.com%2Fa%20b%3Fx%3D1%26y%3D2&viewport_width=1280&access_key=AK_test&signature=1a6f9d69eae82c57575f031ba76325705f5c0ddc6b48380a6fa7964c8a497b1c",
  );
});

test("signed URL with non-ASCII HTML, + and &", () => {
  const client = new Argoshot("AK_test", { secretKey: "SK_test" });
  assert.equal(
    client.url({ html: "<h1>Hi — café + &</h1>", format: "png" }),
    "https://api.argoshot.com/take?format=png&html=%3Ch1%3EHi%20%E2%80%94%20caf%C3%A9%20%2B%20%26%3C%2Fh1%3E&access_key=AK_test&signature=a1fb4eea53e2c394dce7ab32e31a26a2c8c85b8ebc53ac330ddb0cc441ee9eb7",
  );
});

test("unsigned URL, custom base URL, null options left out, client's own names ignored", () => {
  const client = new Argoshot("AK_test", { baseUrl: "http://localhost:8080/" });
  assert.equal(
    client.url({ url: "https://example.com", format: "png", selector: null, access_key: "other", signature: "x" }),
    "http://localhost:8080/take?format=png&url=https%3A%2F%2Fexample.com&access_key=AK_test",
  );
});

test("buildQuery encodes !'()* too", () => {
  assert.equal(buildQuery({ styles: "a{content:'!()*'}" }), "styles=a%7Bcontent%3A%27%21%28%29%2A%27%7D");
});

test("the pure-JS HMAC-SHA256 agrees with node:crypto", () => {
  for (let i = 0; i < 300; i++) {
    const key = randomBytes(i % 150).toString("latin1");
    const message = randomBytes(i * 7 % 1000).toString("latin1") + "é—";
    const expected = createHmac("sha256", Buffer.from(key, "utf8")).update(message, "utf8").digest("hex");
    assert.equal(sign(key, message), expected);
  }
});

test("parseError reads the API's JSON error", () => {
  const body = JSON.stringify({
    is_successful: false,
    error_code: "selector_not_found",
    error_message: "Nothing matches the selector: #hero",
    documentation_url: "https://argoshot.com/docs/errors/selector-not-found/",
  });
  const e = parseError(400, body);
  assert.ok(e instanceof ArgoshotError);
  assert.equal(e.code, "selector_not_found");
  assert.equal(e.message, "Nothing matches the selector: #hero");
  assert.equal(e.status, 400);
  assert.equal(e.documentationUrl, "https://argoshot.com/docs/errors/selector-not-found/");
});

test("parseError: upgrade_url, Retry-After, and a body that is not JSON", () => {
  const e = parseError(402, '{"is_successful":false,"error_code":"free_tier_exhausted","error_message":"Your 100 free renders are used.","upgrade_url":"https://argoshot.com/pricing"}', new Headers({ "Retry-After": "5" }));
  assert.equal(e.code, "free_tier_exhausted");
  assert.equal(e.upgradeUrl, "https://argoshot.com/pricing");
  assert.equal(e.retryAfter, 5);
  const bad = parseError(502, "<html>Bad gateway</html>");
  assert.equal(bad.code, "http_error");
  assert.equal(bad.status, 502);
  assert.match(bad.message, /HTTP 502/);
});

function fakeFetch(calls, response) {
  return async (url, init) => {
    calls.push({ url, init });
    return response();
  };
}

test("take(): GET for a URL, the key in the header, signed with a secret", async () => {
  const calls = [];
  const client = new Argoshot("AK_test", { secretKey: "SK_test", fetch: fakeFetch(calls, () => new Response(new Uint8Array([137, 80, 78, 71]), { status: 200, headers: { "Content-Type": "image/png" } })) });
  const bytes = await client.take({ url: "https://example.com", format: "png" });
  assert.deepEqual([...bytes], [137, 80, 78, 71]);
  const query = "format=png&url=https%3A%2F%2Fexample.com";
  assert.equal(calls[0].url, `https://api.argoshot.com/take?${query}&signature=${sign("SK_test", query)}`);
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.headers["X-Access-Key"], "AK_test");
});

test("take(): POST JSON when html is given", async () => {
  const calls = [];
  const client = new Argoshot("AK_test", { fetch: fakeFetch(calls, () => new Response("ok", { status: 200 })) });
  await client.take({ html: "<h1>Hi</h1>", format: "png", full_page: true, hide_selectors: [".x"] });
  assert.equal(calls[0].url, "https://api.argoshot.com/take");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(calls[0].init.body), { html: "<h1>Hi</h1>", format: "png", full_page: true, hide_selectors: [".x"] });
});

test("take(): an error answer throws ArgoshotError", async () => {
  const client = new Argoshot("bad", { fetch: async () => new Response('{"is_successful":false,"error_code":"access_key_invalid","error_message":"No such access key."}', { status: 400 }) });
  await assert.rejects(client.take({ url: "https://example.com" }), (e) => e instanceof ArgoshotError && e.code === "access_key_invalid" && e.status === 400);
});

test("live: a PNG of example.com (set ARGOSHOT_KEY)", { skip: !process.env.ARGOSHOT_KEY }, async () => {
  const client = new Argoshot(process.env.ARGOSHOT_KEY, { secretKey: process.env.ARGOSHOT_SECRET });
  const bytes = await client.take({ url: "https://example.com", format: "png" });
  assert.deepEqual([...bytes.slice(0, 4)], [137, 80, 78, 71]);
});
