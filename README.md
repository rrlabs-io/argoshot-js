# argoshot

The official JavaScript/TypeScript client for [Argoshot](https://argoshot.com), the screenshot API: screenshots, PDFs and
signed `og:image` URLs of any web page or HTML. **Free to start.** Docs: https://argoshot.com/docs

Zero dependencies, ESM with types. Works with `fetch`: Node 18+, Deno, Bun, Cloudflare Workers.

## Install

```sh
npm install argoshot
```

Get your access key (and secret key, for signed URLs) from the dashboard's API keys page.

## Screenshot to a file

```js
import { writeFile } from "node:fs/promises";
import { Argoshot } from "argoshot";

const argoshot = new Argoshot(process.env.ARGOSHOT_ACCESS_KEY);

const png = await argoshot.take({
  url: "https://example.com",
  format: "png",
  full_page: true,
  block_cookie_banners: true,
});
await writeFile("example.png", png);
```

## Signed og:image URL

`url()` builds a `GET /take` link you can put straight into `<img src>` or `<meta property="og:image">`. With a secret key
it is signed (HMAC-SHA256 of the query string), so nobody can change its options. Set the key to
**signed requests only** in the dashboard before you put its links in public pages.

```js
const argoshot = new Argoshot(process.env.ARGOSHOT_ACCESS_KEY, { secretKey: process.env.ARGOSHOT_SECRET_KEY });

const ogImage = argoshot.url({
  url: "https://example.com/blog/my-post",
  viewport_width: 1200,
  viewport_height: 630,
  format: "png",
  cache: true,
  cache_ttl: 86400,
});
// <meta property="og:image" content="${ogImage}">
```

## HTML to PNG

When `html` (or `markdown`) is given, `take()` sends a JSON `POST` instead of a long query string.

```js
const card = await argoshot.take({
  html: `<div style="font: 64px system-ui; padding: 80px">Hello from Argoshot</div>`,
  format: "png",
  viewport_width: 1200,
  viewport_height: 630,
});
await writeFile("card.png", card);
```

## Options

Options are the API's own names, passed as they are: every one is listed at https://argoshot.com/docs/options
(`url`, `html`, `format`, `viewport_width`, `viewport_height`, `viewport_device`, `full_page`, `block_cookie_banners`,
`block_ads`, `dark_mode`, `selector`, `cache`, `cache_ttl` and 140 more). Lists are arrays:
`hide_selectors: [".banner", "#chat"]`. The common ones are typed in `TakeOptions`.

## Errors

A failed request throws `ArgoshotError` with the API's `code` (e.g. `selector_not_found`, `screenshots_limit_reached`),
`message`, HTTP `status`, `documentationUrl`, and `upgradeUrl` / `retryAfter` when the API gives them.
All codes: https://argoshot.com/docs/errors

```js
import { ArgoshotError } from "argoshot";

try {
  await argoshot.take({ url: "https://example.com", selector: "#missing", error_on_selector_not_found: true });
} catch (e) {
  if (e instanceof ArgoshotError) console.error(e.code, e.message);
  else throw e;
}
```

## Usage

```js
const { available, used, total } = await argoshot.usage();
```

## Configuration

```js
new Argoshot(accessKey, {
  secretKey: "...",                     // sign url() and GET take() requests
  baseUrl: "https://api.argoshot.com",  // default
  timeoutMs: 120000,                    // default
  fetch: customFetch,                   // default globalThis.fetch
});
```

Note: a key set to *signed requests only* cannot send JSON `POST` requests (the API refuses them), so `take({ html })`
needs a key that permits unsigned requests.

## Licence

MIT
