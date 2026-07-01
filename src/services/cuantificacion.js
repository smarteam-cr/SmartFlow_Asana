import { addBusinessDays } from '../lib/businessDays.js';

export async function createCuantificacionTask(asana, config, deal) {
  const dealId = deal.id;
  const dealName = deal.properties?.dealname || 'Sin nombre';
  const dueDate = addBusinessDays(4);

  const notes = `
Tarea creada automáticamente desde HubSpot.

Negocio: ${dealName}
Deal ID HubSpot: ${dealId}

Acción:
Realizar cuantificación del proyecto.

Cuando esta tarea se complete, el negocio pasará en HubSpot a:
Propuesta en elaboración.
`.trim();

  return asana.createTask({
    name: `Cuantificación - ${dealName}`,
    assignee: config.asanaBreinerUserGid,
    workspace: config.asanaWorkspaceGid,
    projects: [config.asanaProjectGid],
    due_on: dueDate,
    notes,
  });
}
