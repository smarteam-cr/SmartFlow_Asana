export async function ensureIndexes(db) {
  await db.collection('sync_tasks').createIndex({ asana_task_id: 1 }, { unique: true });
  await db.collection('sync_tasks').createIndex({ hubspot_deal_id: 1, type: 1 });
  await db.collection('integration_logs').createIndex({ created_at: -1 });
}
