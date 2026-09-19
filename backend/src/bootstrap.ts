import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { json } from 'express';
import { setupSocketIO } from './websocket/socketio-handler.js';

export async function createApp() {
  const app = await NestFactory.create(AppModule);

  setupSocketIO(app);

  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  app.use(json({ limit: '50mb' }));

  return app;
}

let appInstance: Awaited<ReturnType<typeof createApp>>;

export async function getApp() {
  if (!appInstance) {
    appInstance = await createApp();
  }
  return appInstance;
}

export { json };
