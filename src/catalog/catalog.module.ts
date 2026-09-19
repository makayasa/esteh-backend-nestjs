import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { CatalogService } from './catalog.service.js';
import { ProductsController } from './catalog.controller.js';
import { MaterialsController } from './materials.controller.js';

@Module({
  imports: [IdentityModule],
  controllers: [ProductsController, MaterialsController],
  providers: [CatalogService],
})
export class CatalogModule {}
