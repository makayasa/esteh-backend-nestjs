import { Module } from '@nestjs/common';
import { Database } from '../database.js';
import { Clock } from '../clock.js';
import { AccountsController } from './accounts.controller.js';
import { AccountsService } from './accounts.service.js';
import { IdentityController } from './identity.controller.js';
import { IdentityService } from './identity.service.js';

@Module({
  controllers: [IdentityController, AccountsController],
  providers: [Database, Clock, IdentityService, AccountsService],
  exports: [IdentityService],
})
export class IdentityModule {}
