import { ObjectId } from 'mongodb';

function mapSyncDoc(doc) {
  return {
    id: String(doc._id),
    hubspot_deal_id: doc.hubspot_deal_id ?? null,
    asana_task_id: doc.asana_task_id ?? null,
    hubspot_task_id: doc.hubspot_task_id ?? null,
    type: doc.type || 'cuantificacion',
    status: doc.status || 'pending',
    created_at: doc.created_at ?? null,
    updated_at: doc.updated_at ?? null,
  };
}

export async function saveSyncTask(db, dealId, asanaTaskId, type = 'cuantificacion') {
  await db.collection('sync_tasks').insertOne({
    hubspot_deal_id: dealId,
    asana_task_id: asanaTaskId,
    hubspot_task_id: null,
    type: type.trim() || 'cuantificacion',
    status: 'pending',
    created_at: new Date(),
    updated_at: null,
  });
}

export async function existsSyncForDeal(db, dealId, type = 'cuantificacion') {
  const doc = await db
    .collection('sync_tasks')
    .findOne({ hubspot_deal_id: dealId, type }, { projection: { _id: 1 } });

  return doc !== null;
}

export async function findSyncByAsanaTask(db, asanaTaskId) {
  const doc = await db.collection('sync_tasks').findOne({ asana_task_id: asanaTaskId });
  return doc ? mapSyncDoc(doc) : null;
}

export async function markSyncCompleted(db, id) {
  await db
    .collection('sync_tasks')
    .updateOne({ _id: new ObjectId(id) }, { $set: { status: 'completed', updated_at: new Date() } });
}

export async function saveOperationsVentasSync(db, asanaTaskId, hubspotTaskId) {
  await db.collection('sync_tasks').updateOne(
    { asana_task_id: asanaTaskId },
    {
      $set: {
        hubspot_task_id: hubspotTaskId,
        type: 'operaciones_ventas',
        status: 'pending',
        updated_at: new Date(),
      },
      $setOnInsert: {
        hubspot_deal_id: 'SIN_ASOCIAR',
        created_at: new Date(),
      },
    },
    { upsert: true },
  );
}

export async function countSyncTasks(db) {
  return db.collection('sync_tasks').countDocuments();
}

export async function getSyncTasksPaginated(db, limit = 10, offset = 0) {
  const docs = await db
    .collection('sync_tasks')
    .find({})
    .sort({ _id: -1 })
    .skip(offset)
    .limit(limit)
    .toArray();

  return docs.map(mapSyncDoc);
}

export async function deleteSyncTask(db, id) {
  await db.collection('sync_tasks').deleteOne({ _id: new ObjectId(id) });
}

export async function deleteSyncTasksBulk(db, ids) {
  const objectIds = ids.filter(Boolean).map((id) => new ObjectId(id));
  if (objectIds.length === 0) return;

  await db.collection('sync_tasks').deleteMany({ _id: { $in: objectIds } });
}

export async function deleteAllSyncTasks(db) {
  await db.collection('sync_tasks').deleteMany({});
}
