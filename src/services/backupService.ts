import { invoke } from '@tauri-apps/api/core';

export interface BackupEntry {
  name: string;
  size: number;
  created: string;
}

export async function createBackup(): Promise<string> {
  return invoke<string>('create_backup');
}

export async function listBackups(): Promise<BackupEntry[]> {
  return invoke<BackupEntry[]>('list_backups');
}

export async function deleteBackup(name: string): Promise<void> {
  return invoke('delete_backup', { name });
}
