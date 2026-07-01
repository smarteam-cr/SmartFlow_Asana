import { describe, it, expect, vi } from 'vitest';
import { createHubspotService } from './hubspot.js';

const config = { hubspotToken: 'hubspot-token-test' };

function makeRequestMock(impl) {
  return vi.fn(impl);
}

describe('createHubspotService', () => {
  it('moves a deal to a target stage via PATCH', async () => {
    const requestFn = makeRequestMock(async () => ({ id: 'deal-1' }));
    const hubspot = createHubspotService(config, requestFn);

    await hubspot.updateDealStage('deal-1', 'presentationscheduled');

    const [baseUrl, method, path, options] = requestFn.mock.calls[0];
    expect(baseUrl).toBe('https://api.hubapi.com');
    expect(method).toBe('PATCH');
    expect(path).toBe('/crm/v3/objects/deals/deal-1');
    expect(JSON.parse(options.body)).toEqual({ properties: { dealstage: 'presentationscheduled' } });
    expect(options.headers.Authorization).toBe('Bearer hubspot-token-test');
  });

  it('paginates through all owners using the after cursor', async () => {
    const requestFn = makeRequestMock(async (_base, _method, path) => {
      if (!path.includes('after=')) {
        return { results: [{ id: '1' }], paging: { next: { after: 'cursor-1' } } };
      }
      return { results: [{ id: '2' }] };
    });
    const hubspot = createHubspotService(config, requestFn);

    const owners = await hubspot.listOwners();

    expect(owners).toEqual([{ id: '1' }, { id: '2' }]);
    expect(requestFn).toHaveBeenCalledTimes(2);
  });

  it('creates a pending task with NOT_STARTED/MEDIUM defaults', async () => {
    const requestFn = makeRequestMock(async () => ({ id: 'task-1' }));
    const hubspot = createHubspotService(config, requestFn);

    await hubspot.createTask({
      hs_timestamp: '2026-07-01T17:00:00-05:00',
      hs_task_subject: '[Operaciones] Tarea',
      hs_task_body: 'cuerpo',
      hs_task_status: 'NOT_STARTED',
      hs_task_priority: 'MEDIUM',
      hs_task_type: 'TODO',
      hubspot_owner_id: 'owner-1',
    });

    const [, method, path, options] = requestFn.mock.calls[0];
    expect(method).toBe('POST');
    expect(path).toBe('/crm/v3/objects/tasks');
    expect(JSON.parse(options.body).properties.hs_task_status).toBe('NOT_STARTED');
  });

  it('creates a completed task associated to a deal with associationTypeId 216', async () => {
    const requestFn = makeRequestMock(async () => ({ id: 'task-2' }));
    const hubspot = createHubspotService(config, requestFn);

    await hubspot.createCompletedDealTaskWithAssociation('deal-9', 'Planos finalizados', 'cuerpo final');

    const [, , , options] = requestFn.mock.calls[0];
    const body = JSON.parse(options.body);

    expect(body.properties.hs_task_status).toBe('COMPLETED');
    expect(body.properties.hs_task_priority).toBe('LOW');
    expect(body.associations).toEqual([
      {
        to: { id: 'deal-9' },
        types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 216 }],
      },
    ]);
  });
});
