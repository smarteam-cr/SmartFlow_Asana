function webhookTarget(config) {
  return `${String(config.appUrl).replace(/\/$/, '')}/asana-webhook`;
}

export function registerAdminWebhooks(app, deps) {
  const { asana, config, saveLog } = deps;

  async function handle(method, path, handler) {
    app.route({ method, url: path, handler });
  }

  handle(['GET', 'POST'], '/create-asana-webhook', async () => {
    const webhook = await asana.createWebhook(config.asanaProjectGid, webhookTarget(config), [
      { resource_type: 'task', action: 'changed', fields: ['completed'] },
    ]);
    await saveLog('asana', 'success', 'Webhook de Asana creado', 'create_asana_webhook', webhook);
    return { ok: true, message: 'Webhook de Asana creado correctamente', webhook };
  });

  handle(['GET', 'POST'], '/create-asana-planos-webhook', async () => {
    const webhook = await asana.createWebhook(config.asanaPlanosProjectGid, webhookTarget(config), [
      { resource_type: 'task', action: 'changed', fields: ['completed'] },
    ]);
    await saveLog('asana', 'success', 'Webhook de Asana para planos creado', 'create_asana_planos_webhook', webhook);
    return { ok: true, message: 'Webhook de Asana para planos creado correctamente', webhook };
  });

  handle(['GET', 'POST'], '/create-asana-ventas-webhook', async () => {
    const webhook = await asana.createWebhook(config.asanaVentasProjectGid, webhookTarget(config));
    await saveLog('asana', 'success', 'Webhook de Asana para VENTAS creado', 'create_asana_ventas_webhook', webhook);
    return { ok: true, message: 'Webhook de Asana para VENTAS creado correctamente', webhook };
  });

  handle(['GET', 'POST'], '/list-asana-webhooks', async () => {
    const webhooks = await asana.listWebhooks(config.asanaWorkspaceGid);
    await saveLog('asana', 'success', 'Webhooks de Asana consultados', 'list_asana_webhooks', webhooks);
    return { ok: true, webhooks };
  });

  app.route({
    method: ['GET', 'POST'],
    url: '/delete-asana-webhook',
    handler: async (req, reply) => {
      const gid = req.query?.gid;

      if (!gid) {
        reply.code(400);
        return { ok: false, message: 'Falta el parámetro gid' };
      }

      const response = await asana.deleteWebhook(gid);
      await saveLog('asana', 'success', 'Webhook de Asana eliminado', 'delete_asana_webhook', { gid, response });
      return { ok: true, message: 'Webhook eliminado correctamente', gid, response };
    },
  });
}
