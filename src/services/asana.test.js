import { describe, it, expect, vi } from 'vitest';
import { createAsanaService } from './asana.js';

const config = { asanaToken: 'asana-token-test' };

function makeRequestMock(returnValue = { data: {} }) {
  return vi.fn().mockResolvedValue(returnValue);
}

describe('createAsanaService', () => {
  it('wraps task creation payload in a data envelope with Bearer auth', async () => {
    const requestFn = makeRequestMock({ data: { gid: 'task-1' } });
    const asana = createAsanaService(config, requestFn);

    const result = await asana.createTask({ name: 'Cuantificación - Acme', due_on: '2026-07-01' });

    expect(result).toEqual({ data: { gid: 'task-1' } });
    expect(requestFn).toHaveBeenCalledWith(
      'https://app.asana.com/api/1.0',
      'POST',
      '/tasks',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer asana-token-test' }),
        body: JSON.stringify({ data: { name: 'Cuantificación - Acme', due_on: '2026-07-01' } }),
      }),
    );
  });

  it('requests full task details with the exact PHP-equivalent opt_fields', async () => {
    const requestFn = makeRequestMock();
    const asana = createAsanaService(config, requestFn);

    await asana.getTaskFullDetails('task-99');

    const [, method, path] = requestFn.mock.calls[0];
    expect(method).toBe('GET');
    expect(path).toContain('/tasks/task-99?opt_fields=');
    expect(decodeURIComponent(path)).toContain('assignee.gid,assignee.name,assignee.email');
    expect(decodeURIComponent(path)).toContain('memberships.section.gid,memberships.section.name');
    expect(decodeURIComponent(path)).toContain('tags.gid,tags.name');
  });

  it('creates a webhook with filters for project-scoped registrations', async () => {
    const requestFn = makeRequestMock({ data: { gid: 'wh-1' } });
    const asana = createAsanaService(config, requestFn);

    await asana.createWebhook('proj-1', 'https://app.example.com/asana-webhook', [
      { resource_type: 'task', action: 'changed', fields: ['completed'] },
    ]);

    const [, , , options] = requestFn.mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({
      data: {
        resource: 'proj-1',
        target: 'https://app.example.com/asana-webhook',
        filters: [{ resource_type: 'task', action: 'changed', fields: ['completed'] }],
      },
    });
  });

  it('creates a webhook without filters when none are provided (ventas case)', async () => {
    const requestFn = makeRequestMock({ data: { gid: 'wh-2' } });
    const asana = createAsanaService(config, requestFn);

    await asana.createWebhook('proj-ventas', 'https://app.example.com/asana-webhook');

    const [, , , options] = requestFn.mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({
      data: { resource: 'proj-ventas', target: 'https://app.example.com/asana-webhook' },
    });
  });

  it('adds a comment to a task', async () => {
    const requestFn = makeRequestMock({ data: {} });
    const asana = createAsanaService(config, requestFn);

    await asana.addTaskComment('task-1', '✅ listo');

    const [, method, path, options] = requestFn.mock.calls[0];
    expect(method).toBe('POST');
    expect(path).toBe('/tasks/task-1/stories');
    expect(JSON.parse(options.body)).toEqual({ data: { text: '✅ listo' } });
  });

  it('issues a GET with no body for read-only endpoints', async () => {
    const requestFn = makeRequestMock({ data: {} });
    const asana = createAsanaService(config, requestFn);

    await asana.getCurrentUser();

    const [, method, path, options] = requestFn.mock.calls[0];
    expect(method).toBe('GET');
    expect(path).toBe('/users/me');
    expect(options.body).toBeUndefined();
  });
});
