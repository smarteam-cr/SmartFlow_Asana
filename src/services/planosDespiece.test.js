import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPlanosDespieceTask } from './planosDespiece.js';

const config = {
  asanaPlanosAssigneeGid: 'assignee-gid',
  asanaWorkspaceGid: 'workspace-gid',
  asanaPlanosProjectGid: 'planos-project-gid',
  asanaPlanosSectionGid: 'planos-section-gid',
};

const deal = { id: 'deal-1', properties: { dealname: 'Acme Corp' } };

describe('createPlanosDespieceTask', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-22T10:00:00')); // Monday
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates a task with memberships project+section and a +5 business day due date', async () => {
    const createTask = vi.fn().mockResolvedValue({ data: { gid: 'task-1' } });
    const asana = { createTask };

    const result = await createPlanosDespieceTask(asana, config, deal);

    expect(result).toEqual({ data: { gid: 'task-1' } });
    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Planos de despiece pdf y dwg - Acme Corp',
        assignee: 'assignee-gid',
        workspace: 'workspace-gid',
        memberships: [{ project: 'planos-project-gid', section: 'planos-section-gid' }],
        due_on: '2026-06-29',
      }),
    );
  });
});
