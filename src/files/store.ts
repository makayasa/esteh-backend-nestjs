// P5/Q27: bukti QRIS disimpan privat pada volume; file divalidasi isinya
// (JPEG/PNG/WebP, maks 5 MB) dan metadata lokasi dibuang sebelum disimpan.
// Akses selalu lewat izin transaksi, tidak pernah tautan statis.
import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;
export const EVIDENCE_DIR = () => process.env.EVIDENCE_DIR ?? 'uploads';

const invalid = () => new BadRequestException('Bukti invalid');

// JPEG: buang segmen APP1..APPn (Exif/XMP dapat memuat GPS) dan komentar.
// Data terkompresi setelah SOS disalin utuh.
const stripJpeg = (input: Buffer): Buffer => {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8)
    throw invalid();
  const out: Buffer[] = [input.subarray(0, 2)];
  let i = 2;
  while (i < input.length) {
    if (input[i] !== 0xff) throw invalid();
    const marker = input[i + 1];
    if (marker === 0xff) {
      i++;
      continue;
    }
    if (marker === 0xd9) {
      out.push(input.subarray(i, i + 2));
      return Buffer.concat(out);
    }
    if (i + 4 > input.length) throw invalid();
    const length = input.readUInt16BE(i + 2);
    if (length < 2 || i + 2 + length > input.length) throw invalid();
    const segment = input.subarray(i, i + 2 + length);
    if (marker === 0xda) {
      // SOS: entropy-coded data mengikuti sampai EOI tanpa struktur marker.
      out.push(segment, input.subarray(i + segment.length));
      return Buffer.concat(out);
    }
    // E1..EF: metadata APPn tanpa JFIF APP0; lokasi ada di Exif (E1).
    if (marker < 0xe1 || marker > 0xef) out.push(segment);
    i += segment.length;
  }
  throw invalid();
};

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

// PNG: buang chunk eXIf/tEXt/iTXt/zTXt; chunk lain (IHDR, IDAT, IEND) tetap.
const stripPng = (input: Buffer): Buffer => {
  if (input.length < 12 || !input.subarray(0, 8).equals(PNG_SIGNATURE))
    throw invalid();
  const out: Buffer[] = [PNG_SIGNATURE];
  let i = 8;
  while (i < input.length) {
    if (i + 8 > input.length) throw invalid();
    const length = input.readUInt32BE(i);
    const type = input.toString('latin1', i + 4, i + 8);
    if (length > MAX_EVIDENCE_BYTES || i + 12 + length > input.length)
      throw invalid();
    const total = 12 + length;
    if (type !== 'eXIf' && type !== 'tEXt' && type !== 'iTXt' && type !== 'zTXt')
      out.push(input.subarray(i, i + total));
    i += total;
  }
  return Buffer.concat(out);
};

// WebP: buang chunk EXIF (GPS); ukuran RIFF diperbarui.
const stripWebp = (input: Buffer): Buffer => {
  if (
    input.length < 12 ||
    input.toString('latin1', 0, 4) !== 'RIFF' ||
    input.toString('latin1', 8, 12) !== 'WEBP'
  )
    throw invalid();
  const chunks: Buffer[] = [];
  let i = 12;
  while (i + 8 <= input.length) {
    const fourcc = input.toString('latin1', i, i + 4);
    const size = input.readUInt32LE(i + 4);
    const total = 8 + size + (size % 2);
    if (i + total > input.length) throw invalid();
    if (fourcc !== 'EXIF') chunks.push(input.subarray(i, i + total));
    i += total;
  }
  if (!chunks.length) throw invalid();
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  input.copy(header, 0, 0, 12);
  header.writeUInt32LE(body.length + 4, 4); // ukuran setelah field ini: 'WEBP' + chunk
  return Buffer.concat([header, body]);
};

const TYPES = {
  'image/jpeg': stripJpeg,
  'image/png': stripPng,
  'image/webp': stripWebp,
} as const;

export const EVIDENCE_MIME = Object.keys(TYPES) as (keyof typeof TYPES)[];
export const evidenceExtension = (mime: keyof typeof TYPES) =>
  mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : 'webp';

export const sanitizeEvidence = (mime: string, input: Buffer): Buffer => {
  const strip = TYPES[mime as keyof typeof TYPES];
  if (!strip) throw new BadRequestException('Tipe bukti invalid');
  return strip(input);
};

// Tulis file sebelum referensi DB dibuat (plan item 15): kegagalan tulis
// tidak menghasilkan referensi bukti rusak; tx gagal hanya meninggalkan
// orphan file, bukti terikat tetap utuh.
export async function saveEvidence(
  saleId: string,
  mime: keyof typeof TYPES,
  bytes: Buffer,
): Promise<string> {
  const dir = EVIDENCE_DIR();
  await mkdir(dir, { recursive: true });
  const temp = path.join(dir, `.tmp-${randomUUID()}`);
  const name = `${saleId}.${evidenceExtension(mime)}`;
  await writeFile(temp, bytes);
  await rename(temp, path.join(dir, name));
  return name;
}

export async function readEvidence(name: string): Promise<Buffer> {
  // Nama file dibuat sistem (UUID penjualan + ekstensi), tanpa input user.
  return readFile(path.join(EVIDENCE_DIR(), name));
}