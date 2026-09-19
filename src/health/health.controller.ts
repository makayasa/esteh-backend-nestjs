import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { HealthService } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  async check() {
    const status = await this.health.check();
    if (status.database !== 'up') {
      throw new ServiceUnavailableException(status);
    }
    return status;
  }
}
