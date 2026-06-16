-- DragonFly – Seed Data
-- Inserts dummy data for all tables to support local testing.
-- Apply with: .\scripts\seed.ps1  (or: Get-Content .\scripts\seed-alpha-beta.sql | sqlite3 <path-to-dragonfly.db>)

-- ── Projects ──────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO projects (id, name, description, color, created_at, updated_at, deleted) VALUES
  ('proj-alpha-0001', 'Alpha Project',  'Main development project for the Alpha product line.', '#0077B6', '2026-01-10T08:00:00.000Z', '2026-06-01T10:00:00.000Z', 0),
  ('proj-beta-0002',  'Beta Project',   'Experimental features and research spike work.',        '#2D6A4F', '2026-02-15T09:00:00.000Z', '2026-06-10T14:00:00.000Z', 0);

-- ── Users ─────────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO users (id, project_id, name, color, created_at, updated_at, deleted) VALUES
  ('user-alice-0001', 'proj-alpha-0001', 'Alice Müller',   '#E63946', '2026-01-10T08:01:00.000Z', '2026-01-10T08:01:00.000Z', 0),
  ('user-bob-0002',   'proj-alpha-0001', 'Bob Schmidt',    '#457B9D', '2026-01-10T08:02:00.000Z', '2026-01-10T08:02:00.000Z', 0),
  ('user-carol-0003', 'proj-alpha-0001', 'Carol Weber',    '#F4A261', '2026-01-10T08:03:00.000Z', '2026-01-10T08:03:00.000Z', 0),
  ('user-dave-0004',  'proj-beta-0002',  'Dave Fischer',   '#6A4C93', '2026-02-15T09:01:00.000Z', '2026-02-15T09:01:00.000Z', 0),
  ('user-eve-0005',   'proj-beta-0002',  'Eve Hoffmann',   '#2A9D8F', '2026-02-15T09:02:00.000Z', '2026-02-15T09:02:00.000Z', 0);

-- ── Releases ──────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO releases (id, project_id, name, description, created_at, updated_at, deleted) VALUES
  ('rel-alpha-v10',  'proj-alpha-0001', 'v1.0', 'Initial public release.',            '2026-01-15T10:00:00.000Z', '2026-01-15T10:00:00.000Z', 0),
  ('rel-alpha-v11',  'proj-alpha-0001', 'v1.1', 'Bugfix and stability improvements.', '2026-03-01T10:00:00.000Z', '2026-03-01T10:00:00.000Z', 0),
  ('rel-alpha-v20',  'proj-alpha-0001', 'v2.0', 'Major feature release.',             '2026-06-01T10:00:00.000Z', '2026-06-01T10:00:00.000Z', 0),
  ('rel-beta-v01',   'proj-beta-0002',  'v0.1', 'Internal prototype.',                '2026-02-20T10:00:00.000Z', '2026-02-20T10:00:00.000Z', 0),
  ('rel-beta-v02',   'proj-beta-0002',  'v0.2', 'Second iteration.',                  '2026-04-10T10:00:00.000Z', '2026-04-10T10:00:00.000Z', 0);

-- ── Tasks – Alpha Project ─────────────────────────────────────────────────────
INSERT OR IGNORE INTO tasks (id, project_id, title, content, type, status, release_id, assignee_id, priority, tags, created_at, updated_at, deleted) VALUES
  ('task-a-001', 'proj-alpha-0001', 'Setup CI/CD pipeline',         '', 'task',    'done',        'rel-alpha-v10', 'user-bob-0002',   'high',   '["devops","ci"]',       '2026-01-11T09:00:00.000Z', '2026-02-01T10:00:00.000Z', 0),
  ('task-a-002', 'proj-alpha-0001', 'Design database schema',       '', 'task',    'done',        'rel-alpha-v10', 'user-alice-0001', 'high',   '["database"]',          '2026-01-11T09:05:00.000Z', '2026-01-30T10:00:00.000Z', 0),
  ('task-a-003', 'proj-alpha-0001', 'Implement user authentication', '', 'feature', 'done',        'rel-alpha-v10', 'user-alice-0001', 'urgent', '["auth","security"]',   '2026-01-12T10:00:00.000Z', '2026-02-10T10:00:00.000Z', 0),
  ('task-a-004', 'proj-alpha-0001', 'Fix login redirect bug',       '', 'bug',     'done',        'rel-alpha-v11', 'user-bob-0002',   'urgent', '["auth","bug"]',        '2026-03-02T09:00:00.000Z', '2026-03-10T10:00:00.000Z', 0),
  ('task-a-005', 'proj-alpha-0001', 'Improve error messages',       '', 'task',    'done',        'rel-alpha-v11', 'user-carol-0003', 'low',    '["ux"]',                '2026-03-03T09:00:00.000Z', '2026-03-15T10:00:00.000Z', 0),
  ('task-a-006', 'proj-alpha-0001', 'Dark mode support',            '', 'feature', 'in_progress', 'rel-alpha-v20', 'user-carol-0003', 'medium', '["ui","design"]',       '2026-05-01T09:00:00.000Z', '2026-06-10T10:00:00.000Z', 0),
  ('task-a-007', 'proj-alpha-0001', 'Export to PDF',                '', 'feature', 'in_progress', 'rel-alpha-v20', 'user-alice-0001', 'medium', '["export"]',            '2026-05-05T09:00:00.000Z', '2026-06-12T10:00:00.000Z', 0),
  ('task-a-008', 'proj-alpha-0001', 'Performance audit',            '', 'task',    'in_review',   'rel-alpha-v20', 'user-bob-0002',   'high',   '["performance"]',       '2026-05-10T09:00:00.000Z', '2026-06-14T10:00:00.000Z', 0),
  ('task-a-009', 'proj-alpha-0001', 'Multi-language support',       '', 'epic',    'todo',        'rel-alpha-v20', 'user-alice-0001', 'medium', '["i18n"]',              '2026-05-15T09:00:00.000Z', '2026-05-15T09:00:00.000Z', 0),
  ('task-a-010', 'proj-alpha-0001', 'Mobile responsive layout',     '', 'story',   'todo',        'rel-alpha-v20', 'user-carol-0003', 'medium', '["ui","mobile"]',       '2026-05-20T09:00:00.000Z', '2026-05-20T09:00:00.000Z', 0),
  ('task-a-011', 'proj-alpha-0001', 'Write API documentation',      '', 'task',    'backlog',     NULL,            'user-bob-0002',   'low',    '["docs"]',              '2026-06-01T09:00:00.000Z', '2026-06-01T09:00:00.000Z', 0),
  ('task-a-012', 'proj-alpha-0001', 'Add keyboard shortcuts',       '', 'feature', 'backlog',     NULL,            NULL,              'low',    '["ux","accessibility"]','2026-06-05T09:00:00.000Z', '2026-06-05T09:00:00.000Z', 0),
  ('task-a-013', 'proj-alpha-0001', 'Session timeout bug',          '', 'bug',     'backlog',     NULL,            NULL,              'high',   '["auth","bug"]',        '2026-06-10T09:00:00.000Z', '2026-06-10T09:00:00.000Z', 0),
  ('task-a-014', 'proj-alpha-0001', 'Onboarding flow',              '', 'story',   'backlog',     NULL,            'user-alice-0001', 'medium', '["ux"]',                '2026-06-12T09:00:00.000Z', '2026-06-12T09:00:00.000Z', 0);

-- ── Tasks – Beta Project ──────────────────────────────────────────────────────
INSERT OR IGNORE INTO tasks (id, project_id, title, content, type, status, release_id, assignee_id, priority, tags, created_at, updated_at, deleted) VALUES
  ('task-b-001', 'proj-beta-0002', 'Research AI integration',     '', 'task',    'done',        'rel-beta-v01', 'user-dave-0004', 'high',   '["ai","research"]', '2026-02-16T09:00:00.000Z', '2026-03-01T10:00:00.000Z', 0),
  ('task-b-002', 'proj-beta-0002', 'Prototype voice input',       '', 'feature', 'in_progress', 'rel-beta-v02', 'user-eve-0005',  'medium', '["voice","ui"]',    '2026-04-11T09:00:00.000Z', '2026-06-01T10:00:00.000Z', 0),
  ('task-b-003', 'proj-beta-0002', 'Transcription accuracy test', '', 'task',    'todo',        'rel-beta-v02', 'user-dave-0004', 'medium', '["voice","qa"]',    '2026-04-15T09:00:00.000Z', '2026-04-15T09:00:00.000Z', 0),
  ('task-b-004', 'proj-beta-0002', 'Plugin architecture design',  '', 'epic',    'backlog',     NULL,           NULL,             'high',   '["architecture"]',  '2026-06-01T09:00:00.000Z', '2026-06-01T09:00:00.000Z', 0),
  ('task-b-005', 'proj-beta-0002', 'Memory leak in sync worker',  '', 'bug',     'backlog',     NULL,           'user-eve-0005',  'urgent', '["sync","bug"]',    '2026-06-10T09:00:00.000Z', '2026-06-10T09:00:00.000Z', 0);

-- ── Notes – Alpha Project ─────────────────────────────────────────────────────
INSERT OR IGNORE INTO notes (id, project_id, title, content, tags, parent_id, created_at, updated_at, deleted) VALUES
  ('note-a-001', 'proj-alpha-0001', 'Architecture Overview',   '[{"id":"blk1","type":"paragraph","props":{"textColor":"default","backgroundColor":"default","textAlignment":"left"},"content":[{"type":"text","text":"This document describes the overall system architecture for the Alpha Project.","styles":{}}],"children":[]}]', '["architecture","docs"]', NULL, '2026-01-12T10:00:00.000Z', '2026-05-01T10:00:00.000Z', 0),
  ('note-a-002', 'proj-alpha-0001', 'Frontend Architecture',   '[{"id":"blk2","type":"paragraph","props":{"textColor":"default","backgroundColor":"default","textAlignment":"left"},"content":[{"type":"text","text":"React + TypeScript with Zustand for state management and Tailwind for styling.","styles":{}}],"children":[]}]', '["frontend","architecture"]', 'note-a-001', '2026-01-13T10:00:00.000Z', '2026-04-01T10:00:00.000Z', 0),
  ('note-a-003', 'proj-alpha-0001', 'Backend Architecture',    '[{"id":"blk3","type":"paragraph","props":{"textColor":"default","backgroundColor":"default","textAlignment":"left"},"content":[{"type":"text","text":"Tauri v2 Rust backend with SQLite via tauri-plugin-sql.","styles":{}}],"children":[]}]', '["backend","architecture"]', 'note-a-001', '2026-01-13T10:30:00.000Z', '2026-04-01T10:00:00.000Z', 0),
  ('note-a-004', 'proj-alpha-0001', 'Meeting Notes – Kickoff', '[{"id":"blk4","type":"paragraph","props":{"textColor":"default","backgroundColor":"default","textAlignment":"left"},"content":[{"type":"text","text":"Kickoff meeting held on 2026-01-10. Team agreed on tech stack and initial milestones.","styles":{}}],"children":[]}]', '["meeting","kickoff"]', NULL, '2026-01-10T17:00:00.000Z', '2026-01-10T17:00:00.000Z', 0),
  ('note-a-005', 'proj-alpha-0001', 'API Design Decisions',    '[{"id":"blk5","type":"paragraph","props":{"textColor":"default","backgroundColor":"default","textAlignment":"left"},"content":[{"type":"text","text":"REST over GraphQL. Versioned endpoints at /api/v1/.","styles":{}}],"children":[]}]', '["api","design"]', NULL, '2026-02-01T10:00:00.000Z', '2026-02-01T10:00:00.000Z', 0),
  ('note-a-006', 'proj-alpha-0001', 'Auth Spec',               '[{"id":"blk6","type":"paragraph","props":{"textColor":"default","backgroundColor":"default","textAlignment":"left"},"content":[{"type":"text","text":"JWT tokens, 1h expiry, refresh token stored in httpOnly cookie.","styles":{}}],"children":[]}]', '["auth","spec"]', 'note-a-005', '2026-02-02T10:00:00.000Z', '2026-02-02T10:00:00.000Z', 0);

-- ── Notes – Beta Project ──────────────────────────────────────────────────────
INSERT OR IGNORE INTO notes (id, project_id, title, content, tags, parent_id, created_at, updated_at, deleted) VALUES
  ('note-b-001', 'proj-beta-0002', 'Research Index',         '[{"id":"blkb1","type":"paragraph","props":{"textColor":"default","backgroundColor":"default","textAlignment":"left"},"content":[{"type":"text","text":"Collection of research notes for the Beta project.","styles":{}}],"children":[]}]', '["research"]', NULL, '2026-02-16T10:00:00.000Z', '2026-02-16T10:00:00.000Z', 0),
  ('note-b-002', 'proj-beta-0002', 'AI Model Comparison',   '[{"id":"blkb2","type":"paragraph","props":{"textColor":"default","backgroundColor":"default","textAlignment":"left"},"content":[{"type":"text","text":"Evaluated Whisper, Vosk, and DeepSpeech for offline transcription.","styles":{}}],"children":[]}]', '["ai","research"]', 'note-b-001', '2026-02-18T10:00:00.000Z', '2026-02-18T10:00:00.000Z', 0),
  ('note-b-003', 'proj-beta-0002', 'Plugin System Concept',  '[{"id":"blkb3","type":"paragraph","props":{"textColor":"default","backgroundColor":"default","textAlignment":"left"},"content":[{"type":"text","text":"Plugins load from ~/.dragonfly/plugins/ as WASM modules.","styles":{}}],"children":[]}]', '["architecture","plugins"]', NULL, '2026-06-01T10:00:00.000Z', '2026-06-01T10:00:00.000Z', 0);

-- ── Scratchpads ───────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO scratchpads (id, project_id, title, content, created_at, updated_at, deleted) VALUES
  ('scratch-a-001', 'proj-alpha-0001', 'Quick Notes',        '[{"id":"blks1","type":"paragraph","props":{"textColor":"default","backgroundColor":"default","textAlignment":"left"},"content":[{"type":"text","text":"TODO: Check if dark mode works on Windows 10.","styles":{}}],"children":[]}]', '2026-06-01T10:00:00.000Z', '2026-06-01T10:00:00.000Z', 0),
  ('scratch-a-002', 'proj-alpha-0001', 'Code Snippets',      '[{"id":"blks2","type":"paragraph","props":{"textColor":"default","backgroundColor":"default","textAlignment":"left"},"content":[{"type":"text","text":"Useful Rust snippets for the Tauri backend.","styles":{}}],"children":[]}]', '2026-06-03T10:00:00.000Z', '2026-06-03T10:00:00.000Z', 0),
  ('scratch-b-001', 'proj-beta-0002',  'Experiment Log',     '[{"id":"blks3","type":"paragraph","props":{"textColor":"default","backgroundColor":"default","textAlignment":"left"},"content":[{"type":"text","text":"2026-04-11: First successful voice transcription test with Whisper small model.","styles":{}}],"children":[]}]', '2026-04-11T15:00:00.000Z', '2026-04-11T15:00:00.000Z', 0);

-- ── Personal Todos ────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO personal_todos (id, title, notes, status, due_date, all_day, recurrence_type, recurrence_interval, recurrence_days, recurrence_end, next_occurrence, alert_minutes, notify_email, priority, tags, created_at, updated_at, deleted) VALUES
  ('todo-001', 'Weekly team standup',        'Every Monday 9:00', 'pending', '2026-06-16T07:00:00.000Z', 0, 'weekly', 1, '[1]', NULL, '2026-06-16T07:00:00.000Z', 15, 0, 'medium', '["meeting"]',  '2026-01-10T08:00:00.000Z', '2026-06-10T08:00:00.000Z', 0),
  ('todo-002', 'Submit expense report',      'Monthly on the 1st', 'pending', '2026-07-01T08:00:00.000Z', 1, 'monthly', 1, '[]', NULL, '2026-07-01T08:00:00.000Z', 60, 0, 'high',   '["admin"]',    '2026-06-01T08:00:00.000Z', '2026-06-01T08:00:00.000Z', 0),
  ('todo-003', 'Review open PRs',            '',                   'pending', '2026-06-17T14:00:00.000Z', 0, 'none',    1, '[]', NULL, '2026-06-17T14:00:00.000Z', 30, 0, 'high',   '["dev"]',      '2026-06-15T10:00:00.000Z', '2026-06-15T10:00:00.000Z', 0),
  ('todo-004', 'Update project roadmap',     '',                   'pending', '2026-06-20T10:00:00.000Z', 0, 'none',    1, '[]', NULL, '2026-06-20T10:00:00.000Z', -1, 0, 'medium', '["planning"]', '2026-06-15T10:00:00.000Z', '2026-06-15T10:00:00.000Z', 0),
  ('todo-005', 'Daily exercise',             '30 minutes',         'pending', '2026-06-16T06:00:00.000Z', 0, 'daily',   1, '[]', NULL, '2026-06-16T06:00:00.000Z', 10, 0, 'low',    '["health"]',   '2026-01-01T08:00:00.000Z', '2026-06-15T08:00:00.000Z', 0),
  ('todo-006', 'Read release notes v2.0',   '',                   'done',    NULL,                         1, 'none',    1, '[]', NULL, NULL,                         -1, 0, 'low',    '["dev"]',      '2026-06-01T08:00:00.000Z', '2026-06-14T08:00:00.000Z', 0),
  ('todo-007', 'Backup PocketBase data',    'Before schema upgrade', 'pending', '2026-06-18T09:00:00.000Z', 0, 'none', 1, '[]', NULL, '2026-06-18T09:00:00.000Z', 60, 0, 'urgent', '["ops"]',      '2026-06-15T09:00:00.000Z', '2026-06-15T09:00:00.000Z', 0);
