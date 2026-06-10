const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  "Accept-Language": "nl,en;q=0.8",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

export async function fetchText(url: string, init?: RequestInit): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: { ...BROWSER_HEADERS, ...init?.headers },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.text();
    } catch (err) {
      lastError = err;
      await sleep(1000 * (attempt + 1));
    }
  }
  throw lastError;
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const text = await fetchText(url, init);
  return JSON.parse(text) as T;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
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
