import { Task, Release, User } from '@/types';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { log } from './logService';

function escapeCsvField(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n') || value.includes(';')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

export async function exportTasksCsv(tasks: Task[], releases: Release[], users: User[]): Promise<void> {
  const header = ['Title', 'Type', 'Status', 'Release', 'Feature', 'Assignee', 'Tags', 'Created', 'Updated'];

  const rows = tasks.map((task) => {
    const release = task.releaseId ? releases.find((r) => r.id === task.releaseId)?.name ?? '' : '';
    const feature = task.featureId ? tasks.find((t) => t.id === task.featureId)?.title ?? '' : '';
    const assignee = task.assigneeId ? users.find((u) => u.id === task.assigneeId)?.name ?? '' : '';
    const tags = (task.tags || []).join(', ');

    return [
      task.title,
      task.type,
      task.status,
      release,
      feature,
      assignee,
      tags,
      task.createdAt,
      task.updatedAt,
    ].map(escapeCsvField).join(';');
  });

  const csv = '\uFEFF' + [header.join(';'), ...rows].join('\r\n');

  try {
    const filePath = await save({
      defaultPath: `dragonfly-tasks-${new Date().toISOString().slice(0, 10)}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });

    if (!filePath) return;

    await writeTextFile(filePath, csv);
  } catch (err) {
    log('ERR', 'csvExport.exportTasksCsv: ' + String(err));
  }
}
