# Integración HubSpot - Asana

Servicio de sincronización desarrollado en Node.js + Fastify para automatizar flujos entre HubSpot y Asana.

La integración escucha webhooks de HubSpot y Asana, crea tareas entre ambas plataformas y guarda la relación de sincronización en una base de datos MongoDB para evitar duplicados y dar seguimiento al estado de cada proceso.

## Flujos incluidos

### 1. HubSpot -> Asana -> HubSpot: Cuantificación

Cuando un negocio de HubSpot cambia a la etapa **Análisis y cuantificación**, HubSpot envía un webhook al servicio.

El servicio:

1. Recibe el evento de HubSpot.
2. Consulta el negocio en HubSpot.
3. Valida que el negocio esté en la etapa configurada para análisis.
4. Crea una tarea en Asana para cuantificación.
5. Guarda la relación `deal_id <-> asana_task_id` en la base de datos.

Cuando la tarea de Asana se marca como completada:

1. Asana envía un webhook al servicio.
2. El servicio identifica la tarea relacionada.
3. El negocio en HubSpot se mueve a la etapa **Propuesta en elaboración**.
4. La sincronización queda marcada como completada.

### 2. HubSpot -> Asana -> HubSpot: Planos de despiece

Cuando un negocio de HubSpot cambia a la etapa **Venta ganada**, HubSpot envía un webhook al servicio.

El servicio:

1. Recibe el evento de HubSpot.
2. Consulta el negocio.
3. Crea una tarea de **Planos de despiece pdf y dwg** en Asana.
4. Guarda la relación `deal_id <-> asana_task_id` con tipo `planos_despiece`.

Cuando la tarea de planos se completa en Asana:

1. Asana envía el webhook.
2. El servicio identifica la tarea relacionada.
3. Se crea una tarea completada en HubSpot asociada al negocio.
4. La sincronización queda marcada como completada.

### 3. Asana -> HubSpot: Operaciones crea tareas para vendedores

Este flujo permite que Operaciones cree una tarea en Asana y que el servicio genere una tarea pendiente en HubSpot para el vendedor correspondiente.

Condición importante para fase 3:

Para que una tarea de Asana viaje a HubSpot, la tarea debe tener asignada la etiqueta configurada como **HubSpot** en Asana.

Si la tarea no tiene esa etiqueta, el servicio la ignora y no crea la tarea en HubSpot.

El servicio valida:

1. Que la tarea pertenezca al proyecto de ventas configurado.
2. Que tenga la etiqueta **HubSpot**.
3. Que tenga responsable asignado.
4. Que el responsable de Asana pueda relacionarse con un owner de HubSpot.
5. Que la tarea no haya sido sincronizada previamente.

Cuando cumple las reglas, crea una tarea pendiente en HubSpot con:

- Título de la tarea de Asana.
- Descripción.
- Comentarios recientes.
- Adjuntos o enlaces.
- Fecha de entrega.
- Link directo a la tarea de Asana.

## Tecnologías

- Node.js 20+ (módulos ES nativos)
- Fastify
- MongoDB (driver oficial `mongodb`)
- HubSpot API
- Asana API
- Webhooks
- Vitest (tests)

## Estructura del proyecto

```text
src/
├── server.js               # Bootstrap: carga config, conecta Mongo, levanta Fastify
├── app.js                  # Registra todas las rutas y conecta las dependencias
├── config/env.js           # Carga y valida variables de entorno
├── lib/                    # httpClient, businessDays, normalize, escapeHtml
├── db/                     # client.js, syncTasksRepo.js, logsRepo.js, indexes.js
├── services/               # asana.js, hubspot.js, cuantificacion.js, planosDespiece.js, operacionesVentas.js
└── routes/                 # health.js, hubspotWebhook.js, asanaWebhook.js, adminWebhooks.js, adminDebug.js, panel.js
```

## Requisitos

- Node.js 20 LTS o superior (incluye `fetch` global).
- npm.
- MongoDB.
- URL pública con HTTPS para recibir webhooks de HubSpot y Asana.

## Instalación

1. Entrar a la carpeta del proyecto.

2. Instalar dependencias:

```bash
npm install
```

3. Configurar el archivo `.env` en la raíz del proyecto:

```env
APP_URL=https://dominio-publico.com
PORT=3005

MONGO_URI=mongodb://localhost:27017
MONGO_DB=nombre_base_datos

HUBSPOT_TOKEN=token_privado_hubspot
HUBSPOT_STAGE_ANALISIS=qualifiedtobuy
HUBSPOT_STAGE_PROPUESTA=presentationscheduled
HUBSPOT_STAGE_GANADA=closedwon

ASANA_TOKEN=token_personal_asana
ASANA_WORKSPACE_GID=gid_workspace_asana
ASANA_PROJECT_GID=gid_proyecto_cuantificacion
ASANA_BREINER_USER_GID=gid_usuario_asignado_cuantificacion

ASANA_PLANOS_PROJECT_GID=gid_proyecto_planos
ASANA_PLANOS_SECTION_GID=gid_seccion_planos
ASANA_PLANOS_ASSIGNEE_GID=gid_usuario_asignado_planos

ASANA_VENTAS_PROJECT_GID=gid_proyecto_ventas

ASANA_HUBSPOT_OWNER_MAP='{"asana_user_gid":"hubspot_owner_id"}'
ASANA_HUBSPOT_TAG_NAME=HubSpot
```

No se recomienda subir credenciales reales a repositorios públicos.

4. Crear los índices necesarios en MongoDB (colecciones `sync_tasks`, `integration_logs`):

```bash
node -e "import('./src/db/client.js').then(async ({connectDb}) => { const {db}=await connectDb(process.env.MONGO_URI,process.env.MONGO_DB); await (await import('./src/db/indexes.js')).ensureIndexes(db); process.exit(0); })"
```

Esto se ejecuta automáticamente al iniciar el servidor (`npm start`/`npm run dev`).

## Ejecución

```bash
npm run dev    # con --watch para desarrollo
npm start      # producción
```

Para validar que el servicio está activo, abrir:

```text
https://dominio-publico.com/
```

Respuesta esperada:

```json
{
  "ok": true,
  "message": "Servicio activo",
  "path": "/"
}
```

## Endpoints principales

### Webhook de HubSpot

```text
POST /hubspot-webhook
```

Este endpoint recibe eventos de HubSpot cuando un negocio cambia de etapa.

Debe configurarse en HubSpot para escuchar cambios de etapa del objeto negocio/deal.

### Webhook de Asana

```text
POST /asana-webhook
```

Este endpoint recibe eventos desde Asana cuando cambian tareas, responsables, fechas, comentarios, adjuntos, etiquetas o estado de completado.

### Panel administrativo

```text
GET /panel
```

Permite consultar logs y tareas sincronizadas.

## Endpoints auxiliares

Estos endpoints ayudan a crear, listar y probar webhooks o flujos manualmente:

```text
GET /create-asana-webhook
GET /create-asana-planos-webhook
GET /create-asana-ventas-webhook
GET /list-asana-webhooks
GET /delete-asana-webhook?gid=ID_WEBHOOK
GET /list-planos-sections
GET /test-create-asana-task
GET /test-hubspot-deal?deal_id=ID_NEGOCIO
GET /test-operaciones-ventas-task?task_gid=ID_TAREA_ASANA
GET /debug-asana-task?task_gid=ID_TAREA_ASANA
GET /sync-ventas-tagged
```

Recomendación: restringir o proteger los endpoints auxiliares en ambiente productivo (no se agregó autenticación en esta migración; queda como mejora futura).

## Configuración de webhooks

### HubSpot

Configurar un webhook que apunte a:

```text
https://dominio-publico.com/hubspot-webhook
```

El webhook debe dispararse cuando cambie la propiedad de etapa del negocio.

Etapas usadas por el servicio:

- `HUBSPOT_STAGE_ANALISIS`: crea tarea de cuantificación en Asana.
- `HUBSPOT_STAGE_GANADA`: crea tarea de planos de despiece en Asana.
- `HUBSPOT_STAGE_PROPUESTA`: etapa a la que se mueve el negocio cuando se completa la cuantificación.

### Asana

Crear webhooks para los proyectos configurados:

- Proyecto de cuantificación.
- Proyecto de planos de despiece.
- Proyecto de ventas.

Se pueden crear usando los endpoints auxiliares:

```text
/create-asana-webhook
/create-asana-planos-webhook
/create-asana-ventas-webhook
```

Asana enviará una validación inicial con `X-Hook-Secret`; el servicio responde automáticamente esa validación.

## Reglas generales

- Todas las tareas creadas desde HubSpot llevan el nombre del negocio.
- La relación entre HubSpot y Asana se guarda en `sync_tasks`.
- Los eventos y errores se guardan en `integration_logs`.
- Las fechas límite se calculan en días hábiles.
- El servicio evita crear tareas duplicadas cuando ya existe una relación guardada.
- En fase 3, las tareas de Asana solo viajan a HubSpot si tienen la etiqueta **HubSpot**.
- En fase 3, la tarea creada en HubSpot no queda asociada automáticamente a un negocio, contacto o empresa; el vendedor debe asociarla manualmente al registro correspondiente.

## Mapeo de usuarios Asana -> HubSpot

La variable `ASANA_HUBSPOT_OWNER_MAP` relaciona usuarios de Asana con owners de HubSpot.

Formato:

```env
ASANA_HUBSPOT_OWNER_MAP='{"ASANA_USER_GID":"HUBSPOT_OWNER_ID"}'
```

Ejemplo:

```env
ASANA_HUBSPOT_OWNER_MAP='{"1213739911826296":"65432457"}'
```

Si no se encuentra el usuario en el mapa, el servicio intenta buscar el owner de HubSpot por correo o nombre.

## Validación posterior al despliegue

1. Abrir la URL base del servicio y confirmar respuesta `Servicio activo`.
2. Validar conexión con base de datos revisando el panel.
3. Crear o verificar webhooks de Asana.
4. Cambiar un negocio de HubSpot a **Análisis y cuantificación** y confirmar creación de tarea en Asana.
5. Completar la tarea de cuantificación en Asana y confirmar cambio de etapa en HubSpot.
6. Cambiar un negocio a **Venta ganada** y confirmar tarea de planos en Asana.
7. Completar la tarea de planos y confirmar tarea completada en HubSpot.
8. En el proyecto de ventas de Asana, crear una tarea asignada a un vendedor y agregar la etiqueta **HubSpot**.
9. Confirmar que se crea una tarea pendiente en HubSpot para el vendedor.

## Notas de seguridad

- Mantener el archivo `.env` fuera de repositorios públicos.
- Rotar tokens si fueron compartidos por correo, chat o archivos externos.
- Proteger endpoints auxiliares antes de dejar el servicio en producción.
- Revisar permisos mínimos necesarios en los tokens de HubSpot y Asana.

