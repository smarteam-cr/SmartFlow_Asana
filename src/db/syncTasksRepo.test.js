import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDb, closeDb } from './client.js';
import {
  saveSyncTask,
  existsSyncForDeal,
  findSyncByAsanaTask,
  markSyncCompleted,
  saveOperationsVentasSync,
  getSyncTasksPaginated,
  countSyncTasks,
  deleteSyncTask,
  deleteSyncTasksBulk,
  deleteAllSyncTasks,
} from './syncTasksRepo.js';

let mongod;
let client;
let db;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  const conn = await connectDb(mongod.getUri(), 'test_sync_tasks');
  client = conn.client;
  db = conn.db;
}, 30000); // ponytail: real mongod binary startup under parallel test load can exceed the 10s default

afterAll(async () => {
  if (client) await closeDb(client);
  if (mongod) await mongod.stop();
}, 30000);

beforeEach(async () => {
  await db.collection('sync_tasks').deleteMany({});
});

describe('syncTasksRepo', () => {
  it('saves a sync task and finds it by asana task id', async () => {
    await saveSyncTask(db, 'deal-1', 'task-1', 'cuantificacion');

    const found = await findSyncByAsanaTask(db, 'task-1');

    expect(found).not.toBeNull();
    expect(found.hubspot_deal_id).toBe('deal-1');
    expect(found.asana_task_id).toBe('task-1');
    expect(found.hubspot_task_id).toBeNull();
    expect(found.type).toBe('cuantificacion');
    expect(found.status).toBe('pending');
  });

  it('stores and returns the recorded hubspot_target_stage', async () => {
    await saveSyncTask(db, 'deal-gt', 'task-gt', 'cuantificacion', '1294745902');

    const found = await findSyncByAsanaTask(db, 'task-gt');
    expect(found.hubspot_target_stage).toBe('1294745902');
  });

  it('defaults hubspot_target_stage to null when not provided', async () => {
    await saveSyncTask(db, 'deal-1b', 'task-1b', 'cuantificacion');

    const found = await findSyncByAsanaTask(db, 'task-1b');
    expect(found.hubspot_target_stage).toBeNull();
  });

  it('reports existsSyncForDeal correctly', async () => {
    await saveSyncTask(db, 'deal-2', 'task-2', 'planos_despiece');

    expect(await existsSyncForDeal(db, 'deal-2', 'planos_despiece')).toBe(true);
    expect(await existsSyncForDeal(db, 'deal-2', 'cuantificacion')).toBe(false);
    expect(await existsSyncForDeal(db, 'deal-unknown', 'planos_despiece')).toBe(false);
  });

  it('marks a sync as completed', async () => {
    await saveSyncTask(db, 'deal-3', 'task-3', 'cuantificacion');
    const found = await findSyncByAsanaTask(db, 'task-3');

    await markSyncCompleted(db, found.id);

    const updated = await findSyncByAsanaTask(db, 'task-3');
    expect(updated.status).toBe('completed');
    expect(updated.updated_at).not.toBeNull();
  });

  it('upserts operaciones_ventas sync with SIN_ASOCIAR placeholder on insert', async () => {
    await saveOperationsVentasSync(db, 'task-4', 'hs-task-1');

    const found = await findSyncByAsanaTask(db, 'task-4');
    expect(found.hubspot_deal_id).toBe('SIN_ASOCIAR');
    expect(found.hubspot_task_id).toBe('hs-task-1');
    expect(found.type).toBe('operaciones_ventas');
    expect(found.status).toBe('pending');
  });

  it('upserts operaciones_ventas sync again without resetting hubspot_deal_id', async () => {
    await saveOperationsVentasSync(db, 'task-5', 'hs-task-2');
    await saveOperationsVentasSync(db, 'task-5', 'hs-task-2-updated');

    const found = await findSyncByAsanaTask(db, 'task-5');
    expect(found.hubspot_deal_id).toBe('SIN_ASOCIAR');
    expect(found.hubspot_task_id).toBe('hs-task-2-updated');
  });

  it('paginates and counts sync tasks', async () => {
    for (let i = 0; i < 15; i++) {
      await saveSyncTask(db, `deal-p${i}`, `task-p${i}`, 'cuantificacion');
    }

    expect(await countSyncTasks(db)).toBe(15);

    const page1 = await getSyncTasksPaginated(db, 10, 0);
    expect(page1).toHaveLength(10);
  });

  it('deletes one, bulk, and all sync tasks', async () => {
    await saveSyncTask(db, 'deal-d1', 'task-d1', 'cuantificacion');
    await saveSyncTask(db, 'deal-d2', 'task-d2', 'cuantificacion');
    await saveSyncTask(db, 'deal-d3', 'task-d3', 'cuantificacion');

    const one = await findSyncByAsanaTask(db, 'task-d1');
    await deleteSyncTask(db, one.id);
    expect(await countSyncTasks(db)).toBe(2);

    const two = await findSyncByAsanaTask(db, 'task-d2');
    const three = await findSyncByAsanaTask(db, 'task-d3');
    await deleteSyncTasksBulk(db, [two.id, three.id]);
    expect(await countSyncTasks(db)).toBe(0);

    await saveSyncTask(db, 'deal-d4', 'task-d4', 'cuantificacion');
    await deleteAllSyncTasks(db);
    expect(await countSyncTasks(db)).toBe(0);
  });
});
