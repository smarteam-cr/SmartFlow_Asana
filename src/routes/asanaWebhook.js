function getTaskGidFromEvent(event) {
  if (event.parent?.resource_type === 'task') return event.parent.gid ?? null;
  if (event.resource?.resource_type === 'task') return event.resource.gid ?? null;
  if (event.change?.added_value?.resource_type === 'task') return event.change.added_value.gid ?? null;
  if (event.change?.new_value?.resource_type === 'task') return event.change.new_value.gid ?? null;
  if (event.change?.removed_value?.resource_type === 'task') return event.change.removed_value.gid ?? null;
  return null;
}

export function registerAsanaWebhook(app, deps) {
  const { asana, hubspot, operacionesVentasService, findSyncByAsanaTask, markSyncCompleted, saveLog } = deps;

  app.post('/asana-webhook', async (req, reply) => {
    const hookSecret = req.headers['x-hook-secret'];

    if (hookSecret && String(hookSecret).trim() !== '') {
      reply.header('X-Hook-Secret', hookSecret);
      reply.send();
      return;
    }

    const payload = req.body || {};
    const events = payload.events || [];

    if (!events.length) {
      reply.send({ ok: true, message: 'Webhook Asana recibido sin eventos' });
      return;
    }

    const processedTasks = {};

    for (const event of events) {
      const action = event.action || '';
      const resourceSubtype = event.resource?.resource_subtype || '';

      if (action === 'deleted' || resourceSubtype === 'trashed') {
        continue;
      }

      const taskGid = getTaskGidFromEvent(event);

      if (!taskGid || processedTasks[taskGid]) {
        continue;
      }

      processedTasks[taskGid] = true;

      try {
        await operacionesVentasService.processTask(String(taskGid));
      } catch (error) {
        await saveLog('asana', 'warning', 'No se pudo procesar tarea Asana para Operaciones/Ventas', 'operaciones_ventas_error', {
          asana_task_id: taskGid,
          error: error.message,
          event,
        });
      }

      try {
        const sync = await findSyncByAsanaTask(String(taskGid));

        if (!sync || sync.type === 'operaciones_ventas' || sync.status === 'completed') {
          continue;
        }

        const asanaTask = await asana.getTask(String(taskGid));
        const completed = asanaTask.data?.completed ?? false;
        const taskName = asanaTask.data?.name || 'Tarea Asana';

        if (completed !== true) {
          continue;
        }

        if (sync.type === 'cuantificacion') {
          if (!sync.hubspot_target_stage) {
            await saveLog('asana', 'warning', 'Sync sin etapa destino registrada, no se movió el negocio', 'cuantificacion_missing_target_stage', {
              deal_id: sync.hubspot_deal_id,
              asana_task_id: taskGid,
            });
            continue;
          }

          await hubspot.updateDealStage(sync.hubspot_deal_id, sync.hubspot_target_stage);
          await markSyncCompleted(sync.id);
          await saveLog('asana', 'success', 'Negocio movido a Propuesta en elaboración', 'cuantificacion_completed', {
            deal_id: sync.hubspot_deal_id,
            asana_task_id: taskGid,
          });
          continue;
        }

        if (sync.type === 'planos_despiece') {
          const taskSubject = 'Planos de despiece finalizados';
          const taskBody = `
La tarea de planos de despiece fue completada en Asana.

Tarea Asana: ${taskName}
Asana Task ID: ${taskGid}

Los archivos PDF/DWG fueron gestionados en Asana/Drive.
`.trim();

          await hubspot.createCompletedDealTaskWithAssociation(sync.hubspot_deal_id, taskSubject, taskBody);
          await markSyncCompleted(sync.id);
          await saveLog('asana', 'success', 'Tarea completada creada en HubSpot por planos de despiece finalizados', 'planos_despiece_completed', {
            deal_id: sync.hubspot_deal_id,
            asana_task_id: taskGid,
            task_name: taskName,
          });
        }
      } catch (error) {
        await saveLog('asana', 'warning', 'No se pudo procesar cierre de tarea Asana anterior', 'asana_completion_error', {
          asana_task_id: taskGid,
          error: error.message,
          event,
        });
      }
    }

    reply.send({ ok: true, message: 'Webhook Asana procesado', processed_tasks: Object.keys(processedTasks) });
  });
}
