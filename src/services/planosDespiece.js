import { addBusinessDays } from '../lib/businessDays.js';

export async function createPlanosDespieceTask(asana, config, deal) {
  const dealId = deal.id;
  const dealName = deal.properties?.dealname || 'Sin nombre';
  const dueDate = addBusinessDays(5);

  const notes = `
Tarea creada automáticamente desde HubSpot.

Negocio: ${dealName}
Deal ID HubSpot: ${dealId}

Acción:
Realizar planos de despiece del proyecto.

Los archivos PDF/DWG deben gestionarse en Asana/Drive.

Cuando esta tarea se complete, se creará una tarea completada en HubSpot indicando que los planos fueron finalizados.
`.trim();

  return asana.createTask({
    name: `Planos de despiece pdf y dwg - ${dealName}`,
    assignee: config.asanaPlanosAssigneeGid,
    workspace: config.asanaWorkspaceGid,
    memberships: [{ project: config.asanaPlanosProjectGid, section: config.asanaPlanosSectionGid }],
    due_on: dueDate,
    notes,
  });
}
