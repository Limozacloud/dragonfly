// AES-256-GCM encryption with PBKDF2 key derivation
// Uses Web Crypto API (available in Tauri WebView)

const PBKDF2_ITERATIONS = 100_000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

function bufToBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function base64ToBuf(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encrypt(data: string, key: CryptoKey): Promise<string> {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(data)
  );

  // Format: iv:ciphertext (both base64)
  return bufToBase64(iv.buffer) + ':' + bufToBase64(encrypted);
}

export async function decrypt(data: string, key: CryptoKey): Promise<string> {
  const [ivB64, cipherB64] = data.split(':');
  const iv = new Uint8Array(base64ToBuf(ivB64));
  const ciphertext = base64ToBuf(cipherB64);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}

export async function hashPassphrase(passphrase: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const key = await deriveKey(passphrase, salt);

  // Encrypt a known marker to verify the passphrase later
  const marker = 'dragonfly-verified';
  const encrypted = await encrypt(marker, key);

  // Format: salt:encryptedMarker
  return bufToBase64(salt.buffer) + '|' + encrypted;
}

export async function verifyPassphrase(passphrase: string, storedHash: string): Promise<boolean> {
  try {
    const [saltB64, encryptedMarker] = storedHash.split('|');
    const salt = new Uint8Array(base64ToBuf(saltB64));
    const key = await deriveKey(passphrase, salt);
    const decrypted = await decrypt(encryptedMarker, key);
    return decrypted === 'dragonfly-verified';
  } catch {
    return false;
  }
}

// Derive a sync encryption key from space key + URL
export async function deriveSyncKey(spaceKey: string, url: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  // Normalize URL: lowercase, strip trailing slashes, strip protocol for consistent salt
  const normalized = url.trim().toLowerCase().replace(/\/+$/, '');
  const salt = encoder.encode(normalized);
  return deriveKey(spaceKey, new Uint8Array(salt));
}

// Derive AES-256-GCM key from reminder_sync_secret for encrypting personal todos/settings.
// Uses a fixed salt so both devices derive the same key from the same secret.
export async function deriveReminderEncKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const salt = encoder.encode('dragonfly-reminder-enc');
  return deriveKey(secret, new Uint8Array(salt));
}

// SHA-256 hex of the reminder_sync_secret — used as the public filter field in PocketBase.
// Stored in PB so the server never sees the actual secret.
export async function hashSecret(secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', encoder.encode(secret));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
