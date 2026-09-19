import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { SalesService } from './sales.service.js';

@ApiBearerAuth()
@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}
  @Get()
  list(@Headers('authorization') auth: unknown, @Query('page') page?: string) {
    return this.sales.list(auth, page);
  }
  @Post()
  @HttpCode(200)
  create(
    @Headers('authorization') auth: unknown,
    @Headers('idempotency-key') key: unknown,
    @Body() input: unknown,
  ) {
    return this.sales.create(auth, key, input);
  }
  @Get(':id')
  detail(@Headers('authorization') auth: unknown, @Param('id') id: string) {
    return this.sales.detail(auth, id);
  }
}
