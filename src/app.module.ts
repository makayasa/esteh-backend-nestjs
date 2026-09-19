import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { HealthModule } from './health/health.module.js';
import { IdentityModule } from './identity/identity.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { SalesModule } from './sales/sales.module.js';

@Module({
  imports: [HealthModule, IdentityModule, CatalogModule, SalesModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
