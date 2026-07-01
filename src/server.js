import { loadConfig } from './config/env.js';
import { connectDb } from './db/client.js';
import { ensureIndexes } from './db/indexes.js';
import { buildApp } from './app.js';

async function main() {
  const config = loadConfig();
  const { db } = await connectDb(config.mongoUri, config.mongoDb);
  await ensureIndexes(db);

  const app = buildApp(db, config);
  await app.listen({ port: config.port, host: '0.0.0.0' });

  console.log(`Servidor escuchando en el puerto ${config.port}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
