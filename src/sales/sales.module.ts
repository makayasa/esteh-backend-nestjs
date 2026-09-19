import { Module } from '@nestjs/common';
import { Clock } from '../clock.js';
import { IdentityModule } from '../identity/identity.module.js';
import { SalesController } from './sales.controller.js';
import { SalesService } from './sales.service.js';

@Module({
  imports: [IdentityModule],
  controllers: [SalesController],
  providers: [Clock, SalesService],
})
export class SalesModule {}
