# 🚀 Guía de Deploy — Integración HubSpot ↔ Asana

> **Node.js 20 + Fastify + MongoDB 7 + Docker**  
> Para desplegar en servidor Hostinger (o cualquier VPS Linux)

---

## 📦 Archivos preparados para producción

| Archivo | Propósito |
|---|---|
| `Dockerfile` | Multi-stage: instala dependencias + copia solo lo necesario |
| `docker-compose.prod.yml` | Config de producción con healthchecks, logging, red interna |
| `.env.example` | Template de variables de entorno (subir a git) |
| `.env.production` | **CREAR EN SERVIDOR** — tokens reales, nunca en git |
| `.env.mongo` | **CREAR EN SERVIDOR** — credenciales de MongoDB |
| `docker/mongo-init-prod.js` | Crea usuario `app_user` e índices en Mongo |
| `.gitignore` | Excluye .env, node_modules, .claude/ del repo |
| `.dockerignore` | Excluye archivos innecesarios de la imagen Docker |
| `deploy.sh` | Script de deploy automático para el servidor |

---

## 🖥️ Preparación del proyecto local

### 1. Inicializar git

```bash
cd "/ruta/a/tu/proyecto"
git init
git add -A
git commit -m "Initial commit"
```

### 2. Crear repo privado en GitHub

1. Ve a https://github.com/new
2. Repositorio: `asana-hubspot-integration` (privado)
3. NO inicialices con README, .gitignore ni license
4. Conecta:

```bash
git remote add origin https://github.com/k4dejo/asana-hubspot-integration.git
git push -u origin main
```

### 3. Workflow diario

```bash
# Hacer cambios → commit → push
git add -A
git commit -m "Descripción del cambio"
git push
```

---

## ☁️ Configuración del servidor (una sola vez)

### 1. Conectar por SSH

```bash
ssh root@tu-ip-o-dominio
```

### 2. Instalar Docker

```bash
apt update && apt install -y docker.io docker-compose-v2
systemctl enable --now docker
```

### 3. Crear directorio de la app

```bash
mkdir -p /opt/tu-app
cd /opt/tu-app
```

### 4. Clonar el repositorio

```bash
git clone https://github.com/k4dejo/asana-hubspot-integration.git .
```

### 5. Crear archivos .env con secretos reales

```bash
nano /opt/tu-app/.env.production
```

Pega esto con tus valores reales (usa los mismos que tienes en tu `.env` local, pero cambia `APP_URL` y `MONGO_URI`):

```ini
APP_URL=https://tu-dominio.com
MONGO_URI=mongodb://app_user:LA-CONTRASEÑA-DE-MONGO@mongo:27017/asana_hubspot?authSource=asana_hubspot
MONGO_DB=asana_hubspot
HUBSPOT_TOKEN=pat-...
HUBSPOT_STAGE_ANALISIS=qualifiedtobuy
HUBSPOT_STAGE_PROPUESTA=presentationscheduled
HUBSPOT_STAGE_GANADA=closedwon
ASANA_TOKEN=...
ASANA_WORKSPACE_GID=1201861044080787
ASANA_PROJECT_GID=1216075129117158
ASANA_BREINER_USER_GID=...
ASANA_PLANOS_PROJECT_GID=1216075129117161
ASANA_PLANOS_SECTION_GID=1216075976240982
ASANA_PLANOS_ASSIGNEE_GID=...
ASANA_VENTAS_PROJECT_GID=1216075129117165
ASANA_HUBSPOT_TAG_NAME=HubSpot
ASANA_HUBSPOT_OWNER_MAP={"1216059260208615":"94391053"}
```

Asegura el archivo:

```bash
chmod 600 /opt/tu-app/.env.production
```

Ahora crea el archivo de credenciales de MongoDB:

```bash
nano /opt/tu-app/.env.mongo
```

```ini
MONGO_INITDB_ROOT_USERNAME=admin
MONGO_INITDB_ROOT_PASSWORD=<contraseña-segura-aleatoria>
```

```bash
chmod 600 /opt/tu-app/.env.mongo
```

### 6. Configurar la contraseña de app_user en mongo-init-prod.js

Edita `docker/mongo-init-prod.js` y cambia `<CAMBIAR-ESTA-CONTRASEÑA>` por la misma contraseña que pusiste en `MONGO_URI` del `.env.production`.

### 7. Configurar firewall

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

### 8. Primer build y deploy

```bash
cd /opt/tu-app
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml logs -f
```

Verifica que la app responde:

```bash
curl http://localhost:3005/
```

---

## 🔒 SSL con Caddy (recomendado)

Caddy obtiene y renueva certificados SSL automáticamente.

```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy
```

Edita `/etc/caddy/Caddyfile`:

```
tudominio.com {
    reverse_proxy localhost:3005
}
```

Reinicia:

```bash
systemctl restart caddy
```

¡Listo! Tu app ya está en `https://tudominio.com`.

---

## 🔄 Configurar webhooks en producción

Una vez que el dominio con SSL esté funcionando:

### HubSpot (producción)

1. Settings → Integrations → Webhooks
2. URL: `https://tudominio.com/hubspot-webhook`
3. Eventos: deal stage changes

### Asana (desde la app)

Conecta al servidor y usa los endpoints de la app:

```bash
# Crear webhooks de Asana
curl -X POST https://tudominio.com/create-asana-webhook
curl -X POST https://tudominio.com/create-asana-ventas-webhook
curl -X POST https://tudominio.com/create-asana-planos-webhook
```

---

## 📋 Mantenimiento

### Ver logs

```bash
docker compose -f docker-compose.prod.yml logs -f app
docker compose -f docker-compose.prod.yml logs -f mongo
```

### Backups de MongoDB

```bash
docker exec $(docker ps -q -f name=mongo) mongodump \
  --username admin --password $MONGO_ROOT_PASSWORD \
  --out /tmp/backup-$(date +%Y%m%d)
docker cp $(docker ps -q -f name=mongo):/tmp/backup-* /root/backups/
```

### Reiniciar servicios

```bash
docker compose -f docker-compose.prod.yml restart
```

### Actualizar (después de git push)

```bash
cd /opt/tu-app && ./deploy.sh
```

---

## 🛡️ Checklist de seguridad

- [ ] `.env.production` con `chmod 600`
- [ ] `.env.mongo` con `chmod 600`
- [ ] Puerto 27017 **NO** expuesto al exterior
- [ ] Firewall activo (solo 22, 80, 443)
- [ ] SSH solo con llave pública (no contraseña)
- [ ] Actualizaciones automáticas: `apt install unattended-upgrades`
- [ ] `.env` real **NO** está en git (confirmar con `git status`)
- [ ] Los webhooks de HubSpot/Asana apuntan a HTTPS
