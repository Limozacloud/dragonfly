import { getVersion } from '@tauri-apps/api/app';

const GITHUB_REPO = 'Limozacloud/dragonfly';
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
const RELEASES_URL = `https://github.com/${GITHUB_REPO}/releases`;

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  releaseUrl: string;
}

function compareVersions(current: string, latest: string): boolean {
  const c = current.replace(/^v/, '').split('.').map(Number);
  const l = latest.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < Math.max(c.length, l.length); i++) {
    const cv = c[i] || 0;
    const lv = l[i] || 0;
    if (lv > cv) return true;
    if (lv < cv) return false;
  }
  return false;
}

export async function checkForUpdate(): Promise<UpdateInfo> {
  const currentVersion = await getVersion();

  const response = await fetch(GITHUB_API_URL, {
    headers: { 'Accept': 'application/vnd.github.v3+json' },
  });

  if (!response.ok) {
    throw new Error(`GitHub API returned ${response.status}`);
  }

  const data = await response.json();
  const latestVersion = (data.tag_name as string).replace(/^v/, '');
  const hasUpdate = compareVersions(currentVersion, latestVersion);

  return {
    currentVersion,
    latestVersion,
    hasUpdate,
    releaseUrl: RELEASES_URL,
  };
}
