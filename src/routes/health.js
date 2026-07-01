export function registerHealth(app) {
  app.get('/', async () => ({ ok: true, message: 'Servicio activo', path: '/' }));
}
