import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { registerAsanaWebhook } from './asanaWebhook.js';

const config = {};

function buildApp(overrides = {}) {
  const deps = {
    config,
    asana: { getTask: vi.fn() },
    hubspot: { updateDealStage: vi.fn(), createCompletedDealTaskWithAssociation: vi.fn() },
    operacionesVentasService: { processTask: vi.fn().mockResolvedValue(undefined) },
    findSyncByAsanaTask: vi.fn().mockResolvedValue(null),
    markSyncCompleted: vi.fn(),
    saveLog: vi.fn(),
    ...overrides,
  };

  const app = Fastify();
  registerAsanaWebhook(app, deps);
  return { app, deps };
}

describe('POST /asana-webhook', () => {
  it('echoes back X-Hook-Secret on handshake without processing events', async () => {
    const { app, deps } = buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/asana-webhook',
      headers: { 'x-hook-secret': 'secret-abc' },
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['x-hook-secret']).toBe('secret-abc');
    expect(deps.operacionesVentasService.processTask).not.toHaveBeenCalled();
  });

  it.each([
    ['parent.task', { parent: { resource_type: 'task', gid: 'task-1' }, action: 'changed' }],
    ['resource.task', { resource: { resource_type: 'task', gid: 'task-1' }, action: 'changed' }],
    [
      'change.added_value.task',
      { change: { added_value: { resource_type: 'task', gid: 'task-1' } }, action: 'added' },
    ],
    [
      'change.new_value.task',
      { change: { new_value: { resource_type: 'task', gid: 'task-1' } }, action: 'changed' },
    ],
    [
      'change.removed_value.task',
      { change: { removed_value: { resource_type: 'task', gid: 'task-1' } }, action: 'changed' },
    ],
  ])('extracts taskGid from shape: %s', async (_label, event) => {
    const { app, deps } = buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/asana-webhook',
      payload: { events: [event] },
    });

    expect(res.statusCode).toBe(200);
    expect(deps.operacionesVentasService.processTask).toHaveBeenCalledWith('task-1');
  });

  it('skips deleted and trashed events', async () => {
    const { app, deps } = buildApp();

    await app.inject({
      method: 'POST',
      url: '/asana-webhook',
      payload: {
        events: [
          { resource: { resource_type: 'task', gid: 'task-1' }, action: 'deleted' },
          { resource: { resource_type: 'task', gid: 'task-2', resource_subtype: 'trashed' }, action: 'changed' },
        ],
      },
    });

    expect(deps.operacionesVentasService.processTask).not.toHaveBeenCalled();
  });

  it('deduplicates repeated task gids within a single request', async () => {
    const { app, deps } = buildApp();

    await app.inject({
      method: 'POST',
      url: '/asana-webhook',
      payload: {
        events: [
          { resource: { resource_type: 'task', gid: 'task-1' }, action: 'changed' },
          { resource: { resource_type: 'task', gid: 'task-1' }, action: 'changed' },
        ],
      },
    });

    expect(deps.operacionesVentasService.processTask).toHaveBeenCalledTimes(1);
  });

  it('moves the deal to the proposal stage recorded on the sync when a cuantificacion task completes', async () => {
    const { app, deps } = buildApp({
      findSyncByAsanaTask: vi.fn().mockResolvedValue({
        id: 'sync-1',
        type: 'cuantificacion',
        status: 'pending',
        hubspot_deal_id: 'deal-1',
        hubspot_target_stage: 'presentationscheduled',
      }),
    });
    deps.asana.getTask.mockResolvedValue({ data: { completed: true, name: 'Cuantificación' } });

    await app.inject({
      method: 'POST',
      url: '/asana-webhook',
      payload: { events: [{ resource: { resource_type: 'task', gid: 'task-1' }, action: 'changed' }] },
    });

    expect(deps.hubspot.updateDealStage).toHaveBeenCalledWith('deal-1', 'presentationscheduled');
    expect(deps.markSyncCompleted).toHaveBeenCalledWith('sync-1');
  });

  it('moves a Guatemala-pipeline deal to its own proposal stage, not another pipeline\'s', async () => {
    const { app, deps } = buildApp({
      findSyncByAsanaTask: vi.fn().mockResolvedValue({
        id: 'sync-gt',
        type: 'cuantificacion',
        status: 'pending',
        hubspot_deal_id: 'deal-gt',
        hubspot_target_stage: '1294745902',
      }),
    });
    deps.asana.getTask.mockResolvedValue({ data: { completed: true, name: 'Cuantificación' } });

    await app.inject({
      method: 'POST',
      url: '/asana-webhook',
      payload: { events: [{ resource: { resource_type: 'task', gid: 'task-gt' }, action: 'changed' }] },
    });

    expect(deps.hubspot.updateDealStage).toHaveBeenCalledWith('deal-gt', '1294745902');
  });

  it('logs a warning and does not move the deal when the sync has no target stage recorded', async () => {
    const { app, deps } = buildApp({
      findSyncByAsanaTask: vi.fn().mockResolvedValue({
        id: 'sync-legacy',
        type: 'cuantificacion',
        status: 'pending',
        hubspot_deal_id: 'deal-legacy',
        hubspot_target_stage: null,
      }),
    });
    deps.asana.getTask.mockResolvedValue({ data: { completed: true, name: 'Cuantificación' } });

    await app.inject({
      method: 'POST',
      url: '/asana-webhook',
      payload: { events: [{ resource: { resource_type: 'task', gid: 'task-legacy' }, action: 'changed' }] },
    });

    expect(deps.hubspot.updateDealStage).not.toHaveBeenCalled();
    expect(deps.markSyncCompleted).not.toHaveBeenCalled();
    expect(deps.saveLog).toHaveBeenCalledWith(
      'asana',
      'warning',
      expect.any(String),
      'cuantificacion_missing_target_stage',
      expect.objectContaining({ asana_task_id: 'task-legacy' }),
    );
  });

  it('creates a completed HubSpot task when a planos_despiece task completes', async () => {
    const { app, deps } = buildApp({
      findSyncByAsanaTask: vi.fn().mockResolvedValue({
        id: 'sync-2',
        type: 'planos_despiece',
        status: 'pending',
        hubspot_deal_id: 'deal-2',
      }),
    });
    deps.asana.getTask.mockResolvedValue({ data: { completed: true, name: 'Planos' } });

    await app.inject({
      method: 'POST',
      url: '/asana-webhook',
      payload: { events: [{ resource: { resource_type: 'task', gid: 'task-2' }, action: 'changed' }] },
    });

    expect(deps.hubspot.createCompletedDealTaskWithAssociation).toHaveBeenCalledWith(
      'deal-2',
      expect.any(String),
      expect.any(String),
    );
    expect(deps.markSyncCompleted).toHaveBeenCalledWith('sync-2');
  });

  it('does not close a sync of type operaciones_ventas via the completion path', async () => {
    const { app, deps } = buildApp({
      findSyncByAsanaTask: vi.fn().mockResolvedValue({
        id: 'sync-3',
        type: 'operaciones_ventas',
        status: 'pending',
        hubspot_task_id: 'hs-1',
      }),
    });

    await app.inject({
      method: 'POST',
      url: '/asana-webhook',
      payload: { events: [{ resource: { resource_type: 'task', gid: 'task-3' }, action: 'changed' }] },
    });

    expect(deps.markSyncCompleted).not.toHaveBeenCalled();
    expect(deps.hubspot.updateDealStage).not.toHaveBeenCalled();
  });
});
