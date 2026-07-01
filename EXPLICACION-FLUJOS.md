# Explicación del código — Integración HubSpot ↔ Asana

Walkthrough del código real, archivo por archivo, para entender exactamente qué hace cada flujo antes de presentarlo o migrarlo.

---

## Arquitectura: cómo entra una request

Todo pasa por [public/index.php](public/index.php) (1035 líneas), que es un router manual sin framework:

```php
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$path = str_replace('/sync-service/public', '', $path);

if ($path === '/hubspot-webhook') { handleHubspotWebhook(); }
if ($path === '/asana-webhook') { handleAsanaWebhook(); }
// ... más rutas con if sueltos, no else-if
```

Son `if` independientes, no `else if`. Como cada `handle*()` termina en `jsonResponse()` (que hace `exit` — `helpers.php:3-9`), en la práctica solo se ejecuta el primero que matchea. Funciona, pero es frágil: si algún handler no llamara a `jsonResponse()`, la ejecución seguiría cayendo a las siguientes rutas.

Todo el bloque está envuelto en un único `try/catch (Throwable $e)` (líneas 12-87) que loguea cualquier error no controlado en `integration_logs` y responde 500.

---

## Flujo 1 — Cuantificación (`handleHubspotWebhook`, `public/index.php:141-237`)

**Paso 1: HubSpot dispara el webhook.**

```php
$payload = getJsonBody();          // helpers.php: file_get_contents('php://input') + json_decode
saveLog('hubspot', 'received', ...);
$events = isset($payload[0]) ? $payload : [$payload];   // soporta array de eventos o uno solo
```

**Paso 2: por cada evento, busca el Deal ID en 7 formatos posibles** (línea 150-157):

```php
$dealId = $event['objectId'] ?? $event['object_id'] ?? $event['dealId']
    ?? $event['object']['objectId'] ?? $event['object']['id']
    ?? $event['resourceId'] ?? $event['id'] ?? null;
```

Es defensivo porque HubSpot puede mandar distintas formas de payload según el tipo de suscripción de webhook configurada. Si no encuentra ninguno, loguea `warning` y sigue con el siguiente evento (`continue`) — nunca rompe el loop completo.

**Paso 3: consulta el deal real en HubSpot** (`getDeal()`, `hubspot.php:52`) y mira su etapa actual.

**Paso 4: decide qué hacer según la etapa:**

- Si `dealstage === HUBSPOT_STAGE_ANALISIS` → ¿ya existe sync para este deal con tipo `cuantificacion`? (`existsSyncForDeal`). Si sí, ignora (evita duplicados). Si no, llama `createCuantificacionTask($deal)` en Asana y guarda la relación con `saveSyncTask()`.
- Si `dealstage === HUBSPOT_STAGE_GANADA` → mismo patrón pero crea tarea de "planos de despiece" (`createPlanosDespieceTask`).
- Cualquier otra etapa → se ignora y se loguea como `ignored`.

Las tareas que se crean en Asana (`asana.php:50-114`):

```php
function createCuantificacionTask(array $deal): array
{
    $dueDate = addBusinessDays(4);
    // ...
    return asanaRequest('POST', '/tasks', [
        'name' => 'Cuantificación - ' . $dealName,
        'assignee' => envValue('ASANA_DAVID_USER_GID'),
        'workspace' => envValue('ASANA_WORKSPACE_GID'),
        'projects' => [envValue('ASANA_PROJECT_GID')],
        'due_on' => $dueDate,
        'notes' => trim($notes),
    ]);
}

function createPlanosDespieceTask(array $deal): array
{
    $dueDate = addBusinessDays(5);
    // ...
    return asanaRequest('POST', '/tasks', [
        'name' => 'Planos de despiece pdf y dwg - ' . $dealName,
        'assignee' => envValue('ASANA_PLANOS_ASSIGNEE_GID'),
        'workspace' => envValue('ASANA_WORKSPACE_GID'),
        'memberships' => [[
            'project' => envValue('ASANA_PLANOS_PROJECT_GID'),
            'section' => envValue('ASANA_PLANOS_SECTION_GID'),
        ]],
        'due_on' => $dueDate,
        'notes' => trim($notes),
    ]);
}
```

La tarea de cuantificación va siempre a un usuario y proyecto fijo (`ASANA_DAVID_USER_GID` / `ASANA_PROJECT_GID`), y la de planos a otro proyecto+sección (`ASANA_PLANOS_*`). El `due_on` se calcula con `addBusinessDays()` (4 y 5 días hábiles respectivamente).

---

## Cierre del flujo — cuando la tarea se completa en Asana (`handleAsanaWebhook`, líneas 337-404)

Primero, **el handshake de Asana** (líneas 246-250): cuando se crea el webhook, Asana manda `X-Hook-Secret` una sola vez y espera que el servicio lo devuelva igual — eso confirma que el endpoint existe y le pertenece. El código hace eco del header y responde 200. No hay validación más allá de eso, y ese mismo secreto **nunca se vuelve a chequear en eventos posteriores**.

Después, para cada evento:

1. Filtra `deleted`/`trashed`.
2. Extrae el `taskGid` con `getTaskGidFromAsanaEvent()` — Asana manda el GID en lugares distintos según si el cambio fue directo a la tarea (`resource`) o algo dentro de ella como un comentario (`parent`).
3. **Siempre** intenta `processOperacionesVentasTask($taskGid)` (Flujo 3, ver abajo) — sin importar si la tarea tiene algo que ver con HubSpot.
4. Luego, por separado, busca si existe un `sync_tasks` previo para esa tarea (`findSyncByAsanaTask`). Si lo encontró y la tarea está `completed === true` en Asana:
   - tipo `cuantificacion` → mueve el deal a "Propuesta" (`moveDealToProposalStage`, `hubspot.php:60-71`, un `PATCH` simple a `dealstage`).
   - tipo `planos_despiece` → crea una tarea **ya completada** en HubSpot (`createCompletedDealTask`) como evidencia de cierre.

```php
function moveDealToProposalStage(string $dealId): array
{
    return hubspotRequest('PATCH', "/crm/v3/objects/deals/{$dealId}", [
        'properties' => ['dealstage' => envValue('HUBSPOT_STAGE_PROPUESTA')],
    ]);
}
```

---

## Flujo 3 — Operaciones/Ventas (Asana → HubSpot) (`processOperacionesVentasTask`, `public/index.php:483-664`)

Es el flujo más largo, con validaciones en cascada, **en este orden exacto**:

1. `buildAsanaTaskContextForHubspot($taskGid)` (`asana.php:457`) — un solo llamado que junta toda la info de la tarea: detalles completos, tags, comentarios resumidos, adjuntos, si está en el proyecto VENTAS, si tiene la etiqueta `HubSpot`. Si falla (`ok !== true`), corta acá.
2. ¿La tarea ya está completada en Asana? → si sí, **no se manda a HubSpot como pendiente** (líneas 505-510): no tiene sentido crear algo pendiente que ya se resolvió.
3. ¿Está en el proyecto VENTAS? (`is_in_ventas_project`) → si no, corta en silencio, **sin log** (línea 512-514 — a diferencia de las demás guardas, esta no deja rastro en `integration_logs`).
4. ¿Tiene la etiqueta `HubSpot`? → si no, ignora y loguea (línea 518-524). **Esta es la regla de negocio central del flujo 3**: sin esa etiqueta, nada viaja a HubSpot.
5. **Si ya existe una sincronización previa para esta tarea** (`existingSync` con `hubspot_task_id`) → en vez de crear una tarea nueva, llama `updateExistingOperacionesVentasHubspotTask()` y termina ahí (líneas 526-536). Sincroniza el estado completo cada vez, no detecta qué campo específico cambió.
6. Si es la primera vez: necesita responsable con email (`assignee_email`) — si la tarea es privada o no tiene asignado, corta (línea 543-551).
7. Busca el owner de HubSpot correspondiente (`findHubspotOwnerByAsanaUser`, `hubspot.php:272`) — primero mira el mapa fijo `ASANA_HUBSPOT_OWNER_MAP`, si no está ahí cae a buscar por email/nombre.
8. Si todo resuelve: construye un cuerpo de texto plano con toda la info de Asana (sección, responsable, descripción, comentarios, adjuntos, link) y crea la tarea **pendiente** en HubSpot (`createPendingHubspotTaskForOwner`).
9. Guarda la relación (`saveOperationsVentasSync`, `db.php:277`) y comenta en la tarea de Asana confirmando el ID de HubSpot creado, para que el equipo vea en Asana que ya viajó.

Limitación de diseño (no un bug): la tarea creada en HubSpot **no queda asociada a ningún deal/contacto** automáticamente — el vendedor debe asociarla manualmente.

---

## Resumen de las 3 capas del código

| Capa | Archivo | Responsabilidad |
|---|---|---|
| Router + lógica de negocio | `public/index.php` | Decide *qué* hacer con cada evento |
| Clientes API | `asana.php`, `hubspot.php` | *Cómo* hablar con cada plataforma (HTTP, payloads) |
| Persistencia | `db.php` | Memoria del sistema: qué ya se sincronizó, auditoría de eventos |

Para el inventario completo de funciones, problemas de buenas prácticas y requerimientos de migración a Node.js, ver [OVERVIEW.md](OVERVIEW.md).
