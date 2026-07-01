import { escapeHtml as e } from '../lib/escapeHtml.js';

function badge(ok) {
  return ok ? '<span class="badge ok">OK</span>' : '<span class="badge error">ERROR</span>';
}

const STATUS_CLASS = {
  success: 'ok',
  completed: 'ok',
  error: 'error',
  warning: 'warning',
  ignored: 'muted',
  pending: 'pending',
  received: 'pending',
  test: 'pending',
};

function statusBadge(status) {
  const cls = STATUS_CLASS[status] || 'muted';
  return `<span class="badge ${e(cls)}">${e(status)}</span>`;
}

function buildPagination(type, currentPage, totalPages) {
  if (totalPages <= 1) return '';

  const pages = [1];
  const start = Math.max(2, currentPage);
  const end = Math.min(totalPages - 1, currentPage + 3);

  for (let i = start; i <= end; i++) pages.push(i);
  if (end < totalPages - 1) pages.push('...');
  if (totalPages > 1) pages.push(totalPages);

  const buttons = pages
    .map((page) => {
      if (page === '...') return '<span class="dots">...</span>';
      const active = page === currentPage ? 'active' : '';
      return `<button type="button" class="${active}" data-page="${e(page)}">${e(page)}</button>`;
    })
    .join('');

  return `<div class="pagination" data-type="${e(type)}">${buttons}</div>`;
}

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toISOString().slice(0, 19).replace('T', ' ');
}

export function renderSyncTable(syncTasks, total, page, totalPages) {
  const rows = syncTasks.length
    ? syncTasks
        .map(
          (task) => `
        <tr>
          <td class="check-col"><input type="checkbox" name="sync_ids[]" value="${e(task.id)}"></td>
          <td>${e(task.id)}</td>
          <td>
            <div class="compact-main">Deal ID</div>
            <div class="compact-sub">${e(task.hubspot_deal_id ?? '-')}</div>
          </td>
          <td>
            <div class="compact-main">Asana Task ID</div>
            <div class="compact-sub">${e(task.asana_task_id ?? '-')}</div>
            ${task.hubspot_task_id ? `<div class="compact-main" style="margin-top:8px;">HubSpot Task ID</div><div class="compact-sub">${e(task.hubspot_task_id)}</div>` : ''}
          </td>
          <td>${e(task.type ?? '-')}</td>
          <td>${statusBadge(String(task.status ?? '-'))}</td>
          <td>
            <div class="compact-main">Creado</div>
            <div class="compact-sub">${e(formatDate(task.created_at))}</div>
            ${task.updated_at ? `<div class="compact-main" style="margin-top:8px;">Actualizado</div><div class="compact-sub">${e(formatDate(task.updated_at))}</div>` : ''}
          </td>
          <td><button type="button" class="btn danger btn-delete-one" data-type="sync" data-id="${e(task.id)}">Borrar</button></td>
        </tr>`,
        )
        .join('')
    : '<tr><td colspan="8" class="empty">Aún no hay tareas sincronizadas.</td></tr>';

  return `
    <div class="section-header">
      <div>
        <h2>Tareas sincronizadas</h2>
        <div class="section-meta">Mostrando ${syncTasks.length} de ${e(total)} registros.</div>
      </div>
      ${buildPagination('sync', page, totalPages)}
    </div>
    <div class="table-card">
      <table>
        <thead>
          <tr>
            <th class="check-col"><input type="checkbox" onclick="toggleAll(this, 'sync_ids')"></th>
            <th class="id-col">ID</th>
            <th>Relación</th>
            <th>Detalle Asana / HubSpot</th>
            <th>Tipo</th>
            <th class="status-col">Estado</th>
            <th class="date-col">Fechas</th>
            <th class="actions-col">Acción</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="toolbar">
        <div class="actions-row">
          <button type="button" class="btn danger btn-delete-selected" data-type="sync">Borrar seleccionados</button>
          <button type="button" class="btn danger btn-delete-all" data-type="sync">Borrar todas</button>
        </div>
        ${buildPagination('sync', page, totalPages)}
      </div>
    </div>`;
}

export function renderLogsTable(logs, total, page, totalPages) {
  const rows = logs.length
    ? logs
        .map((log) => {
          const payload = log.payload;
          const payloadText = payload === null || payload === undefined
            ? null
            : typeof payload === 'string'
              ? payload
              : JSON.stringify(payload, null, 2);

          return `
        <tr>
          <td class="check-col"><input type="checkbox" name="log_ids[]" value="${e(log.id)}"></td>
          <td>${e(log.id)}</td>
          <td>
            <div class="compact-main">${e(log.event_type || '-')}</div>
            <div class="compact-sub">Origen: ${e(log.source || '-')}</div>
          </td>
          <td>${statusBadge(String(log.status || '-'))}</td>
          <td>${e(log.message ?? '-')}</td>
          <td class="payload">${payloadText ? `<details><summary>Ver payload</summary><pre>${e(payloadText)}</pre></details>` : '<span class="compact-sub">Sin payload</span>'}</td>
          <td class="nowrap">${e(formatDate(log.created_at))}</td>
          <td><button type="button" class="btn danger btn-delete-one" data-type="logs" data-id="${e(log.id)}">Borrar</button></td>
        </tr>`;
        })
        .join('')
    : '<tr><td colspan="8" class="empty">Aún no hay logs registrados.</td></tr>';

  return `
    <div class="section-header">
      <div>
        <h2>Logs recientes</h2>
        <div class="section-meta">Mostrando ${logs.length} de ${e(total)} registros.</div>
      </div>
      ${buildPagination('logs', page, totalPages)}
    </div>
    <div class="table-card">
      <table>
        <thead>
          <tr>
            <th class="check-col"><input type="checkbox" onclick="toggleAll(this, 'log_ids')"></th>
            <th class="id-col">ID</th>
            <th>Evento</th>
            <th class="status-col">Estado</th>
            <th>Mensaje</th>
            <th>Payload</th>
            <th class="date-col">Fecha</th>
            <th class="actions-col">Acción</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="toolbar">
        <div class="actions-row">
          <button type="button" class="btn danger btn-delete-selected" data-type="logs">Borrar seleccionados</button>
          <button type="button" class="btn danger btn-delete-all" data-type="logs">Borrar todo el log</button>
        </div>
        ${buildPagination('logs', page, totalPages)}
      </div>
    </div>`;
}

export function renderPanelPage({ hubspotStatus, asanaStatus, syncHtml, logsHtml, syncPage, logsPage }) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Panel Integración HubSpot + Asana</title>
<style>
* { box-sizing: border-box; }
body { font-family: Arial, sans-serif; background: #f4f6f8; margin: 0; padding: 24px; color: #111827; }
h1 { margin: 0 0 8px; font-size: 30px; }
.subtitle { color: #667085; margin-bottom: 24px; }
.grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-bottom: 24px; }
.card { background: #fff; border-radius: 14px; padding: 20px; box-shadow: 0 2px 10px rgba(15, 23, 42, .08); }
.card h2 { margin-top: 0; font-size: 22px; }
.badge { display: inline-block; padding: 5px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; white-space: nowrap; }
.ok { background: #d7f5df; color: #137333; }
.error { background: #fde2e1; color: #b3261e; }
.warning { background: #fff4ce; color: #8a5a00; }
.pending { background: #e0ecff; color: #1849a9; }
.muted { background: #eef2f6; color: #475467; }
.notice { display: none; padding: 12px 14px; border-radius: 10px; margin-bottom: 16px; background: #ecfdf3; color: #027a48; border: 1px solid #abefc6; }
.notice.error-box { background: #fef3f2; color: #b42318; border-color: #fecdca; }
.section-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 34px; margin-bottom: 12px; }
.section-header h2 { margin: 0; }
.section-meta { color: #667085; font-size: 13px; }
.table-card { background: #fff; border-radius: 14px; overflow: hidden; box-shadow: 0 2px 10px rgba(15, 23, 42, .08); margin-bottom: 22px; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; }
th, td { padding: 11px 10px; border-bottom: 1px solid #eef2f6; text-align: left; font-size: 13px; vertical-align: top; word-break: break-word; }
th { background: #111827; color: #fff; font-size: 12px; text-transform: uppercase; letter-spacing: .02em; }
.check-col { width: 42px; text-align: center; }
.id-col { width: 60px; }
.date-col { width: 150px; }
.status-col { width: 120px; }
.actions-col { width: 120px; }
.compact-main { font-weight: 700; color: #101828; }
.compact-sub { color: #667085; font-size: 12px; margin-top: 4px; }
details { background: #f8fafc; border: 1px solid #e4e7ec; border-radius: 8px; padding: 8px; }
summary { cursor: pointer; font-weight: 700; color: #344054; }
pre { white-space: pre-wrap; max-height: 160px; overflow: auto; margin: 8px 0 0; font-size: 12px; color: #344054; }
.toolbar { display: flex; gap: 8px; justify-content: space-between; align-items: center; padding: 12px; background: #fff; border-top: 1px solid #eef2f6; }
.actions-row { display: flex; gap: 8px; flex-wrap: wrap; }
.btn { border: 0; background: #111827; color: #fff; padding: 8px 12px; border-radius: 8px; cursor: pointer; font-size: 13px; }
.btn.danger { background: #b42318; }
.pagination { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; }
.pagination button { padding: 7px 10px; background: #fff; color: #344054; border: 1px solid #d0d5dd; border-radius: 8px; cursor: pointer; font-size: 13px; }
.pagination button.active { background: #111827; color: #fff; border-color: #111827; }
.pagination .dots { padding: 7px 10px; color: #667085; }
.empty { padding: 18px; color: #667085; }
.nowrap { white-space: nowrap; }
.loading { opacity: .55; pointer-events: none; }
@media (max-width: 900px) {
  body { padding: 14px; }
  .grid { grid-template-columns: 1fr; }
  .table-card { overflow-x: auto; }
  table { min-width: 950px; }
  .section-header { align-items: flex-start; flex-direction: column; }
}
</style>
</head>
<body>
<h1>Panel Integración HubSpot + Asana</h1>
<div class="subtitle">Estado de conexión, sincronizaciones y registros recientes.</div>
<div id="notice" class="notice"></div>
<div class="grid">
  <div class="card"><h2>HubSpot</h2>${badge(hubspotStatus.ok)}<p>${e(hubspotStatus.message)}</p></div>
  <div class="card"><h2>Asana</h2>${badge(asanaStatus.ok)}<p>${e(asanaStatus.message)}</p></div>
</div>
<div id="sync-container">${syncHtml}</div>
<div id="logs-container">${logsHtml}</div>
<script>
let state = { syncPage: ${syncPage}, logsPage: ${logsPage} };
function showNotice(message, isError) {
  const box = document.getElementById('notice');
  box.textContent = message;
  box.className = isError ? 'notice error-box' : 'notice';
  box.style.display = 'block';
  setTimeout(() => { box.style.display = 'none'; }, 4000);
}
function toggleAll(source, name) {
  document.querySelectorAll('input[name="' + name + '[]"]').forEach((cb) => { cb.checked = source.checked; });
}
function getSelectedIds(type) {
  const name = type === 'sync' ? 'sync_ids' : 'log_ids';
  return Array.from(document.querySelectorAll('input[name="' + name + '[]"]:checked')).map((i) => i.value);
}
async function loadTable(type, page) {
  const container = document.getElementById(type === 'sync' ? 'sync-container' : 'logs-container');
  container.classList.add('loading');
  try {
    const response = await fetch('/panel?ajax=' + encodeURIComponent(type) + '&page=' + encodeURIComponent(page));
    const data = await response.json();
    if (!data.ok) { showNotice(data.message || 'Error cargando datos.', true); return; }
    container.innerHTML = data.html;
    if (type === 'sync') state.syncPage = page; else state.logsPage = page;
  } catch (error) {
    showNotice('Error AJAX: ' + error.message, true);
  } finally {
    container.classList.remove('loading');
  }
}
async function ajaxAction(action, type, extra) {
  extra = extra || {};
  try {
    const response = await fetch('/panel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ ajax_action: action, type }, extra)),
    });
    const data = await response.json();
    if (!data.ok) { showNotice(data.message || 'Error procesando acción.', true); return false; }
    showNotice(data.message || 'Acción completada.', false);
    return true;
  } catch (error) {
    showNotice('Error AJAX: ' + error.message, true);
    return false;
  }
}
document.addEventListener('click', async function (event) {
  const paginationButton = event.target.closest('.pagination button[data-page]');
  if (paginationButton) {
    const wrapper = paginationButton.closest('.pagination');
    await loadTable(wrapper.dataset.type, parseInt(paginationButton.dataset.page, 10));
    return;
  }
  const deleteOne = event.target.closest('.btn-delete-one');
  if (deleteOne) {
    const type = deleteOne.dataset.type, id = deleteOne.dataset.id;
    if (!confirm('¿Seguro que deseas eliminar este registro?')) return;
    if (await ajaxAction('delete_one', type, { id })) await loadTable(type, type === 'sync' ? state.syncPage : state.logsPage);
    return;
  }
  const deleteSelected = event.target.closest('.btn-delete-selected');
  if (deleteSelected) {
    const type = deleteSelected.dataset.type;
    const ids = getSelectedIds(type);
    if (ids.length === 0) { showNotice('Selecciona al menos un registro.', true); return; }
    if (!confirm('¿Seguro que deseas eliminar los registros seleccionados?')) return;
    if (await ajaxAction('delete_selected', type, { ids })) await loadTable(type, type === 'sync' ? state.syncPage : state.logsPage);
    return;
  }
  const deleteAll = event.target.closest('.btn-delete-all');
  if (deleteAll) {
    const type = deleteAll.dataset.type;
    const message = type === 'logs' ? '¿Seguro que deseas borrar TODO el log? Esta acción no se puede deshacer.' : '¿Seguro que deseas borrar TODAS las tareas sincronizadas? Esta acción no se puede deshacer.';
    if (!confirm(message)) return;
    if (await ajaxAction('delete_all', type)) await loadTable(type, 1);
  }
});
</script>
</body>
</html>`;
}
