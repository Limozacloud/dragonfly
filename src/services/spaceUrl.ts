/**
 * Space URL utilities for dragonfly:// protocol
 * Format: dragonfly://host/base64key
 */

export function generateSpaceUrl(serverUrl: string, spaceKey: string): string {
  // Strip protocol
  const host = serverUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const encodedKey = btoa(spaceKey);
  return `dragonfly://${host}/${encodedKey}`;
}

export function parseSpaceUrl(input: string): { serverUrl: string; spaceKey: string } | null {
  const trimmed = input.trim();

  // Match dragonfly://host/base64key
  const match = trimmed.match(/^dragonfly:\/\/([^/]+)\/(.+)$/);
  if (!match) return null;

  const host = match[1];
  const encodedKey = match[2];

  try {
    const spaceKey = atob(encodedKey);
    if (!spaceKey) return null;
    return {
      serverUrl: `https://${host}`,
      spaceKey,
    };
  } catch {
    return null;
  }
}
