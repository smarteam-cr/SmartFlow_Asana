import 'dotenv/config';

const REQUIRED_KEYS = [
  'MONGO_URI',
  'MONGO_DB',
  'HUBSPOT_TOKEN',
  'HUBSPOT_STAGE_ANALISIS',
  'HUBSPOT_STAGE_PROPUESTA',
  'HUBSPOT_STAGE_GANADA',
  'ASANA_TOKEN',
  'ASANA_WORKSPACE_GID',
  'ASANA_PROJECT_GID',
  'ASANA_BREINER_USER_GID',
  'ASANA_PLANOS_PROJECT_GID',
  'ASANA_PLANOS_SECTION_GID',
  'ASANA_PLANOS_ASSIGNEE_GID',
  'ASANA_VENTAS_PROJECT_GID',
];

export function loadConfig() {
  for (const key of REQUIRED_KEYS) {
    if (!process.env[key]) {
      throw new Error(`Falta la variable de entorno requerida: ${key}`);
    }
  }

  let asanaHubspotOwnerMap = {};
  try {
    asanaHubspotOwnerMap = JSON.parse(process.env.ASANA_HUBSPOT_OWNER_MAP || '{}');
  } catch {
    asanaHubspotOwnerMap = {};
  }

  return {
    appUrl: process.env.APP_URL || '',
    port: Number(process.env.PORT) || 3005,

    mongoUri: process.env.MONGO_URI,
    mongoDb: process.env.MONGO_DB,

    hubspotToken: process.env.HUBSPOT_TOKEN,
    hubspotStageAnalisis: process.env.HUBSPOT_STAGE_ANALISIS,
    hubspotStagePropuesta: process.env.HUBSPOT_STAGE_PROPUESTA,
    hubspotStageGanada: process.env.HUBSPOT_STAGE_GANADA,

    asanaToken: process.env.ASANA_TOKEN,
    asanaWorkspaceGid: process.env.ASANA_WORKSPACE_GID,
    asanaProjectGid: process.env.ASANA_PROJECT_GID,
    asanaBreinerUserGid: process.env.ASANA_BREINER_USER_GID,
    asanaPlanosProjectGid: process.env.ASANA_PLANOS_PROJECT_GID,
    asanaPlanosSectionGid: process.env.ASANA_PLANOS_SECTION_GID,
    asanaPlanosAssigneeGid: process.env.ASANA_PLANOS_ASSIGNEE_GID,
    asanaVentasProjectGid: process.env.ASANA_VENTAS_PROJECT_GID,
    asanaHubspotOwnerMap,
    asanaHubspotTagName: (process.env.ASANA_HUBSPOT_TAG_NAME || 'HubSpot').trim() || 'HubSpot',
  };
}
