import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { json } from 'express';
import { setupSocketIO } from './websocket/socketio-handler.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Setup Socket.IO
  setupSocketIO(app);

  // Enable CORS
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Use JSON parser with proper UTF-8 handling
  app.use(json({ limit: '50mb' }));

  await app.listen(process.env.PORT ?? 8080);
}
await bootstrap();
