import { request } from '../lib/httpClient.js';

const BASE_URL = 'https://app.asana.com/api/1.0';

const FULL_TASK_FIELDS = [
  'gid',
  'name',
  'notes',
  'html_notes',
  'due_on',
  'due_at',
  'completed',
  'permalink_url',
  'assignee.gid',
  'assignee.name',
  'assignee.email',
  'memberships.project.gid',
  'memberships.project.name',
  'memberships.section.gid',
  'memberships.section.name',
  'tags.gid',
  'tags.name',
].join(',');

const STORY_FIELDS = [
  'gid',
  'type',
  'resource_subtype',
  'text',
  'html_text',
  'created_at',
  'created_by.gid',
  'created_by.name',
].join(',');

const ATTACHMENT_FIELDS = [
  'gid',
  'name',
  'resource_type',
  'download_url',
  'permanent_url',
  'created_at',
  'host',
].join(',');

const PROJECT_TASK_FIELDS = [
  'gid',
  'name',
  'completed',
  'assignee.gid',
  'assignee.name',
  'assignee.email',
  'due_on',
  'due_at',
  'tags.gid',
  'tags.name',
  'memberships.project.gid',
  'memberships.project.name',
  'memberships.section.gid',
  'memberships.section.name',
].join(',');

export function createAsanaService(config, requestFn = request) {
  const headers = {
    Authorization: `Bearer ${config.asanaToken}`,
    'Content-Type': 'application/json',
  };

  async function asanaRequest(method, endpoint, data) {
    const body = data !== undefined ? JSON.stringify({ data }) : undefined;
    return requestFn(BASE_URL, method, endpoint, { headers, body });
  }

  return {
    getCurrentUser: () => asanaRequest('GET', '/users/me'),

    createTask: (data) => asanaRequest('POST', '/tasks', data),

    getTask: (taskGid) => asanaRequest('GET', `/tasks/${taskGid}?opt_fields=gid,name,completed`),

    getTaskFullDetails: (taskGid) =>
      asanaRequest('GET', `/tasks/${taskGid}?opt_fields=${encodeURIComponent(FULL_TASK_FIELDS)}`),

    getTaskStories: (taskGid, limit = 10) =>
      asanaRequest(
        'GET',
        `/tasks/${taskGid}/stories?limit=${limit}&opt_fields=${encodeURIComponent(STORY_FIELDS)}`,
      ),

    getTaskAttachments: (taskGid, limit = 10) =>
      asanaRequest(
        'GET',
        `/tasks/${taskGid}/attachments?limit=${limit}&opt_fields=${encodeURIComponent(ATTACHMENT_FIELDS)}`,
      ),

    getUser: (userGid) => asanaRequest('GET', `/users/${userGid}?opt_fields=gid,name,email`),

    listProjectSections: (projectGid) => asanaRequest('GET', `/projects/${projectGid}/sections`),

    listProjectTasks: (projectGid, limit = 100) => {
      const cappedLimit = Math.max(1, Math.min(limit, 100));
      return asanaRequest(
        'GET',
        `/projects/${projectGid}/tasks?limit=${cappedLimit}&completed_since=now&opt_fields=${encodeURIComponent(PROJECT_TASK_FIELDS)}`,
      );
    },

    createWebhook: (resource, target, filters) =>
      asanaRequest('POST', '/webhooks', filters ? { resource, target, filters } : { resource, target }),

    listWebhooks: (workspaceGid) => asanaRequest('GET', `/webhooks?workspace=${workspaceGid}`),

    deleteWebhook: (webhookGid) => asanaRequest('DELETE', `/webhooks/${webhookGid}`),

    addTaskComment: (taskGid, text) => asanaRequest('POST', `/tasks/${taskGid}/stories`, { text }),
  };
}
