import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDb, closeDb } from './client.js';
import {
  saveLog,
  countLogs,
  getLogsPaginated,
  deleteLog,
  deleteLogsBulk,
  deleteAllLogs,
} from './logsRepo.js';

let mongod;
let client;
let db;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  const conn = await connectDb(mongod.getUri(), 'test_logs');
  client = conn.client;
  db = conn.db;
}, 30000); // ponytail: real mongod binary startup under parallel test load can exceed the 10s default

afterAll(async () => {
  if (client) await closeDb(client);
  if (mongod) await mongod.stop();
}, 30000);

beforeEach(async () => {
  await db.collection('integration_logs').deleteMany({});
});

describe('logsRepo', () => {
  it('saves a log with payload stored as a native object', async () => {
    await saveLog(db, 'hubspot', 'success', 'Tarea creada', 'cuantificacion', { deal_id: '123' });

    const [log] = await getLogsPaginated(db, 10, 0);
    expect(log.source).toBe('hubspot');
    expect(log.status).toBe('success');
    expect(log.message).toBe('Tarea creada');
    expect(log.event_type).toBe('cuantificacion');
    expect(log.payload).toEqual({ deal_id: '123' });
  });

  it('saves a log without payload as null', async () => {
    await saveLog(db, 'system', 'error', 'Algo fallo');

    const [log] = await getLogsPaginated(db, 10, 0);
    expect(log.payload).toBeNull();
  });

  it('counts and paginates logs newest first', async () => {
    for (let i = 0; i < 12; i++) {
      await saveLog(db, 'asana', 'received', `evento-${i}`);
    }

    expect(await countLogs(db)).toBe(12);

    const page1 = await getLogsPaginated(db, 10, 0);
    expect(page1).toHaveLength(10);
    expect(page1[0].message).toBe('evento-11');
  });

  it('deletes one, bulk, and all logs', async () => {
    await saveLog(db, 'asana', 'received', 'log-1');
    await saveLog(db, 'asana', 'received', 'log-2');
    await saveLog(db, 'asana', 'received', 'log-3');

    const all = await getLogsPaginated(db, 10, 0);
    await deleteLog(db, all[0].id);
    expect(await countLogs(db)).toBe(2);

    const remaining = await getLogsPaginated(db, 10, 0);
    await deleteLogsBulk(db, remaining.map((l) => l.id));
    expect(await countLogs(db)).toBe(0);

    await saveLog(db, 'asana', 'received', 'log-4');
    await deleteAllLogs(db);
    expect(await countLogs(db)).toBe(0);
  });
});
