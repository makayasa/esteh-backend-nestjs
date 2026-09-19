import { BadRequestException } from '@nestjs/common';

export function object(
  input: unknown,
  fields: string[],
): Record<string, unknown> {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !fields.includes(key))
  )
    throw new BadRequestException('Payload invalid');
  return input as Record<string, unknown>;
}

export function text(input: unknown, min: number, max: number): string {
  if (typeof input !== 'string' || input.length < min || input.length > max) {
    throw new BadRequestException('Nilai teks invalid');
  }
  return input;
}

export function credentials(input: unknown) {
  const value = object(input, ['username', 'password']);
  const username = text(value.username, 3, 64);
  if (!/^[a-z0-9._-]+$/.test(username))
    throw new BadRequestException('Username invalid');
  return { username, password: text(value.password, 12, 128) };
}
