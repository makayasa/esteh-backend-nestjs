// Q27: decode/re-encode accepted still images; metadata never copied.
import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

export const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;
export const EVIDENCE_DIR = () => process.env.EVIDENCE_DIR ?? 'uploads';
export const EVIDENCE_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;
type Mime = (typeof EVIDENCE_MIME)[number];
export const evidenceExtension = (mime: Mime) =>
  mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : 'webp';

export async function sanitizeEvidence(
  mime: string,
  input: Buffer,
): Promise<Buffer> {
  try {
    if (!EVIDENCE_MIME.includes(mime as Mime)) throw new Error('Invalid type');
    const image = sharp(input, {
      limitInputPixels: 20000000,
      failOn: 'warning',
    });
    const metadata = await image.metadata();
    if (`image/${metadata.format}` !== mime || (metadata.pages ?? 1) !== 1)
      throw new Error('Invalid image');
    const output = await image.rotate().toBuffer();
    if (output.length > MAX_EVIDENCE_BYTES) throw new Error('Output too large');
    return output;
  } catch {
    throw new BadRequestException('Bukti invalid');
  }
}

// Unique names preserve bound evidence even if DB commit fails after file write.
export async function saveEvidence(
  saleId: string,
  mime: Mime,
  bytes: Buffer,
): Promise<string> {
  const dir = EVIDENCE_DIR();
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const name = `${saleId}-${randomUUID()}.${evidenceExtension(mime)}`;
  const temp = path.join(dir, `.tmp-${randomUUID()}`);
  try {
    await writeFile(temp, bytes, { mode: 0o600, flag: 'wx' });
    await rename(temp, path.join(dir, name));
  } catch (error) {
    await unlink(temp).catch(() => {});
    throw error;
  }
  return name;
}

export async function readEvidence(name: string): Promise<Buffer> {
  if (path.basename(name) !== name)
    throw new BadRequestException('Bukti invalid');
  return readFile(path.join(EVIDENCE_DIR(), name));
}
