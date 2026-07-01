function extractDealId(event) {
  return (
    event.objectId ??
    event.object_id ??
    event.dealId ??
    event.object?.objectId ??
    event.object?.id ??
    event.resourceId ??
    event.id ??
    null
  );
}

export function registerHubspotWebhook(app, deps) {
  const { config, hubspot, cuantificacionService, planosService, existsSyncForDeal, saveSyncTask, saveLog } = deps;

  app.post('/hubspot-webhook', async (req, reply) => {
    const payload = req.body || {};
    const events = Array.isArray(payload) ? payload : [payload];

    for (const event of events) {
      const dealId = extractDealId(event);

      if (!dealId) {
        await saveLog('hubspot', 'warning', 'Evento sin Deal ID', 'dealstage_change', event);
        continue;
      }

      const deal = await hubspot.getDeal(String(dealId));
      const currentStage = deal.properties?.dealstage ?? null;

      if (currentStage === config.hubspotStageAnalisis) {
        if (await existsSyncForDeal(String(dealId), 'cuantificacion')) {
          await saveLog('hubspot', 'ignored', 'Ya existe tarea de cuantificación para este negocio', 'cuantificacion', { deal_id: dealId });
          continue;
        }

        const asanaTask = await cuantificacionService.createCuantificacionTask(deal);
        const asanaTaskId = asanaTask.data?.gid;

        if (!asanaTaskId) {
          await saveLog('hubspot', 'error', 'Asana no devolvió Task ID', 'cuantificacion', { deal_id: dealId, asana_response: asanaTask });
          continue;
        }

        await saveSyncTask(String(dealId), asanaTaskId, 'cuantificacion');
        await saveLog('hubspot', 'success', 'Tarea creada en Asana desde HubSpot', 'cuantificacion', { deal_id: dealId, asana_task_id: asanaTaskId });
        continue;
      }

      if (currentStage === config.hubspotStageGanada) {
        if (await existsSyncForDeal(String(dealId), 'planos_despiece')) {
          await saveLog('hubspot', 'ignored', 'Ya existe tarea de planos de despiece para este negocio', 'planos_despiece', { deal_id: dealId });
          continue;
        }

        const asanaTask = await planosService.createPlanosDespieceTask(deal);
        const asanaTaskId = asanaTask.data?.gid;

        if (!asanaTaskId) {
          await saveLog('hubspot', 'error', 'Asana no devolvió Task ID para planos de despiece', 'planos_despiece', { deal_id: dealId, asana_response: asanaTask });
          continue;
        }

        await saveSyncTask(String(dealId), asanaTaskId, 'planos_despiece');
        await saveLog('hubspot', 'success', 'Tarea de planos de despiece creada en Asana', 'planos_despiece', { deal_id: dealId, asana_task_id: asanaTaskId });
        continue;
      }

      await saveLog('hubspot', 'ignored', 'El negocio no está en una etapa configurada para sincronización', 'dealstage_change', {
        deal_id: dealId,
        current_stage: currentStage,
        stage_analisis: config.hubspotStageAnalisis,
        stage_ganada: config.hubspotStageGanada,
      });
    }

    reply.send({ ok: true, message: 'Webhook HubSpot procesado' });
  });
}
