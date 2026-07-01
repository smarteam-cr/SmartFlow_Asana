import { ObjectId } from 'mongodb';

function mapLogDoc(doc) {
  return {
    id: String(doc._id),
    source: doc.source || '-',
    event_type: doc.event_type ?? null,
    status: doc.status || '-',
    message: doc.message ?? null,
    payload: doc.payload ?? null,
    created_at: doc.created_at ?? null,
  };
}

export async function saveLog(db, source, status, message, eventType = null, payload = null) {
  await db.collection('integration_logs').insertOne({
    source,
    event_type: eventType,
    status,
    message,
    payload,
    created_at: new Date(),
  });
}

export async function countLogs(db) {
  return db.collection('integration_logs').countDocuments();
}

export async function getLogsPaginated(db, limit = 10, offset = 0) {
  const docs = await db
    .collection('integration_logs')
    .find({})
    .sort({ _id: -1 })
    .skip(offset)
    .limit(limit)
    .toArray();

  return docs.map(mapLogDoc);
}

export async function deleteLog(db, id) {
  await db.collection('integration_logs').deleteOne({ _id: new ObjectId(id) });
}

export async function deleteLogsBulk(db, ids) {
  const objectIds = ids.filter(Boolean).map((id) => new ObjectId(id));
  if (objectIds.length === 0) return;

  await db.collection('integration_logs').deleteMany({ _id: { $in: objectIds } });
}

export async function deleteAllLogs(db) {
  await db.collection('integration_logs').deleteMany({});
}
