export function registerAdminDebug(app, deps) {
  const {
    asana,
    hubspot,
    config,
    cuantificacionService,
    planosService,
    operacionesVentasService,
    existsSyncForDeal,
    saveSyncTask,
    saveLog,
  } = deps;

  app.route({
    method: ['GET', 'POST'],
    url: '/list-planos-sections',
    handler: async () => {
      const sections = await asana.listProjectSections(config.asanaPlanosProjectGid);
      await saveLog('asana', 'success', 'Secciones de proyecto de planos consultadas', 'list_planos_sections', {
        project_gid: config.asanaPlanosProjectGid,
        sections,
      });
      return { ok: true, project_gid: config.asanaPlanosProjectGid, sections };
    },
  });

  app.route({
    method: ['GET', 'POST'],
    url: '/test-create-asana-task',
    handler: async () => {
      const fakeDeal = {
        id: 'TEST-001',
        properties: { dealname: 'Jorge Arauz Test', dealstage: config.hubspotStageAnalisis[0] },
      };
      const asanaTask = await cuantificacionService.createCuantificacionTask(fakeDeal);
      const asanaTaskId = asanaTask.data?.gid ?? null;

      await saveLog('test', 'success', 'Tarea de prueba creada en Asana', 'test_create_asana', {
        asana_task_id: asanaTaskId,
        deal_name: 'Jorge Arauz Test',
      });

      return { ok: true, message: 'Tarea creada en Asana', asana_task_id: asanaTaskId };
    },
  });

  app.route({
    method: ['GET', 'POST'],
    url: '/test-hubspot-deal',
    handler: async (req, reply) => {
      const dealId = req.query?.deal_id;

      if (!dealId) {
        reply.code(400);
        return { ok: false, message: 'Falta deal_id' };
      }

      const deal = await hubspot.getDeal(String(dealId));
      const currentStage = deal.properties?.dealstage ?? null;
      const dealName = deal.properties?.dealname || 'Sin nombre';

      await saveLog('hubspot', 'test', 'Prueba manual de negocio HubSpot', 'test_hubspot_deal', {
        deal_id: dealId,
        deal_name: dealName,
        current_stage: currentStage,
        stage_analisis: config.hubspotStageAnalisis,
        stage_ganada: config.hubspotStageGanada,
      });

      if (config.hubspotStageAnalisis.includes(currentStage)) {
        if (await existsSyncForDeal(String(dealId), 'cuantificacion')) {
          return { ok: false, message: 'Ya existe una tarea de cuantificación creada para este negocio', deal_id: dealId };
        }

        const asanaTask = await cuantificacionService.createCuantificacionTask(deal);
        const asanaTaskId = asanaTask.data?.gid ?? null;
        const targetStage = config.hubspotStagePropuestaMap.get(currentStage);
        await saveSyncTask(String(dealId), asanaTaskId, 'cuantificacion', targetStage);

        return {
          ok: true,
          message: 'Tarea de cuantificación creada en Asana desde negocio real de HubSpot',
          deal_id: dealId,
          deal_name: dealName,
          asana_task_id: asanaTaskId,
        };
      }

      if (config.hubspotStageGanada.includes(currentStage)) {
        if (await existsSyncForDeal(String(dealId), 'planos_despiece')) {
          return { ok: false, message: 'Ya existe una tarea de planos de despiece creada para este negocio', deal_id: dealId };
        }

        const asanaTask = await planosService.createPlanosDespieceTask(deal);
        const asanaTaskId = asanaTask.data?.gid ?? null;
        await saveSyncTask(String(dealId), asanaTaskId, 'planos_despiece');

        return {
          ok: true,
          message: 'Tarea de planos de despiece creada en Asana desde negocio real de HubSpot',
          deal_id: dealId,
          deal_name: dealName,
          asana_task_id: asanaTaskId,
        };
      }

      return {
        ok: false,
        message: 'El negocio no está en una etapa configurada para prueba',
        deal_id: dealId,
        deal_name: dealName,
        current_stage: currentStage,
        stage_analisis: config.hubspotStageAnalisis,
        stage_ganada: config.hubspotStageGanada,
      };
    },
  });

  app.route({
    method: ['GET', 'POST'],
    url: '/test-operaciones-ventas-task',
    handler: async (req, reply) => {
      const taskGid = req.query?.task_gid;

      if (!taskGid) {
        reply.code(400);
        return { ok: false, message: 'Falta task_gid' };
      }

      await saveLog('asana', 'test', 'Prueba manual de tarea Operaciones/Ventas', 'test_operaciones_ventas', {
        asana_task_id: taskGid,
      });

      await operacionesVentasService.processTask(String(taskGid));

      return { ok: true, message: 'Prueba manual ejecutada', asana_task_id: taskGid };
    },
  });

  app.route({
    method: ['GET', 'POST'],
    url: '/debug-asana-task',
    handler: async (req, reply) => {
      const taskGid = req.query?.task_gid;

      if (!taskGid) {
        reply.code(400);
        return { ok: false, message: 'Falta task_gid' };
      }

      const context = await operacionesVentasService.buildContext(String(taskGid));

      await saveLog('asana', 'debug', 'Debug de tarea Asana', 'debug_asana_task', {
        asana_task_id: taskGid,
        context,
      });

      return { ok: true, asana_task_id: taskGid, context };
    },
  });

  app.route({
    method: ['GET', 'POST'],
    url: '/sync-ventas-tagged',
    handler: async () => {
      const tasks = await asana.listProjectTasks(config.asanaVentasProjectGid, 100);
      const items = tasks.data || [];

      const processed = [];
      const errors = [];

      for (const task of items) {
        const taskGid = task.gid;
        if (!taskGid) continue;

        try {
          await operacionesVentasService.processTask(String(taskGid));
          processed.push(String(taskGid));
        } catch (error) {
          errors.push({ asana_task_id: taskGid, error: error.message });
          await saveLog('asana', 'warning', 'Error procesando tarea desde barrido VENTAS', 'sync_ventas_tagged_error', {
            asana_task_id: taskGid,
            error: error.message,
          });
        }
      }

      await saveLog('asana', 'success', 'Barrido de tareas VENTAS con etiqueta HubSpot ejecutado', 'sync_ventas_tagged', {
        total_found: items.length,
        processed,
        errors,
      });

      return { ok: true, message: 'Barrido de tareas VENTAS ejecutado', total_found: items.length, processed, errors };
    },
  });
}
