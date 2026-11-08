import { createApp } from './bootstrap.js';
const app = await createApp();
await app.listen(process.env.PORT ?? 8080);
