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
import { CatalogService } from './catalog.service.js';

@ApiBearerAuth()
@Controller('products')
export class ProductsController {
  constructor(private readonly catalog: CatalogService) {}
  @Get()
  list(@Headers('authorization') auth: unknown, @Query('page') page?: string) {
    return this.catalog.products(auth, page);
  }
  @Post()
  @HttpCode(200)
  create(
    @Headers('authorization') auth: unknown,
    @Headers('idempotency-key') key: unknown,
    @Body() input: unknown,
  ) {
    return this.catalog.saveProduct(auth, key, input);
  }
  @Post(':id')
  @HttpCode(200)
  update(
    @Headers('authorization') auth: unknown,
    @Headers('idempotency-key') key: unknown,
    @Body() input: unknown,
    @Param('id') id: string,
  ) {
    return this.catalog.saveProduct(auth, key, input, id);
  }
}
