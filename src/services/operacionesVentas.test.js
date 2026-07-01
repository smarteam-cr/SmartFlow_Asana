import { describe, it, expect, vi } from 'vitest';
import { createOperacionesVentasService } from './operacionesVentas.js';

const config = {
  asanaVentasProjectGid: 'ventas-gid',
  asanaHubspotTagName: 'HubSpot',
  asanaHubspotOwnerMap: {},
};

function makeTaskData(overrides = {}) {
  return {
    gid: 'task-1',
    name: 'Tarea de ventas',
    notes: 'Descripción',
    due_on: '2026-07-01',
    completed: false,
    permalink_url: 'https://app.asana.com/0/0/task-1',
    assignee: { gid: 'user-1', name: 'Jorge Arauz', email: 'jorge@example.com' },
    memberships: [{ project: { gid: 'ventas-gid' }, section: { name: 'En proceso' } }],
    tags: [{ name: 'HubSpot' }],
    ...overrides,
  };
}

function makeDeps(overrides = {}) {
  return {
    config,
    asana: {
      getTaskFullDetails: vi.fn(),
      getTaskStories: vi.fn().mockResolvedValue({ data: [] }),
      getTaskAttachments: vi.fn().mockResolvedValue({ data: [] }),
      addTaskComment: vi.fn().mockResolvedValue({}),
    },
    hubspot: {
      listOwners: vi.fn().mockResolvedValue([]),
      createTask: vi.fn(),
      updateTask: vi.fn(),
    },
    saveLog: vi.fn(),
    findSync: vi.fn().mockResolvedValue(null),
    saveOpVentasSync: vi.fn(),
    ...overrides,
  };
}

describe('createOperacionesVentasService.processTask', () => {
  it('ignores a task already completed without sending it to HubSpot', async () => {
    const deps = makeDeps();
    deps.asana.getTaskFullDetails.mockResolvedValue({ data: makeTaskData({ completed: true }) });

    const service = createOperacionesVentasService(deps);
    await service.processTask('task-1');

    expect(deps.hubspot.createTask).not.toHaveBeenCalled();
    expect(deps.saveLog).toHaveBeenCalledWith(
      'asana',
      'ignored',
      expect.any(String),
      'operaciones_ventas',
      expect.objectContaining({ asana_task_id: 'task-1' }),
    );
  });

  it('silently skips a task that is not in the VENTAS project (no log)', async () => {
    const deps = makeDeps();
    deps.asana.getTaskFullDetails.mockResolvedValue({
      data: makeTaskData({ memberships: [{ project: { gid: 'otro-proyecto' }, section: { name: 'X' } }] }),
    });

    const service = createOperacionesVentasService(deps);
    await service.processTask('task-1');

    expect(deps.hubspot.createTask).not.toHaveBeenCalled();
    expect(deps.saveLog).not.toHaveBeenCalled();
  });

  it('logs ignored when in VENTAS but missing the HubSpot tag', async () => {
    const deps = makeDeps();
    deps.asana.getTaskFullDetails.mockResolvedValue({ data: makeTaskData({ tags: [] }) });

    const service = createOperacionesVentasService(deps);
    await service.processTask('task-1');

    expect(deps.hubspot.createTask).not.toHaveBeenCalled();
    expect(deps.saveLog).toHaveBeenCalledWith(
      'asana',
      'ignored',
      expect.stringContaining('etiqueta'),
      'operaciones_ventas',
      expect.anything(),
    );
  });

  it('warns and skips when the assignee has no email', async () => {
    const deps = makeDeps();
    deps.asana.getTaskFullDetails.mockResolvedValue({
      data: makeTaskData({ assignee: { gid: 'user-1', name: 'Jorge', email: null } }),
    });

    const service = createOperacionesVentasService(deps);
    await service.processTask('task-1');

    expect(deps.hubspot.createTask).not.toHaveBeenCalled();
    expect(deps.saveLog).toHaveBeenCalledWith(
      'asana',
      'warning',
      expect.any(String),
      'operaciones_ventas',
      expect.anything(),
    );
  });

  it('creates a pending HubSpot task for the resolved owner and saves the sync', async () => {
    const deps = makeDeps();
    deps.asana.getTaskFullDetails.mockResolvedValue({ data: makeTaskData() });
    deps.hubspot.listOwners.mockResolvedValue([
      { id: 'owner-1', firstName: 'Jorge', lastName: 'Arauz', email: 'jorge@example.com' },
    ]);
    deps.hubspot.createTask.mockResolvedValue({ id: 'hs-task-1' });

    const service = createOperacionesVentasService(deps);
    await service.processTask('task-1');

    expect(deps.hubspot.createTask).toHaveBeenCalledWith(
      expect.objectContaining({ hubspot_owner_id: 'owner-1', hs_task_status: 'NOT_STARTED' }),
    );
    expect(deps.saveOpVentasSync).toHaveBeenCalledWith('task-1', 'hs-task-1');
    expect(deps.asana.addTaskComment).toHaveBeenCalledWith(
      'task-1',
      expect.stringContaining('hs-task-1'),
    );
  });

  it('does not fail the whole flow if the confirmation comment fails', async () => {
    const deps = makeDeps();
    deps.asana.getTaskFullDetails.mockResolvedValue({ data: makeTaskData() });
    deps.hubspot.listOwners.mockResolvedValue([
      { id: 'owner-1', firstName: 'Jorge', lastName: 'Arauz', email: 'jorge@example.com' },
    ]);
    deps.hubspot.createTask.mockResolvedValue({ id: 'hs-task-1' });
    deps.asana.addTaskComment.mockRejectedValue(new Error('asana down'));

    const service = createOperacionesVentasService(deps);
    await expect(service.processTask('task-1')).resolves.not.toThrow();

    expect(deps.saveOpVentasSync).toHaveBeenCalledWith('task-1', 'hs-task-1');
  });

  it('routes to update-only when a sync with hubspot_task_id already exists', async () => {
    const deps = makeDeps({
      findSync: vi.fn().mockResolvedValue({
        id: 'sync-1',
        type: 'operaciones_ventas',
        hubspot_task_id: 'hs-task-existing',
      }),
    });
    deps.asana.getTaskFullDetails.mockResolvedValue({ data: makeTaskData() });

    const service = createOperacionesVentasService(deps);
    await service.processTask('task-1');

    expect(deps.hubspot.createTask).not.toHaveBeenCalled();
    expect(deps.hubspot.updateTask).toHaveBeenCalledWith(
      'hs-task-existing',
      expect.objectContaining({ hs_task_subject: expect.stringContaining('[Operaciones]') }),
    );
  });
});

describe('createOperacionesVentasService.updateExistingTask', () => {
  it('skips the update when the task no longer has the HubSpot tag', async () => {
    const deps = makeDeps();
    deps.asana.getTaskFullDetails.mockResolvedValue({ data: makeTaskData({ tags: [] }) });

    const service = createOperacionesVentasService(deps);
    await service.updateExistingTask('task-1', 'hs-task-existing');

    expect(deps.hubspot.updateTask).not.toHaveBeenCalled();
    expect(deps.saveLog).toHaveBeenCalledWith(
      'asana',
      'ignored',
      expect.any(String),
      'operaciones_ventas_update',
      expect.anything(),
    );
  });
});
