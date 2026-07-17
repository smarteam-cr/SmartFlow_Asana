import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCuantificacionTask } from './cuantificacion.js';

const config = {
  asanaCuantificacionAssigneeGid: 'breiner-gid',
  asanaWorkspaceGid: 'workspace-gid',
  asanaProjectGid: 'project-gid',
};

const deal = { id: 'deal-1', properties: { dealname: 'Acme Corp' } };

describe('createCuantificacionTask', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-22T10:00:00')); // Monday
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates a task assigned to the configured user with a +4 business day due date', async () => {
    const createTask = vi.fn().mockResolvedValue({ data: { gid: 'task-1' } });
    const asana = { createTask };

    const result = await createCuantificacionTask(asana, config, deal);

    expect(result).toEqual({ data: { gid: 'task-1' } });
    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Cuantificación - Acme Corp',
        assignee: 'breiner-gid',
        workspace: 'workspace-gid',
        projects: ['project-gid'],
        due_on: '2026-06-26',
      }),
    );
  });

  it('includes the deal id and name in the notes', async () => {
    const createTask = vi.fn().mockResolvedValue({ data: { gid: 'task-1' } });
    const asana = { createTask };

    await createCuantificacionTask(asana, config, deal);

    const payload = createTask.mock.calls[0][0];
    expect(payload.notes).toContain('Acme Corp');
    expect(payload.notes).toContain('deal-1');
  });

  it('falls back to "Sin nombre" when dealname is missing', async () => {
    const createTask = vi.fn().mockResolvedValue({ data: { gid: 'task-1' } });
    const asana = { createTask };

    await createCuantificacionTask(asana, config, { id: 'deal-2', properties: {} });

    const payload = createTask.mock.calls[0][0];
    expect(payload.name).toBe('Cuantificación - Sin nombre');
  });
});
