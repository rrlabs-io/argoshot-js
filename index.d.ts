export declare const VERSION: string;
export declare const DEFAULT_BASE_URL: string;

/** One option's value: lists (hide_selectors, block_requests, cookies, headers ...) are arrays. */
export type OptionValue = string | number | boolean | null | undefined | Array<string | number | boolean>;

/**
 * The API's options, by their own names (https://argoshot.com/docs/options).
 * The common ones are typed; any other option is accepted by name.
 */
export interface TakeOptions {
  /** The page to render (http or https). One of url, html or markdown. */
  url?: string;
  /** HTML to render (sent as a JSON POST by take()). */
  html?: string;
  /** Markdown to render, as a page (sent as a JSON POST by take()). */
  markdown?: string;
  /** Default jpg. */
  format?: "png" | "jpeg" | "jpg" | "webp" | "gif" | "jp2" | "tiff" | "avif" | "heif" | "pdf" | "html" | "markdown" | (string & {});
  /** Default 1280. */
  viewport_width?: number;
  /** Default 1024. */
  viewport_height?: number;
  /** A device preset (GET /devices lists them). */
  viewport_device?: string;
  device_scale_factor?: number;
  full_page?: boolean;
  block_cookie_banners?: boolean;
  block_ads?: boolean;
  dark_mode?: boolean;
  /** Capture one element (CSS selector). */
  selector?: string;
  /** Keep the result and answer identical requests from it (free). */
  cache?: boolean;
  /** Seconds the cached result is kept (needs cache: true). */
  cache_ttl?: number;
  image_quality?: number;
  delay?: number;
  timeout?: number;
  wait_until?: string[];
  hide_selectors?: string[];
  response_type?: "by_format" | "empty" | "json" | (string & {});
  async?: boolean;
  webhook_url?: string;
  [option: string]: OptionValue;
}

export interface ArgoshotConfig {
  /** Your secret key: url() and GET take() requests are then signed. */
  secretKey?: string;
  /** Default https://api.argoshot.com */
  baseUrl?: string;
  /** A fetch implementation (default: globalThis.fetch). */
  fetch?: typeof fetch;
  /** Default 120000. 0: no timeout. */
  timeoutMs?: number;
}

export interface Usage {
  total: number;
  available: number;
  used: number;
  lifetime: boolean;
  concurrency: { limit: number };
  rate: { per_minute: number };
  period_end: number;
  [field: string]: unknown;
}

export declare class ArgoshotError extends Error {
  /** The API's error_code (e.g. "selector_not_found"), or "http_error" for a response that was not the API's JSON. */
  code: string;
  /** The HTTP status. */
  status: number;
  documentationUrl?: string;
  upgradeUrl?: string;
  returnedStatusCode?: number;
  matchedString?: string;
  /** Seconds, from Retry-After. */
  retryAfter?: number;
  /** The raw response body. */
  body?: string;
}

export declare class Argoshot {
  constructor(accessKey: string, config?: ArgoshotConfig);
  readonly accessKey: string;
  readonly secretKey?: string;
  readonly baseUrl: string;
  /** A GET /take URL (signed when a secret key is configured), for <img src> or og:image. */
  url(options: TakeOptions): string;
  /** Render and return the file's bytes. Throws ArgoshotError on failure. */
  take(options: TakeOptions): Promise<Uint8Array>;
  /** GET /usage. */
  usage(): Promise<Usage>;
}

export declare function buildQuery(options: TakeOptions): string;
export declare function sign(secretKey: string, query: string): string;
export declare function parseError(status: number, bodyText: string, headers?: { get(name: string): string | null }): ArgoshotError;

export default Argoshot;
