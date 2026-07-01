import { request } from '../lib/httpClient.js';

const BASE_URL = 'https://api.hubapi.com';

export function createHubspotService(config, requestFn = request) {
  const headers = {
    Authorization: `Bearer ${config.hubspotToken}`,
    'Content-Type': 'application/json',
  };

  async function hubspotRequest(method, endpoint, data) {
    const body = data !== undefined ? JSON.stringify(data) : undefined;
    return requestFn(BASE_URL, method, endpoint, { headers, body });
  }

  return {
    testConnection: () =>
      hubspotRequest('GET', '/crm/v3/objects/deals?limit=1&properties=dealname,dealstage'),

    getDeal: (dealId) =>
      hubspotRequest(
        'GET',
        `/crm/v3/objects/deals/${dealId}?properties=dealname,dealstage,hubspot_owner_id`,
      ),

    updateDealStage: (dealId, dealstage) =>
      hubspotRequest('PATCH', `/crm/v3/objects/deals/${dealId}`, { properties: { dealstage } }),

    async listOwners() {
      const owners = [];
      let after;

      do {
        const endpoint = after
          ? `/crm/v3/owners?limit=100&after=${encodeURIComponent(after)}`
          : '/crm/v3/owners?limit=100';

        const response = await hubspotRequest('GET', endpoint);
        owners.push(...(response.results ?? []));
        after = response.paging?.next?.after ?? null;
      } while (after);

      return owners;
    },

    createTask: (properties) => hubspotRequest('POST', '/crm/v3/objects/tasks', { properties }),

    updateTask: (taskId, properties) =>
      hubspotRequest('PATCH', `/crm/v3/objects/tasks/${taskId}`, { properties }),

    createCompletedDealTaskWithAssociation: (dealId, taskSubject, taskBody) =>
      hubspotRequest('POST', '/crm/v3/objects/tasks', {
        properties: {
          hs_timestamp: new Date().toISOString(),
          hs_task_subject: taskSubject,
          hs_task_body: taskBody,
          hs_task_status: 'COMPLETED',
          hs_task_priority: 'LOW',
          hs_task_type: 'TODO',
        },
        associations: [
          {
            to: { id: dealId },
            types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 216 }],
          },
        ],
      }),
  };
}
