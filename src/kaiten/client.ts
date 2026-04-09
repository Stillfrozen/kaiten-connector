import { env } from "../env.js";

interface KaitenConfig {
  host: string;
  token: string;
}

function getConfig(): KaitenConfig {
  const host = env("KAITEN_HOST");
  const token = env("KAITEN_TOKEN");
  if (!host || !token) {
    throw new Error(
      "KAITEN_HOST and KAITEN_TOKEN environment variables are required"
    );
  }
  // Defense in depth: KAITEN_HOST is used as URL host — reject anything that
  // could smuggle a scheme, path, or authority segment.
  if (!/^[a-z0-9.-]+$/i.test(host)) {
    throw new Error(
      "KAITEN_HOST must be a plain hostname (e.g. mycompany.kaiten.ru)"
    );
  }
  return { host, token };
}

// Serialized throttle: max 5 requests per second, globally across all callers.
// A single mutex chain ensures concurrent api() calls don't all read the same
// stale `lastRequestTime` and burst through the limit.
const MIN_INTERVAL_MS = 200; // 200ms between requests = 5 req/s
let throttleChain: Promise<void> = Promise.resolve();

async function throttle(): Promise<void> {
  const next = throttleChain.then(async () => {
    await new Promise((r) => setTimeout(r, MIN_INTERVAL_MS));
  });
  // Chain all future throttle() calls behind this one.
  throttleChain = next.catch(() => {});
  return next;
}

async function fetchJson<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get("retry-after") ?? "2", 10);
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    await throttle();
    const retry = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!retry.ok) throw new Error(`Kaiten API ${retry.status}`);
    return retry.json() as Promise<T>;
  }
  if (!res.ok) throw new Error(`Kaiten API ${res.status}`);
  return res.json() as Promise<T>;
}

export async function api<T = unknown>(path: string): Promise<T> {
  const { host, token } = getConfig();
  const url = `https://${host}/api/latest${path}`;
  await throttle();
  return fetchJson<T>(url, token);
}
