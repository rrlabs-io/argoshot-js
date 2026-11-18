// Argoshot: a small client for the Argoshot screenshot API (https://argoshot.com/docs).
// Zero dependencies. Works wherever `fetch` exists: Node 18+, Deno, Bun, Cloudflare Workers, browsers.

export const VERSION = "0.1.0";
export const DEFAULT_BASE_URL = "https://api.argoshot.com";

/** An error the API answered (its `error_code` and `error_message`), or a response that was not the API's. */
export class ArgoshotError extends Error {
  constructor({ code, message, status, documentationUrl, upgradeUrl, returnedStatusCode, matchedString, retryAfter, body } = {}) {
    super(message || code || "Argoshot request failed");
    this.name = "ArgoshotError";
    this.code = code || "http_error";
    this.status = status || 0;
    this.documentationUrl = documentationUrl || undefined;
    this.upgradeUrl = upgradeUrl || undefined;
    this.returnedStatusCode = returnedStatusCode || undefined;
    this.matchedString = matchedString || undefined;
    this.retryAfter = retryAfter ?? undefined;
    this.body = body;
  }
}

export class Argoshot {
  /**
   * @param {string} accessKey your access key (dashboard, API keys)
   * @param {{secretKey?: string, baseUrl?: string, fetch?: typeof fetch, timeoutMs?: number}} [config]
   */
  constructor(accessKey, config = {}) {
    if (!accessKey || typeof accessKey !== "string") throw new TypeError("Argoshot: an access key is required");
    this.accessKey = accessKey;
    this.secretKey = config.secretKey || undefined;
    this.baseUrl = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeoutMs = config.timeoutMs ?? 120_000;
    this._fetch = config.fetch || ((...args) => globalThis.fetch(...args));
  }

  /**
   * A GET /take URL for these options, for <img src> or og:image. Signed when a secret key is configured.
   * The access key is in the URL: for public pages, use a key set to "signed requests only".
   */
  url(options) {
    const query = buildQuery(options);
    const unsigned = (query ? query + "&" : "") + "access_key=" + encode(this.accessKey);
    const full = this.secretKey ? unsigned + "&signature=" + sign(this.secretKey, unsigned) : unsigned;
    return this.baseUrl + "/take?" + full;
  }

  /**
   * Render and return the file's bytes. GET for url captures (signed when a secret key is configured);
   * POST with a JSON body when `html` or `markdown` is given.
   * @returns {Promise<Uint8Array>}
   */
  async take(options) {
    const opts = cleanOptions(options);
    const headers = { "X-Access-Key": this.accessKey, "User-Agent": "argoshot-js/" + VERSION };
    let request;
    if (opts.html !== undefined || opts.markdown !== undefined) {
      headers["Content-Type"] = "application/json";
      request = { method: "POST", url: this.baseUrl + "/take", body: JSON.stringify(opts) };
    } else {
      const query = buildQuery(opts);
      const full = this.secretKey ? query + "&signature=" + sign(this.secretKey, query) : query;
      request = { method: "GET", url: this.baseUrl + "/take?" + full };
    }
    const response = await this._send(request.method, request.url, headers, request.body);
    return new Uint8Array(await response.arrayBuffer());
  }

  /** GET /usage: renders total, available and used, and the plan's limits. Costs nothing. */
  async usage() {
    const response = await this._send("GET", this.baseUrl + "/usage", { "X-Access-Key": this.accessKey, "User-Agent": "argoshot-js/" + VERSION });
    return response.json();
  }

  async _send(method, url, headers, body) {
    const init = { method, headers, body };
    if (this.timeoutMs && typeof AbortSignal !== "undefined" && AbortSignal.timeout) init.signal = AbortSignal.timeout(this.timeoutMs);
    const response = await this._fetch(url, init);
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw parseError(response.status, text, response.headers);
    }
    return response;
  }
}

/** An ArgoshotError from an error response (status, body text, optional headers). */
export function parseError(status, bodyText, headers) {
  let data;
  try { data = JSON.parse(bodyText); } catch { data = undefined; }
  const retry = headers && typeof headers.get === "function" ? headers.get("retry-after") : undefined;
  const retryAfter = retry != null && retry !== "" && !Number.isNaN(Number(retry)) ? Number(retry) : undefined;
  if (data && typeof data === "object" && typeof data.error_code === "string") {
    return new ArgoshotError({
      code: data.error_code,
      message: data.error_message || data.error_code,
      status,
      documentationUrl: data.documentation_url,
      upgradeUrl: data.upgrade_url,
      returnedStatusCode: data.returned_status_code,
      matchedString: data.matched_string,
      retryAfter,
      body: bodyText,
    });
  }
  const snippet = String(bodyText || "").slice(0, 200);
  return new ArgoshotError({ code: "http_error", message: `HTTP ${status}${snippet ? ": " + snippet : ""}`, status, retryAfter, body: bodyText });
}

/** The query string of these options: names sorted, lists repeated, null/undefined left out (no access key). */
export function buildQuery(options) {
  const opts = cleanOptions(options);
  const parts = [];
  for (const name of Object.keys(opts).sort()) {
    const value = opts[name];
    const values = Array.isArray(value) ? value : [value];
    for (const v of values) {
      if (v === undefined || v === null) continue;
      parts.push(encode(name) + "=" + encode(text(v)));
    }
  }
  return parts.join("&");
}

/** The signature the API checks: lowercase hex HMAC-SHA256 of the query string, under the secret key. */
export function sign(secretKey, query) {
  return toHex(hmacSha256(utf8(secretKey), utf8(query)));
}

function cleanOptions(options) {
  const out = {};
  for (const [name, value] of Object.entries(options || {})) {
    if (value === undefined || value === null) continue;
    if (name === "access_key" || name === "signature") continue;   // (the client's own)
    out[name] = value;
  }
  return out;
}

function text(v) {
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
}

// RFC 3986: everything but A-Z a-z 0-9 - . _ ~ is percent-encoded (a space is %20, a + is %2B).
function encode(s) {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

// ---- HMAC-SHA256, synchronous and dependency-free (so url() works the same in every runtime)

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function sha256(data) {
  const bitLength = data.length * 8;
  const padded = new Uint8Array(((data.length + 9 + 63) >> 6) << 6);
  padded.set(data);
  padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(padded.length - 4, bitLength >>> 0);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15], b = w[i - 2];
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
  }
  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) outView.setUint32(i * 4, h[i]);
  return out;
}

function hmacSha256(key, message) {
  let k = key.length > 64 ? sha256(key) : key;
  const block = new Uint8Array(64);
  block.set(k);
  const inner = new Uint8Array(64 + message.length);
  const outer = new Uint8Array(64 + 32);
  for (let i = 0; i < 64; i++) { inner[i] = block[i] ^ 0x36; outer[i] = block[i] ^ 0x5c; }
  inner.set(message, 64);
  outer.set(sha256(inner), 64);
  return sha256(outer);
}

function utf8(s) { return new TextEncoder().encode(s); }

function toHex(bytes) {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

export default Argoshot;
