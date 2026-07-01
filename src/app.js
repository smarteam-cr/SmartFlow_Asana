import Fastify from 'fastify';
import { createAsanaService } from './services/asana.js';
import { createHubspotService } from './services/hubspot.js';
import { createOperacionesVentasService } from './services/operacionesVentas.js';
import { createCuantificacionTask } from './services/cuantificacion.js';
import { createPlanosDespieceTask } from './services/planosDespiece.js';
import * as syncTasksRepo from './db/syncTasksRepo.js';
import * as logsRepo from './db/logsRepo.js';
import { registerHealth } from './routes/health.js';
import { registerHubspotWebhook } from './routes/hubspotWebhook.js';
import { registerAsanaWebhook } from './routes/asanaWebhook.js';
import { registerAdminWebhooks } from './routes/adminWebhooks.js';
import { registerAdminDebug } from './routes/adminDebug.js';
import { registerPanel } from './routes/panel.js';

export function buildApp(db, config) {
  const app = Fastify();

  const asana = createAsanaService(config);
  const hubspot = createHubspotService(config);

  const saveLog = (...args) => logsRepo.saveLog(db, ...args);
  const findSyncByAsanaTask = (...args) => syncTasksRepo.findSyncByAsanaTask(db, ...args);
  const saveOpVentasSync = (...args) => syncTasksRepo.saveOperationsVentasSync(db, ...args);

  const operacionesVentasService = createOperacionesVentasService({
    asana,
    hubspot,
    config,
    saveLog,
    findSync: findSyncByAsanaTask,
    saveOpVentasSync,
  });

  const cuantificacionService = {
    createCuantificacionTask: (deal) => createCuantificacionTask(asana, config, deal),
  };

  const planosService = {
    createPlanosDespieceTask: (deal) => createPlanosDespieceTask(asana, config, deal),
  };

  const deps = {
    config,
    asana,
    hubspot,
    cuantificacionService,
    planosService,
    operacionesVentasService,
    existsSyncForDeal: (...args) => syncTasksRepo.existsSyncForDeal(db, ...args),
    saveSyncTask: (...args) => syncTasksRepo.saveSyncTask(db, ...args),
    findSyncByAsanaTask,
    markSyncCompleted: (...args) => syncTasksRepo.markSyncCompleted(db, ...args),
    saveLog,
    db,
    countSyncTasks: (...args) => syncTasksRepo.countSyncTasks(db, ...args),
    getSyncTasksPaginated: (...args) => syncTasksRepo.getSyncTasksPaginated(db, ...args),
    deleteSyncTask: (...args) => syncTasksRepo.deleteSyncTask(db, ...args),
    deleteSyncTasksBulk: (...args) => syncTasksRepo.deleteSyncTasksBulk(db, ...args),
    deleteAllSyncTasks: (...args) => syncTasksRepo.deleteAllSyncTasks(db, ...args),
    countLogs: (...args) => logsRepo.countLogs(db, ...args),
    getLogsPaginated: (...args) => logsRepo.getLogsPaginated(db, ...args),
    deleteLog: (...args) => logsRepo.deleteLog(db, ...args),
    deleteLogsBulk: (...args) => logsRepo.deleteLogsBulk(db, ...args),
    deleteAllLogs: (...args) => logsRepo.deleteAllLogs(db, ...args),
  };

  registerHealth(app);
  registerHubspotWebhook(app, deps);
  registerAsanaWebhook(app, deps);
  registerAdminWebhooks(app, deps);
  registerAdminDebug(app, deps);
  registerPanel(app, deps);

  return app;
}
