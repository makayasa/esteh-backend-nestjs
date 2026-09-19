import { NestFactory } from '@nestjs/core';
import 'dotenv/config';
import { AppModule } from './app.module.js';
import { configureHttp } from './http.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  configureHttp(app);
  app.enableShutdownHooks();
  // Bind adres default 127.0.0.1; LAN opt-in via HOST env (zie .env.example).
  await app.listen(process.env.PORT ?? 3000, process.env.HOST ?? '127.0.0.1');
}
await bootstrap();
