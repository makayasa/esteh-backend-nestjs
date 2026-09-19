import { argon2, randomBytes, timingSafeEqual } from 'node:crypto';

const derive = (password: string, salt: Buffer) =>
  new Promise<Buffer>((resolve, reject) => {
    argon2(
      'argon2id',
      {
        message: password,
        nonce: salt,
        memory: 19456,
        passes: 2,
        parallelism: 1,
        tagLength: 32,
      },
      (error, hash) => (error ? reject(error) : resolve(hash)),
    );
  });

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await derive(password, salt);
  return `$argon2id$v=19$m=19456,t=2,p=1$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split('$');
  const expected = Buffer.from(parts[5] ?? '', 'base64');
  const actual = await derive(password, Buffer.from(parts[4] ?? '', 'base64'));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
