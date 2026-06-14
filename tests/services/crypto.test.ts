import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, deriveKey, hashPassphrase, verifyPassphrase, hashSecret } from '@/services/crypto';

const testKey = async () => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return deriveKey('test-passphrase', salt);
};

describe('encrypt / decrypt', () => {
  it('roundtrips a string correctly', async () => {
    const key = await testKey();
    const plaintext = 'Hello, DragonFly!';
    const ciphertext = await encrypt(plaintext, key);
    const result = await decrypt(ciphertext, key);
    expect(result).toBe(plaintext);
  });

  it('produces different ciphertext each call (random IV)', async () => {
    const key = await testKey();
    const a = await encrypt('same', key);
    const b = await encrypt('same', key);
    expect(a).not.toBe(b);
  });

  it('fails to decrypt with a different key', async () => {
    const key1 = await testKey();
    const key2 = await testKey();
    const ciphertext = await encrypt('secret', key1);
    await expect(decrypt(ciphertext, key2)).rejects.toThrow();
  });
});

describe('hashPassphrase / verifyPassphrase', () => {
  it('verifies a correct passphrase', async () => {
    const hash = await hashPassphrase('my-password');
    expect(await verifyPassphrase('my-password', hash)).toBe(true);
  });

  it('rejects a wrong passphrase', async () => {
    const hash = await hashPassphrase('correct');
    expect(await verifyPassphrase('wrong', hash)).toBe(false);
  });

  it('produces different hashes for the same passphrase (random salt)', async () => {
    const a = await hashPassphrase('same');
    const b = await hashPassphrase('same');
    expect(a).not.toBe(b);
  });
});

describe('hashSecret', () => {
  it('returns a 64-character hex string', async () => {
    const result = await hashSecret('my-secret');
    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[0-9a-f]+$/);
  });

  it('is deterministic', async () => {
    const a = await hashSecret('same-secret');
    const b = await hashSecret('same-secret');
    expect(a).toBe(b);
  });

  it('differs for different inputs', async () => {
    const a = await hashSecret('secret-a');
    const b = await hashSecret('secret-b');
    expect(a).not.toBe(b);
  });
});
