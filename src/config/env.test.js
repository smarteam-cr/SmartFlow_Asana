import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from './env.js';

const REQUIRED = {
  MONGO_URI: 'mongodb://localhost:27017',
  MONGO_DB: 'asana_hubspot_test',
  HUBSPOT_TOKEN: 'pat-test',
  HUBSPOT_STAGE_ANALISIS: 'qualifiedtobuy',
  HUBSPOT_STAGE_PROPUESTA: 'presentationscheduled',
  HUBSPOT_STAGE_GANADA: 'closedwon',
  ASANA_TOKEN: 'asana-test-token',
  ASANA_WORKSPACE_GID: '111',
  ASANA_PROJECT_GID: '222',
  ASANA_CUANTIFICACION_ASSIGNEE_GID: '333',
  ASANA_PLANOS_PROJECT_GID: '444',
  ASANA_PLANOS_SECTION_GID: '555',
  ASANA_PLANOS_ASSIGNEE_GID: '666',
  ASANA_VENTAS_PROJECT_GID: '777',
};

let originalEnv;

beforeEach(() => {
  originalEnv = { ...process.env };
});

afterEach(() => {
  process.env = originalEnv;
});

describe('loadConfig', () => {
  it('loads all required variables successfully', () => {
    Object.assign(process.env, REQUIRED);
    const config = loadConfig();

    expect(config.mongoUri).toBe('mongodb://localhost:27017');
    expect(config.hubspotToken).toBe('pat-test');
    expect(config.asanaWorkspaceGid).toBe('111');
  });

  it('throws if a required variable is missing', () => {
    const partial = { ...REQUIRED };
    delete partial.HUBSPOT_TOKEN;
    Object.keys(process.env).forEach((key) => delete process.env[key]);
    Object.assign(process.env, partial);

    expect(() => loadConfig()).toThrow(/HUBSPOT_TOKEN/);
  });

  it('applies defaults for optional variables', () => {
    Object.assign(process.env, REQUIRED);
    delete process.env.PORT;
    delete process.env.ASANA_HUBSPOT_TAG_NAME;
    delete process.env.ASANA_HUBSPOT_OWNER_MAP;

    const config = loadConfig();

    expect(config.port).toBe(3005);
    expect(config.asanaHubspotTagName).toBe('HubSpot');
    expect(config.asanaHubspotOwnerMap).toEqual({});
  });

  it('parses a single stage value into a one-item array', () => {
    Object.assign(process.env, REQUIRED);
    const config = loadConfig();

    expect(config.hubspotStageAnalisis).toEqual(['qualifiedtobuy']);
    expect(config.hubspotStageGanada).toEqual(['closedwon']);
  });

  it('parses comma-separated stage values into arrays, one id per pipeline', () => {
    Object.assign(process.env, REQUIRED, {
      HUBSPOT_STAGE_ANALISIS: 'qualifiedtobuy,1294745901',
      HUBSPOT_STAGE_PROPUESTA: 'presentationscheduled,1294745902',
      HUBSPOT_STAGE_GANADA: 'closedwon,1294745905',
    });

    const config = loadConfig();

    expect(config.hubspotStageAnalisis).toEqual(['qualifiedtobuy', '1294745901']);
    expect(config.hubspotStageGanada).toEqual(['closedwon', '1294745905']);
    expect(config.hubspotStagePropuestaMap.get('qualifiedtobuy')).toBe('presentationscheduled');
    expect(config.hubspotStagePropuestaMap.get('1294745901')).toBe('1294745902');
  });
});
