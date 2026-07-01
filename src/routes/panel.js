import { renderSyncTable, renderLogsTable, renderPanelPage } from './panel.html.js';

const PER_PAGE = 10;

export function registerPanel(app, deps) {
  const {
    hubspot,
    asana,
    countSyncTasks,
    getSyncTasksPaginated,
    deleteSyncTask,
    deleteSyncTasksBulk,
    deleteAllSyncTasks,
    countLogs,
    getLogsPaginated,
    deleteLog,
    deleteLogsBulk,
    deleteAllLogs,
  } = deps;

  async function buildSyncFragment(page) {
    const total = await countSyncTasks();
    const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
    const safePage = Math.max(1, Math.min(page, totalPages));
    const tasks = await getSyncTasksPaginated(PER_PAGE, (safePage - 1) * PER_PAGE);
    return renderSyncTable(tasks, total, safePage, totalPages);
  }

  async function buildLogsFragment(page) {
    const total = await countLogs();
    const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
    const safePage = Math.max(1, Math.min(page, totalPages));
    const logs = await getLogsPaginated(PER_PAGE, (safePage - 1) * PER_PAGE);
    return renderLogsTable(logs, total, safePage, totalPages);
  }

  app.get('/panel', async (req, reply) => {
    const ajax = req.query?.ajax;
    const page = Number(req.query?.page) || 1;

    if (ajax === 'sync') {
      return { ok: true, html: await buildSyncFragment(page) };
    }

    if (ajax === 'logs') {
      return { ok: true, html: await buildLogsFragment(page) };
    }

    let hubspotStatus = { ok: false, message: 'No probado' };
    try {
      await hubspot.testConnection();
      hubspotStatus = { ok: true, message: 'Conectado correctamente' };
    } catch (error) {
      hubspotStatus = { ok: false, message: error.message };
    }

    let asanaStatus = { ok: false, message: 'No probado' };
    try {
      const me = await asana.getCurrentUser();
      asanaStatus = { ok: true, message: `Conectado como ${me.data?.name || 'Usuario Asana'}` };
    } catch (error) {
      asanaStatus = { ok: false, message: error.message };
    }

    const syncPage = Number(req.query?.sync_page) || 1;
    const logsPage = Number(req.query?.log_page) || 1;

    const html = renderPanelPage({
      hubspotStatus,
      asanaStatus,
      syncHtml: await buildSyncFragment(syncPage),
      logsHtml: await buildLogsFragment(logsPage),
      syncPage,
      logsPage,
    });

    reply.type('text/html');
    return html;
  });

  app.post('/panel', async (req) => {
    const { ajax_action: action, type } = req.body || {};

    if (action === 'delete_one') {
      const id = String(req.body.id || '');
      if (type === 'sync') await deleteSyncTask(id);
      else if (type === 'logs') await deleteLog(id);
      else return { ok: false, message: 'Tipo no válido.' };
      return { ok: true, message: 'Registro eliminado correctamente.' };
    }

    if (action === 'delete_selected') {
      const ids = req.body.ids || [];
      if (type === 'sync') await deleteSyncTasksBulk(ids);
      else if (type === 'logs') await deleteLogsBulk(ids);
      else return { ok: false, message: 'Tipo no válido.' };
      return { ok: true, message: 'Registros seleccionados eliminados correctamente.' };
    }

    if (action === 'delete_all') {
      if (type === 'sync') await deleteAllSyncTasks();
      else if (type === 'logs') await deleteAllLogs();
      else return { ok: false, message: 'Tipo no válido.' };
      return { ok: true, message: 'Registros eliminados correctamente.' };
    }

    return { ok: false, message: 'Acción no válida.' };
  });
}
