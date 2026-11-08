import {ensureIoTStore} from './iot/store.js';
import {IoTService} from './iot/service.js';
import {MarketGuard} from './market/market.module.js';
import {setupIoTRealtime} from './iot/realtime.js';
import {ensureMarketSchema} from './market/schema.js';
import { initializeIdentity } from './identity/store.js';
import { FederationService } from './identity/federation.js';
import { PlatformService } from './platform/platform.service.js';
import { JwtService } from '@nestjs/jwt';
import { initializeRegistry } from './tenancy/registry.js';
import { tenantMiddleware } from './tenancy/http.js';
import { FileTickets } from './tenancy/files.js';
import { currentTenant } from './tenancy/context.js';
import * as validator from 'class-validator';
import * as transformer from 'class-transformer';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { json, static as serveStatic } from 'express';
import { join } from 'node:path';
import { setupSocketIO } from './websocket/socketio-handler.js';

export async function createApp() {
  const app = await NestFactory.create(AppModule);

  await initializeRegistry();
  await app.get(PlatformService).initialize();
  await initializeIdentity();
  await ensureMarketSchema();
  await ensureIoTStore();
  setupIoTRealtime(setupSocketIO(app),app.get(MarketGuard),app.get(IoTService));

  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  app.use(json({ limit: '50mb' }));
  const jwt = app.get(JwtService);
  app.use(app.get(FederationService).middleware());
  app.use(tenantMiddleware(jwt));
  app.use('/uploads', (req: any, res: any, next: any) => {
    const root = join(process.cwd(), 'uploads', currentTenant().id);
    const prefix = '/' + currentTenant().id;
    if (!req.url.startsWith(prefix + '/')) return res.sendStatus(403);
    req.url = req.url.slice(prefix.length);
    return serveStatic(root, {dotfiles:'deny',fallthrough:false,setHeaders:(response:any)=>{response.setHeader('Cache-Control','private, no-store');response.setHeader('X-Content-Type-Options','nosniff');response.setHeader('Referrer-Policy','no-referrer');}})(req,res,next);
  });
  app.useGlobalInterceptors(new FileTickets(jwt));
  app.useGlobalPipes(new ValidationPipe({ transform: true, validatorPackage: validator, transformerPackage: transformer }));

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
