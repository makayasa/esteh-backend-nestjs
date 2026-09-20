import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IdentityService } from '../identity/identity.service.js';
import { object, text } from '../input.js';

@Injectable()
export class CatalogService {
  constructor(private readonly identity: IdentityService) {}
  materials(auth: unknown, page = '1') {
    if (!/^[1-9]\d{0,5}$/.test(page))
      throw new BadRequestException('Page invalid');
    return this.identity.authenticated(auth, async (tx) => ({
      items: await tx.material.findMany({
        select: {
          id: true,
          name: true,
          unit: true,
          quantityScale: true,
          active: true,
        },
        orderBy: { id: 'asc' },
        take: 50,
        skip: (Number(page) - 1) * 50,
      }),
      page: Number(page),
      pageSize: 50,
    }));
  }
  saveMaterial(auth: unknown, key: unknown, input: unknown, id?: string) {
    const value = object(
      input,
      id ? ['name', 'active'] : ['name', 'unit', 'quantityScale'],
    );
    const name = text(value.name, 1, 120).trim();
    if (!name) throw new BadRequestException('Nama invalid');
    if (id) {
      const active = value.active;
      if (typeof active !== 'boolean')
        throw new BadRequestException('Active invalid');
      return this.identity.write(
        auth,
        'material.update',
        key,
        { id, name, active },
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Material" WHERE id = ${id} FOR UPDATE`;
          if (!(await tx.material.findUnique({ where: { id } })))
            throw new NotFoundException();
          const result = await tx.material.update({
            where: { id },
            data: { name, active },
          });
          return { result, objectId: id };
        },
      );
    }
    const unit = text(value.unit, 1, 24);
    const quantityScale = value.quantityScale;
    if (
      !/^[a-z][a-z0-9_-]*$/.test(unit) ||
      typeof quantityScale !== 'number' ||
      !Number.isInteger(quantityScale) ||
      quantityScale < 0 ||
      quantityScale > 3
    )
      throw new BadRequestException('Satuan/presisi invalid');
    return this.identity.write(
      auth,
      'material.create',
      key,
      { name, unit, quantityScale },
      async (tx) => {
        const result = await tx.material.create({
          data: { name, unit, quantityScale },
        });
        return { result, objectId: result.id };
      },
    );
  }
  products(auth: unknown, page = '1') {
    if (!/^[1-9]\d{0,5}$/.test(page))
      throw new BadRequestException('Page invalid');
    return this.identity.authenticated(auth, async (tx) => ({
      items: await tx.product.findMany({
        orderBy: { id: 'asc' },
        take: 50,
        skip: (Number(page) - 1) * 50,
      }),
      page: Number(page),
      pageSize: 50,
    }));
  }
  saveProduct(auth: unknown, key: unknown, input: unknown, id?: string) {
    const value = object(
      input,
      id
        ? ['name', 'price', 'available', 'active']
        : ['name', 'price', 'available'],
    );
    const name = text(value.name, 1, 120).trim();
    const price = value.price;
    const available = value.available;
    const active = id ? value.active : true;
    if (
      !name ||
      typeof price !== 'number' ||
      !Number.isInteger(price) ||
      price < 1 ||
      price > 1000000000 ||
      typeof available !== 'boolean' ||
      typeof active !== 'boolean'
    )
      throw new BadRequestException('Produk invalid');
    const data = { name, price, available, active };
    return this.identity.write(
      auth,
      id ? 'product.update' : 'product.create',
      key,
      { id: id ?? null, ...data },
      async (tx) => {
        if (id) {
          await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${id} FOR UPDATE`;
          if (!(await tx.product.findUnique({ where: { id } })))
            throw new NotFoundException();
        }
        const result = id
          ? await tx.product.update({ where: { id }, data })
          : await tx.product.create({ data });
        return { result, objectId: result.id };
      },
    );
  }
}
