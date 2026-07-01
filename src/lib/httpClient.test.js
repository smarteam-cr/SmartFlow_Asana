import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { request, HttpError } from './httpClient.js';

describe('httpClient.request', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('returns parsed JSON on a 2xx response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { gid: '123' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await request('https://api.example.com', 'GET', '/tasks/123');

    expect(result).toEqual({ data: { gid: '123' } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/tasks/123',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('throws HttpError immediately on a non-retryable 4xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'not found',
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(request('https://api.example.com', 'GET', '/missing')).rejects.toThrow(HttpError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries up to 2 times on 429 then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'rate limited' })
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'server error' })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);

    const promise = request('https://api.example.com', 'POST', '/tasks', { body: '{}' });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('throws HttpError with status and body after exhausting retries', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'still down',
    });
    vi.stubGlobal('fetch', fetchMock);

    const promise = request('https://api.example.com', 'GET', '/flaky');
    const assertion = expect(promise).rejects.toMatchObject({ status: 503, body: 'still down' });

    await vi.runAllTimersAsync();
    await assertion;

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
