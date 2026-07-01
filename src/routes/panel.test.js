import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { registerPanel } from './panel.js';

function buildApp(overrides = {}) {
  const deps = {
    hubspot: { testConnection: vi.fn().mockResolvedValue({}) },
    asana: { getCurrentUser: vi.fn().mockResolvedValue({ data: { name: 'Bot' } }) },
    countSyncTasks: vi.fn().mockResolvedValue(0),
    getSyncTasksPaginated: vi.fn().mockResolvedValue([]),
    deleteSyncTask: vi.fn(),
    deleteSyncTasksBulk: vi.fn(),
    deleteAllSyncTasks: vi.fn(),
    countLogs: vi.fn().mockResolvedValue(0),
    getLogsPaginated: vi.fn().mockResolvedValue([]),
    deleteLog: vi.fn(),
    deleteLogsBulk: vi.fn(),
    deleteAllLogs: vi.fn(),
    ...overrides,
  };

  const app = Fastify();
  registerPanel(app, deps);
  return { app, deps };
}

describe('GET /panel', () => {
  it('renders the full page with both connection statuses', async () => {
    const { app } = buildApp();
    const res = await app.inject({ method: 'GET', url: '/panel' });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Panel Integración HubSpot + Asana');
    expect(res.body).toContain('Conectado correctamente');
    expect(res.body).toContain('Conectado como Bot');
  });

  it('shows the HubSpot error message when the connection check fails', async () => {
    const { app } = buildApp({
      hubspot: { testConnection: vi.fn().mockRejectedValue(new Error('token inválido')) },
    });
    const res = await app.inject({ method: 'GET', url: '/panel' });

    expect(res.body).toContain('token inválido');
  });

  it('returns a sync table fragment as JSON for ajax=sync', async () => {
    const { app, deps } = buildApp({ countSyncTasks: vi.fn().mockResolvedValue(15) });
    const res = await app.inject({ method: 'GET', url: '/panel?ajax=sync&page=2' });

    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.html).toContain('Tareas sincronizadas');
    expect(deps.getSyncTasksPaginated).toHaveBeenCalledWith(10, 10);
  });
});

describe('POST /panel (ajax_action)', () => {
  it('deletes one sync task', async () => {
    const { app, deps } = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/panel',
      payload: { ajax_action: 'delete_one', type: 'sync', id: 'abc123' },
    });

    expect(res.json()).toEqual({ ok: true, message: 'Registro eliminado correctamente.' });
    expect(deps.deleteSyncTask).toHaveBeenCalledWith('abc123');
  });

  it('deletes selected logs', async () => {
    const { app, deps } = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/panel',
      payload: { ajax_action: 'delete_selected', type: 'logs', ids: ['1', '2'] },
    });

    expect(res.json().ok).toBe(true);
    expect(deps.deleteLogsBulk).toHaveBeenCalledWith(['1', '2']);
  });

  it('deletes all sync tasks', async () => {
    const { app, deps } = buildApp();
    await app.inject({ method: 'POST', url: '/panel', payload: { ajax_action: 'delete_all', type: 'sync' } });

    expect(deps.deleteAllSyncTasks).toHaveBeenCalled();
  });

  it('rejects an invalid type with a 400-shaped error', async () => {
    const { app } = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/panel',
      payload: { ajax_action: 'delete_one', type: 'bogus', id: '1' },
    });

    expect(res.json()).toEqual({ ok: false, message: 'Tipo no válido.' });
  });
});
