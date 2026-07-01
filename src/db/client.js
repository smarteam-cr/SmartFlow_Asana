import { MongoClient } from 'mongodb';

export async function connectDb(mongoUri, mongoDb) {
  const client = new MongoClient(mongoUri);
  await client.connect();
  return { client, db: client.db(mongoDb) };
}

export async function closeDb(client) {
  await client.close();
}
