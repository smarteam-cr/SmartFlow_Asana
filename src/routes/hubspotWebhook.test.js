import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { registerHubspotWebhook } from './hubspotWebhook.js';

const config = {
  hubspotStageAnalisis: 'qualifiedtobuy',
  hubspotStageGanada: 'closedwon',
};

function buildApp(overrides = {}) {
  const deps = {
    config,
    hubspot: { getDeal: vi.fn() },
    cuantificacionService: {
      createCuantificacionTask: vi.fn().mockResolvedValue({ data: { gid: 'task-default' } }),
    },
    planosService: {
      createPlanosDespieceTask: vi.fn().mockResolvedValue({ data: { gid: 'task-default' } }),
    },
    existsSyncForDeal: vi.fn().mockResolvedValue(false),
    saveSyncTask: vi.fn(),
    saveLog: vi.fn(),
    ...overrides,
  };

  const app = Fastify();
  registerHubspotWebhook(app, deps);
  return { app, deps };
}

describe('POST /hubspot-webhook', () => {
  it.each([
    ['objectId', { objectId: 'deal-1' }],
    ['object_id', { object_id: 'deal-1' }],
    ['dealId', { dealId: 'deal-1' }],
    ['object.objectId', { object: { objectId: 'deal-1' } }],
    ['object.id', { object: { id: 'deal-1' } }],
    ['resourceId', { resourceId: 'deal-1' }],
    ['id', { id: 'deal-1' }],
  ])('extracts dealId from shape: %s', async (_label, eventBody) => {
    const { app, deps } = buildApp();
    deps.hubspot.getDeal.mockResolvedValue({ properties: { dealstage: 'closedwon' } });

    const res = await app.inject({ method: 'POST', url: '/hubspot-webhook', payload: eventBody });

    expect(res.statusCode).toBe(200);
    expect(deps.hubspot.getDeal).toHaveBeenCalledWith('deal-1');
  });

  it('creates a cuantificacion task when stage is qualifiedtobuy and not already synced', async () => {
    const { app, deps } = buildApp();
    deps.hubspot.getDeal.mockResolvedValue({ id: 'deal-1', properties: { dealstage: 'qualifiedtobuy' } });
    deps.cuantificacionService.createCuantificacionTask.mockResolvedValue({ data: { gid: 'task-1' } });

    const res = await app.inject({ method: 'POST', url: '/hubspot-webhook', payload: { objectId: 'deal-1' } });

    expect(res.statusCode).toBe(200);
    expect(deps.saveSyncTask).toHaveBeenCalledWith('deal-1', 'task-1', 'cuantificacion');
  });

  it('skips creating a cuantificacion task if one already exists for the deal (idempotency)', async () => {
    const { app, deps } = buildApp({ existsSyncForDeal: vi.fn().mockResolvedValue(true) });
    deps.hubspot.getDeal.mockResolvedValue({ id: 'deal-1', properties: { dealstage: 'qualifiedtobuy' } });

    await app.inject({ method: 'POST', url: '/hubspot-webhook', payload: { objectId: 'deal-1' } });

    expect(deps.cuantificacionService.createCuantificacionTask).not.toHaveBeenCalled();
  });

  it('creates a planos_despiece task when stage is closedwon', async () => {
    const { app, deps } = buildApp();
    deps.hubspot.getDeal.mockResolvedValue({ id: 'deal-2', properties: { dealstage: 'closedwon' } });
    deps.planosService.createPlanosDespieceTask.mockResolvedValue({ data: { gid: 'task-2' } });

    await app.inject({ method: 'POST', url: '/hubspot-webhook', payload: { objectId: 'deal-2' } });

    expect(deps.saveSyncTask).toHaveBeenCalledWith('deal-2', 'task-2', 'planos_despiece');
  });

  it('logs a warning and continues when the event has no deal id', async () => {
    const { app, deps } = buildApp();

    const res = await app.inject({ method: 'POST', url: '/hubspot-webhook', payload: {} });

    expect(res.statusCode).toBe(200);
    expect(deps.saveLog).toHaveBeenCalledWith('hubspot', 'warning', expect.any(String), 'dealstage_change', {});
  });

  it('accepts an array of events', async () => {
    const { app, deps } = buildApp();
    deps.hubspot.getDeal.mockResolvedValue({ id: 'deal-3', properties: { dealstage: 'unknown' } });

    const res = await app.inject({
      method: 'POST',
      url: '/hubspot-webhook',
      payload: [{ objectId: 'deal-3' }],
    });

    expect(res.statusCode).toBe(200);
    expect(deps.hubspot.getDeal).toHaveBeenCalledWith('deal-3');
  });
});
