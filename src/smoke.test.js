import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDb, closeDb } from './db/client.js';
import { ensureIndexes } from './db/indexes.js';
import { buildApp } from './app.js';

const config = {
  appUrl: 'https://app.example.com',
  port: 3000,
  hubspotToken: 'pat-test',
  hubspotStageAnalisis: 'qualifiedtobuy',
  hubspotStagePropuesta: 'presentationscheduled',
  hubspotStageGanada: 'closedwon',
  asanaToken: 'asana-test',
  asanaWorkspaceGid: '1',
  asanaProjectGid: '2',
  asanaBreinerUserGid: '3',
  asanaPlanosProjectGid: '4',
  asanaPlanosSectionGid: '5',
  asanaPlanosAssigneeGid: '6',
  asanaVentasProjectGid: '7',
  asanaHubspotOwnerMap: {},
  asanaHubspotTagName: 'HubSpot',
};

let mongod;
let client;
let app;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  const conn = await connectDb(mongod.getUri(), 'smoke_test');
  client = conn.client;
  await ensureIndexes(conn.db);
  app = buildApp(conn.db, config);
}, 30000); // ponytail: real mongod binary startup under parallel test load can exceed the 10s default

afterAll(async () => {
  if (client) await closeDb(client);
  if (mongod) await mongod.stop();
}, 30000);

describe('app boot smoke test', () => {
  it('responds to the health check', async () => {
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, message: 'Servicio activo', path: '/' });
  });

  it('returns Fastify 404 for an unknown route', async () => {
    const res = await app.inject({ method: 'GET', url: '/ruta-inexistente' });
    expect(res.statusCode).toBe(404);
  });

  it('renders the admin panel without crashing even if external APIs are unreachable', async () => {
    const res = await app.inject({ method: 'GET', url: '/panel' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Panel Integración HubSpot + Asana');
  });
});
