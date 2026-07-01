db = db.getSiblingDB('asana_hubspot');

db.sync_tasks.createIndex({ asana_task_id: 1 }, { unique: true });
db.sync_tasks.createIndex({ hubspot_deal_id: 1, type: 1 });
db.integration_logs.createIndex({ created_at: -1 });
