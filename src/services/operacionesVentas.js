import { normalizeText } from '../lib/normalize.js';

function taskHasHubspotTag(taskData, tagName) {
  const target = normalizeText(tagName);
  return (taskData.tags || []).some((tag) => normalizeText(tag.name || '') === target);
}

function getAsanaTaskTagNames(taskData) {
  return (taskData.tags || []).map((tag) => String(tag.name || '').trim()).filter(Boolean);
}

function isTaskInVentasProject(taskData, ventasProjectGid) {
  return (taskData.memberships || []).some(
    (m) => String(m.project?.gid) === String(ventasProjectGid),
  );
}

function getVentasSectionFromTask(taskData, ventasProjectGid) {
  const membership = (taskData.memberships || []).find(
    (m) => String(m.project?.gid) === String(ventasProjectGid),
  );
  return membership?.section?.name ?? null;
}

async function extractCommentsSummary(asana, taskGid) {
  try {
    const stories = await asana.getTaskStories(taskGid, 20);
    const items = stories.data || [];
    const allowedSubtypes = ['comment_added', 'assigned', 'due_date_changed'];

    const comments = items
      .filter((s) => allowedSubtypes.includes(s.resource_subtype) && String(s.text || '').trim())
      .slice(0, 5)
      .map((s) => `- ${s.created_by?.name || 'Usuario Asana'} (${s.created_at || ''}): ${s.text.trim()}`);

    return comments.length ? comments.join('\n') : 'Sin comentarios relevantes.';
  } catch (error) {
    return `No se pudieron consultar comentarios de Asana: ${error.message}`;
  }
}

async function extractAttachmentsSummary(asana, taskGid) {
  try {
    const attachments = await asana.getTaskAttachments(taskGid, 5);
    const items = attachments.data || [];

    if (!items.length) return 'Sin adjuntos.';

    return items
      .map((a) => {
        const name = a.name || 'Adjunto sin nombre';
        const url = a.permanent_url || a.download_url || '';
        const host = a.host || 'Asana';
        return url ? `- ${name} (${host}): ${url}` : `- ${name} (${host})`;
      })
      .join('\n');
  } catch (error) {
    return `No se pudieron consultar adjuntos de Asana: ${error.message}`;
  }
}

async function buildTaskContext(asana, config, taskGid) {
  const taskResponse = await asana.getTaskFullDetails(taskGid);
  const taskData = taskResponse.data || {};

  if (!Object.keys(taskData).length) {
    return { ok: false, message: 'No se encontró información de la tarea en Asana.', data: {} };
  }

  const assignee = taskData.assignee || null;
  let assigneeEmail = assignee?.email ?? null;

  if (!assigneeEmail && assignee?.gid) {
    try {
      const user = await asana.getUser(assignee.gid);
      assigneeEmail = user.data?.email ?? null;
    } catch {
      assigneeEmail = null;
    }
  }

  const [commentsSummary, attachmentsSummary] = await Promise.all([
    extractCommentsSummary(asana, taskGid),
    extractAttachmentsSummary(asana, taskGid),
  ]);

  return {
    ok: true,
    message: 'Contexto de tarea Asana preparado correctamente.',
    data: {
      task_gid: taskData.gid || taskGid,
      task_name: taskData.name || 'Tarea desde Asana',
      notes: String(taskData.notes || '').trim(),
      due_on: taskData.due_on ?? null,
      due_at: taskData.due_at ?? null,
      completed: Boolean(taskData.completed),
      permalink_url: taskData.permalink_url || '',
      assignee_gid: assignee?.gid ?? null,
      assignee_name: assignee?.name ?? null,
      assignee_email: assigneeEmail,
      section_name: getVentasSectionFromTask(taskData, config.asanaVentasProjectGid),
      is_in_ventas_project: isTaskInVentasProject(taskData, config.asanaVentasProjectGid),
      has_hubspot_tag: taskHasHubspotTag(taskData, config.asanaHubspotTagName),
      tag_names: getAsanaTaskTagNames(taskData),
      comments_summary: commentsSummary,
      attachments_summary: attachmentsSummary,
    },
  };
}

async function findOwnerBySection(hubspot, sectionName, assigneeEmail, assigneeName) {
  const owners = await hubspot.listOwners();

  const sectionNormalized = normalizeText(sectionName || '');
  const nameNormalized = assigneeName ? normalizeText(assigneeName) : null;
  const emailNormalized = assigneeEmail ? assigneeEmail.toLowerCase().trim() : null;

  for (const owner of owners) {
    const email = String(owner.email || '').toLowerCase().trim();
    const fullName = normalizeText(`${owner.firstName || ''} ${owner.lastName || ''}`.trim());

    if (sectionNormalized !== '' && fullName === sectionNormalized) return owner;
    if (emailNormalized && email === emailNormalized) return owner;
    if (nameNormalized && fullName === nameNormalized) return owner;
  }

  return null;
}

async function findOwnerByAsanaUser(hubspot, config, asanaUserGid, asanaEmail, asanaName) {
  const map = config.asanaHubspotOwnerMap || {};

  if (asanaUserGid && map[asanaUserGid]) {
    return {
      id: map[asanaUserGid],
      firstName: asanaName || '',
      lastName: '',
      email: asanaEmail || '',
    };
  }

  return findOwnerBySection(hubspot, '', asanaEmail, asanaName);
}

function buildVentasBody({ heading, sectionName, assigneeName, assigneeEmail, ownerName, dueOn, dueAt, taskName, notes, commentsSummary, attachmentsSummary, asanaUrl, extraLines = '' }) {
  return `
${heading}

IMPORTANTE:
Esta tarea NO fue asociada automáticamente a un negocio, contacto o empresa.
El vendedor debe abrir la tarea en HubSpot y asociarla manualmente al registro correspondiente.

DATOS DE ASANA
Proyecto Asana: VENTAS
Sección/Columna Asana: ${sectionName}
Responsable Asana: ${assigneeName}
Correo Asana: ${assigneeEmail}${ownerName ? `\nAsignado en HubSpot a: ${ownerName}` : ''}
Fecha de entrega Asana: ${dueOn || dueAt || 'Sin fecha'}

TÍTULO ASANA
${taskName}

DESCRIPCIÓN ASANA
${notes !== '' ? notes : 'Sin descripción en Asana.'}

COMENTARIOS RECIENTES DE ASANA
${commentsSummary}

ADJUNTOS DE ASANA
${attachmentsSummary}

LINK DE ASANA
${asanaUrl}
${extraLines}`.trim();
}

export function createOperacionesVentasService(deps) {
  const { asana, hubspot, config, saveLog, findSync, saveOpVentasSync } = deps;

  async function processTask(taskGid) {
    const existingSync = await findSync(taskGid);
    const context = await buildTaskContext(asana, config, taskGid);

    if (!context.ok) {
      await saveLog('asana', 'warning', context.message || 'No se pudo preparar contexto de Asana', 'operaciones_ventas', {
        asana_task_id: taskGid,
        context,
      });
      return;
    }

    const data = context.data;

    if (!data.task_gid) {
      await saveLog('asana', 'warning', 'Asana devolvió tarea vacía', 'operaciones_ventas', { asana_task_id: taskGid });
      return;
    }

    if (data.completed === true) {
      await saveLog('asana', 'ignored', 'Tarea Asana completada, no se envía a HubSpot como pendiente', 'operaciones_ventas', {
        asana_task_id: taskGid,
      });
      return;
    }

    if (data.is_in_ventas_project !== true) {
      return;
    }

    if (data.has_hubspot_tag !== true) {
      await saveLog('asana', 'ignored', 'Tarea ignorada porque no tiene la etiqueta HubSpot', 'operaciones_ventas', {
        asana_task_id: taskGid,
        tags: data.tag_names,
      });
      return;
    }

    if (existingSync?.type === 'operaciones_ventas' && existingSync.hubspot_task_id) {
      await updateExistingTask(taskGid, existingSync.hubspot_task_id);
      return;
    }

    const { section_name: sectionName = 'Sin sección', assignee_gid: assigneeGid, assignee_name: assigneeName, assignee_email: assigneeEmail } = data;

    if (!assigneeEmail) {
      await saveLog('asana', 'warning', 'Tarea privada o sin responsable/correo en Asana', 'operaciones_ventas', {
        asana_task_id: taskGid,
        section: sectionName,
        assignee_gid: assigneeGid,
        assignee_name: assigneeName,
      });
      return;
    }

    const owner = await findOwnerByAsanaUser(hubspot, config, assigneeGid, assigneeEmail, assigneeName);

    if (!owner) {
      await saveLog('asana', 'warning', 'No se encontró owner de HubSpot por correo de Asana', 'operaciones_ventas', {
        asana_task_id: taskGid,
        section: sectionName,
        assignee_gid: assigneeGid,
        assignee_email: assigneeEmail,
        assignee_name: assigneeName,
      });
      return;
    }

    const ownerId = owner.id;

    if (!ownerId) {
      await saveLog('hubspot', 'error', 'Owner encontrado sin ID en HubSpot', 'operaciones_ventas', {
        asana_task_id: taskGid,
        owner,
      });
      return;
    }

    const ownerName = `${owner.firstName || ''} ${owner.lastName || ''}`.trim();
    const subject = `[Operaciones] ${data.task_name}`;
    const body = buildVentasBody({
      heading: 'Tarea creada automáticamente desde Asana para Ventas.',
      sectionName,
      assigneeName,
      assigneeEmail,
      ownerName,
      dueOn: data.due_on,
      dueAt: data.due_at,
      taskName: data.task_name,
      notes: data.notes,
      commentsSummary: data.comments_summary,
      attachmentsSummary: data.attachments_summary,
      asanaUrl: data.permalink_url,
      extraLines: '\nINDICACIÓN PARA EL VENDEDOR\nRevisar la información anterior y asociar esta tarea al negocio/contacto/empresa correspondiente en HubSpot.\n',
    });

    const dueOnOrAt = data.due_on || data.due_at;
    const timestamp = dueOnOrAt
      ? new Date(`${dueOnOrAt}T17:00:00`).toISOString()
      : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const hubspotTask = await hubspot.createTask({
      hs_timestamp: timestamp,
      hs_task_subject: subject,
      hs_task_body: body,
      hs_task_status: 'NOT_STARTED',
      hs_task_priority: 'MEDIUM',
      hs_task_type: 'TODO',
      hubspot_owner_id: ownerId,
    });

    const hubspotTaskId = hubspotTask?.id;

    if (!hubspotTaskId) {
      await saveLog('hubspot', 'error', 'HubSpot no devolvió Task ID', 'operaciones_ventas', {
        asana_task_id: taskGid,
        hubspot_response: hubspotTask,
      });
      return;
    }

    await saveOpVentasSync(taskGid, hubspotTaskId);

    try {
      await asana.addTaskComment(taskGid, `✅ Tarea enviada a HubSpot correctamente. ID tarea HubSpot: ${hubspotTaskId}`);
    } catch (error) {
      await saveLog('asana', 'warning', 'La tarea se creó en HubSpot, pero no se pudo comentar en Asana', 'operaciones_ventas_comment', {
        asana_task_id: taskGid,
        hubspot_task_id: hubspotTaskId,
        error: error.message,
      });
    }

    await saveLog('asana', 'success', 'Tarea de Operaciones creada en HubSpot para vendedor por etiqueta HubSpot', 'operaciones_ventas', {
      asana_task_id: taskGid,
      hubspot_task_id: hubspotTaskId,
      section: sectionName,
      assignee_gid: assigneeGid,
      assignee_email: assigneeEmail,
      assignee_name: assigneeName,
      owner_id: ownerId,
      owner_name: ownerName,
      task_name: data.task_name,
      due_on: data.due_on,
      asana_url: data.permalink_url,
    });
  }

  async function updateExistingTask(taskGid, hubspotTaskId) {
    const context = await buildTaskContext(asana, config, taskGid);

    if (!context.ok) {
      await saveLog('asana', 'warning', 'No se pudo actualizar tarea en HubSpot porque no se obtuvo contexto de Asana', 'operaciones_ventas_update', {
        asana_task_id: taskGid,
        hubspot_task_id: hubspotTaskId,
        context,
      });
      return;
    }

    const data = context.data;

    if (data.has_hubspot_tag !== true) {
      await saveLog('asana', 'ignored', 'Tarea ya sincronizada, pero no se actualiza porque no tiene etiqueta HubSpot', 'operaciones_ventas_update', {
        asana_task_id: taskGid,
        hubspot_task_id: hubspotTaskId,
        tags: data.tag_names,
      });
      return;
    }

    const body = buildVentasBody({
      heading: 'Tarea actualizada automáticamente desde Asana para Ventas.',
      sectionName: data.section_name || 'Sin sección',
      assigneeName: data.assignee_name || 'Sin responsable',
      assigneeEmail: data.assignee_email || 'Sin correo',
      ownerName: null,
      dueOn: data.due_on,
      dueAt: data.due_at,
      taskName: data.task_name,
      notes: data.notes,
      commentsSummary: data.comments_summary,
      attachmentsSummary: data.attachments_summary,
      asanaUrl: data.permalink_url,
      extraLines: `\nÚltima actualización desde Asana:\n${new Date().toISOString()}\n`,
    });

    const dueOnOrAt = data.due_on || data.due_at;
    const timestamp = dueOnOrAt
      ? new Date(`${dueOnOrAt}T17:00:00`).toISOString()
      : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await hubspot.updateTask(hubspotTaskId, {
      hs_task_subject: `[Operaciones] ${data.task_name}`,
      hs_task_body: body,
      hs_timestamp: timestamp,
    });

    await saveLog('asana', 'success', 'Tarea de HubSpot actualizada desde cambios en Asana', 'operaciones_ventas_update', {
      asana_task_id: taskGid,
      hubspot_task_id: hubspotTaskId,
      task_name: data.task_name,
    });
  }

  function buildContext(taskGid) {
    return buildTaskContext(asana, config, taskGid);
  }

  return { processTask, updateExistingTask, buildContext };
}
