import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import type { Request, Response } from 'express';
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
  @Post(':id/evidence')
  @HttpCode(200)
  uploadEvidence(
    @Headers('authorization') auth: unknown,
    @Headers('idempotency-key') key: unknown,
    @Param('id') id: string,
    @Headers('content-type') mime: string | undefined,
    @Req() request: Request,
  ) {
    // Body mentah dari express.raw (http.ts); parser image/* di global.
    const type = (mime ?? '').split(';')[0].trim();
    return this.sales.uploadEvidence(auth, key, id, type, request.body);
  }
  @Get(':id/evidence')
  async readEvidence(
    @Headers('authorization') auth: unknown,
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    const { mime, bytes } = await this.sales.readEvidence(auth, id);
    response.type(mime).send(bytes);
  }
  @Post(':id/confirm')
  @HttpCode(200)
  confirm(
    @Headers('authorization') auth: unknown,
    @Headers('idempotency-key') key: unknown,
    @Param('id') id: string,
    @Body() input: unknown,
  ) {
    return this.sales.confirm(auth, key, id, input);
  }
}