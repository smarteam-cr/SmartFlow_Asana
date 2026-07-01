export class HttpError extends Error {
  constructor(status, body) {
    super(`HTTP error ${status}`);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
  }
}

const RETRY_DELAYS_MS = [200, 800];

function delay(ms) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

function isRetryable(status) {
  return status === 429 || status >= 500;
}

export async function request(baseUrl, method, path, { headers = {}, body } = {}) {
  let attempt = 0;

  for (;;) {
    const res = await fetch(`${baseUrl}${path}`, { method, headers, body });

    if (res.ok) {
      try {
        return await res.json();
      } catch {
        return {};
      }
    }

    if (isRetryable(res.status) && attempt < RETRY_DELAYS_MS.length) {
      await delay(RETRY_DELAYS_MS[attempt]);
      attempt++;
      continue;
    }

    const text = await res.text();
    throw new HttpError(res.status, text);
  }
}
