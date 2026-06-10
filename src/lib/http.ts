/** Full Chrome-like header set; thin default headers are a bot-wall tell. */
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "nl,en-US;q=0.9,en;q=0.8",
  "Sec-Ch-Ua": '"Chromium";v="131", "Not_A Brand";v="24", "Google Chrome";v="131"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

export class HttpError extends Error {
  constructor(
    public status: number,
    url: string,
  ) {
    super(`HTTP ${status} for ${url}`);
  }
}

async function fetchDirect(url: string, init?: RequestInit): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: { ...BROWSER_HEADERS, ...init?.headers },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new HttpError(res.status, url);
      return await res.text();
    } catch (err) {
      lastError = err;
      // a bot wall won't change its mind seconds later; fail fast to the mirror
      if (err instanceof HttpError && [403, 429, 503].includes(err.status)) throw err;
      await sleep(1000 * (attempt + 1));
    }
  }
  throw lastError;
}

/**
 * Fetch a page's HTML. When the site's bot protection blocks the direct
 * request (403/429/503 — datacenter IPs are often blanket-blocked), retry
 * once through the public Jina reader proxy, which fetches the page from
 * its own infrastructure and can return the raw HTML.
 */
export async function fetchText(url: string, init?: RequestInit): Promise<string> {
  try {
    return await fetchDirect(url, init);
  } catch (err) {
    const blocked = err instanceof HttpError && [403, 429, 503].includes(err.status);
    if (!blocked || !/^https?:\/\//.test(url)) throw err;
    try {
      const res = await fetch(`https://r.jina.ai/${url}`, {
        headers: { "X-Return-Format": "html", Accept: "text/html" },
        signal: AbortSignal.timeout(45_000),
      });
      if (!res.ok) throw new HttpError(res.status, `r.jina.ai/${url}`);
      return await res.text();
    } catch {
      throw err; // report the original blocking error
    }
  }
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const text = await fetchText(url, init);
  return JSON.parse(text) as T;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Polite jitter between scraping requests. */
export function politePause(): Promise<void> {
  return sleep(400 + Math.random() * 600);
}

/** Map over items with bounded concurrency, keeping order. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}
