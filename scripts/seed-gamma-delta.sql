-- DragonFly – Seed Data (PC2: Gamma + Delta)
-- Simulates a second developer's local state with different projects and dates.
-- Apply with: .\scripts\seed.ps1 

-- ── Projects ──────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO projects (id, name, description, color, created_at, updated_at, deleted) VALUES
  ('proj-gamma-0003', 'Gamma Project', 'Mobile app companion for the Alpha product.',      '#C77DFF', '2026-03-01T08:00:00.000Z', '2026-06-05T10:00:00.000Z', 0),
  ('proj-delta-0004', 'Delta Project', 'Data analytics pipeline and reporting backend.', '#E76F51', '2026-04-01T09:00:00.000Z', '2026-06-12T14:00:00.000Z', 0);

-- ── Users ─────────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO users (id, project_id, name, color, created_at, updated_at, deleted) VALUES
  ('user-frank-0006', 'proj-gamma-0003', 'Frank Bauer',    '#0096C7', '2026-03-01T08:01:00.000Z', '2026-03-01T08:01:00.000Z', 0),
  ('user-grace-0007', 'proj-gamma-0003', 'Grace Klein',    '#D62828', '2026-03-01T08:02:00.000Z', '2026-03-01T08:02:00.000Z', 0),
  ('user-henry-0008', 'proj-delta-0004', 'Henry Wolf',     '#3D405B', '2026-04-01T09:01:00.000Z', '2026-04-01T09:01:00.000Z', 0),
  ('user-iris-0009',  'proj-delta-0004', 'Iris Neumann',   '#81B29A', '2026-04-01T09:02:00.000Z', '2026-04-01T09:02:00.000Z', 0),
  ('user-jan-0010',   'proj-delta-0004', 'Jan Richter',    '#F2CC8F', '2026-04-01T09:03:00.000Z', '2026-04-01T09:03:00.000Z', 0);

-- ── Releases ──────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO releases (id, project_id, name, description, created_at, updated_at, deleted) VALUES
  ('rel-gamma-v01', 'proj-gamma-0003', 'v0.1', 'iOS prototype.',                    '2026-03-10T10:00:00.000Z', '2026-03-10T10:00:00.000Z', 0),
  ('rel-gamma-v02', 'proj-gamma-0003', 'v0.2', 'Android support added.',            '2026-05-01T10:00:00.000Z', '2026-05-01T10:00:00.000Z', 0),
  ('rel-gamma-v10', 'proj-gamma-0003', 'v1.0', 'App Store release.',                '2026-07-01T10:00:00.000Z', '2026-07-01T10:00:00.000Z', 0),
  ('rel-delta-v10', 'proj-delta-0004', 'v1.0', 'Initial pipeline deployment.',      '2026-04-15T10:00:00.000Z', '2026-04-15T10:00:00.000Z', 0),
  ('rel-delta-v11', 'proj-delta-0004', 'v1.1', 'Dashboard and export features.',    '2026-06-01T10:00:00.000Z', '2026-06-01T10:00:00.000Z', 0);

-- ── Tasks – Gamma Project ─────────────────────────────────────────────────────
INSERT OR IGNORE INTO tasks (id, project_id, title, content, type, status, release_id, assignee_id, priority, tags, created_at, updated_at, deleted) VALUES
  ('task-g-001', 'proj-gamma-0003', 'Wireframes for main screens',     '', 'task',    'done',        'rel-gamma-v01', 'user-grace-0007', 'high',   '["design","ui"]',      '2026-03-02T09:00:00.000Z', '2026-03-20T10:00:00.000Z', 0),
  ('task-g-002', 'proj-gamma-0003', 'Setup React Native project',      '', 'task',    'done',        'rel-gamma-v01', 'user-frank-0006', 'high',   '["setup","mobile"]',   '2026-03-02T09:05:00.000Z', '2026-03-15T10:00:00.000Z', 0),
  ('task-g-003', 'proj-gamma-0003', 'Push notification integration',   '', 'feature', 'done',        'rel-gamma-v02', 'user-frank-0006', 'medium', '["notifications"]',    '2026-05-02T09:00:00.000Z', '2026-05-20T10:00:00.000Z', 0),
  ('task-g-004', 'proj-gamma-0003', 'Android crash on startup',        '', 'bug',     'done',        'rel-gamma-v02', 'user-frank-0006', 'urgent', '["android","bug"]',    '2026-05-10T09:00:00.000Z', '2026-05-18T10:00:00.000Z', 0),
  ('task-g-005', 'proj-gamma-0003', 'Offline mode support',            '', 'feature', 'in_progress', 'rel-gamma-v10', 'user-frank-0006', 'high',   '["offline","sync"]',   '2026-06-01T09:00:00.000Z', '2026-06-10T10:00:00.000Z', 0),
  ('task-g-006', 'proj-gamma-0003', 'App Store screenshots',           '', 'task',    'in_progress', 'rel-gamma-v10', 'user-grace-0007', 'medium', '["marketing","store"]','2026-06-05T09:00:00.000Z', '2026-06-12T10:00:00.000Z', 0),
  ('task-g-007', 'proj-gamma-0003', 'Accessibility audit',             '', 'task',    'in_review',   'rel-gamma-v10', 'user-grace-0007', 'high',   '["a11y"]',             '2026-06-08T09:00:00.000Z', '2026-06-14T10:00:00.000Z', 0),
  ('task-g-008', 'proj-gamma-0003', 'Deep link handling',              '', 'feature', 'todo',        'rel-gamma-v10', 'user-frank-0006', 'medium', '["mobile","routing"]', '2026-06-10T09:00:00.000Z', '2026-06-10T09:00:00.000Z', 0),
  ('task-g-009', 'proj-gamma-0003', 'Biometric login',                 '', 'feature', 'backlog',     NULL,            NULL,              'medium', '["auth","mobile"]',    '2026-06-12T09:00:00.000Z', '2026-06-12T09:00:00.000Z', 0),
  ('task-g-010', 'proj-gamma-0003', 'Widget support',                  '', 'epic',    'backlog',     NULL,            NULL,              'low',    '["mobile","widget"]',  '2026-06-14T09:00:00.000Z', '2026-06-14T09:00:00.000Z', 0);

-- ── Tasks – Delta Project ─────────────────────────────────────────────────────
INSERT OR IGNORE INTO tasks (id, project_id, title, content, type, status, release_id, assignee_id, priority, tags, created_at, updated_at, deleted) VALUES
  ('task-d-001', 'proj-delta-0004', 'Define data ingestion schema',    '', 'task',    'done',        'rel-delta-v10', 'user-henry-0008', 'high',   '["data","schema"]',    '2026-04-02T09:00:00.000Z', '2026-04-20T10:00:00.000Z', 0),
  ('task-d-002', 'proj-delta-0004', 'Build ETL pipeline (CSV)',        '', 'feature', 'done',        'rel-delta-v10', 'user-henry-0008', 'high',   '["etl","data"]',       '2026-04-05T09:00:00.000Z', '2026-04-25T10:00:00.000Z', 0),
  ('task-d-003', 'proj-delta-0004', 'Deploy to staging',               '', 'task',    'done',        'rel-delta-v10', 'user-jan-0010',   'urgent', '["devops"]',           '2026-04-20T09:00:00.000Z', '2026-04-28T10:00:00.000Z', 0),
  ('task-d-004', 'proj-delta-0004', 'Dashboard MVP',                   '', 'feature', 'in_progress', 'rel-delta-v11', 'user-iris-0009',  'high',   '["dashboard","ui"]',   '2026-06-02T09:00:00.000Z', '2026-06-12T10:00:00.000Z', 0),
  ('task-d-005', 'proj-delta-0004', 'Export to Excel',                 '', 'feature', 'in_progress', 'rel-delta-v11', 'user-iris-0009',  'medium', '["export"]',           '2026-06-05T09:00:00.000Z', '2026-06-14T10:00:00.000Z', 0),
  ('task-d-006', 'proj-delta-0004', 'Null values crash on import',     '', 'bug',     'todo',        'rel-delta-v11', 'user-henry-0008', 'urgent', '["bug","data"]',       '2026-06-10T09:00:00.000Z', '2026-06-10T09:00:00.000Z', 0),
  ('task-d-007', 'proj-delta-0004', 'Role-based access control',       '', 'feature', 'todo',        'rel-delta-v11', NULL,              'high',   '["auth","security"]',  '2026-06-12T09:00:00.000Z', '2026-06-12T09:00:00.000Z', 0),
  ('task-d-008', 'proj-delta-0004', 'Real-time streaming support',     '', 'epic',    'backlog',     NULL,            NULL,              'medium', '["streaming","data"]', '2026-06-14T09:00:00.000Z', '2026-06-14T09:00:00.000Z', 0),
  ('task-d-009', 'proj-delta-0004', 'API rate limiting',               '', 'task',    'backlog',     NULL,            'user-jan-0010',   'low',    '["api","security"]',   '2026-06-15T09:00:00.000Z', '2026-06-15T09:00:00.000Z', 0);

-- ── Notes – Gamma Project ─────────────────────────────────────────────────────
INSERT OR IGNORE INTO notes (id, project_id, title, content, tags, parent_id, created_at, updated_at, deleted) VALUES
  ('note-g-001', 'proj-gamma-0003', 'Mobile Design System',     '[{"id":"blkg1","type":"paragraph","props":{"textColor":"default","backgroundColor":"default","textAlignment":"left"},"content":[{"type":"text","text":"Color tokens, spacing scale, and component library for the Gamma mobile app.","styles":{}}],"children":[]}]', '["design","mobile"]', NULL,         '2026-03-05T10:00:00.000Z', '2026-05-01T10:00:00.000Z', 0),
  ('note-g-002', 'proj-gamma-0003', 'iOS Guidelines',           '[{"id":"blkg2","type":"paragraph","props":{"textColor":"default","backgroundColor":"default","textAlignment":"left"},"content":[{"type":"text","text":"Apple HIG compliance checklist and App Store review tips.","styles":{}}],"children":[]}]', '["ios","design"]',    'note-g-001', '2026-03-06T10:00:00.000Z', '2026-03-06T10:00:00.000Z', 0),
  ('note-g-003', 'proj-gamma-0003', 'Android Guidelines',       '[{"id":"blkg3","type":"paragraph","props":{"textColor":"default","backgroundColor":"default","textAlignment":"left"},"content":[{"type":"text","text":"Material Design 3 tokens and Google Play store requirements.","styles":{}}],"children":[]}]', '["android","design"]','note-g-001', '2026-03-06T10:30:00.000Z', '2026-03-06T10:30:00.000Z', 0),
  ('note-g-004', 'proj-gamma-0003', 'Release Checklist v1.0',   '[{"id":"blkg4","type":"paragraph","props":{"textColor":"default","backgroundColor":"default","textAlignment":"left"},"content":[{"type":"text","text":"Steps before submitting to App Store and Google Play.","styles":{}}],"children":[]}]', '["release"]',         NULL,         '2026-06-01T10:00:00.000Z', '2026-06-01T10:00:00.000Z', 0);

-- ── Notes – Delta Project ─────────────────────────────────────────────────────
INSERT OR IGNORE INTO notes (id, project_id, title, content, tags, parent_id, created_at, updated_at, deleted) VALUES
  ('note-d-001', 'proj-delta-0004', 'Data Sources',             '[{"id":"blkd1","type":"paragraph","props":{"textColor":"default","backgroundColor":"default","textAlignment":"left"},"content":[{"type":"text","text":"List of all upstream data sources and their update frequencies.","styles":{}}],"children":[]}]', '["data","docs"]',     NULL,         '2026-04-03T10:00:00.000Z', '2026-04-03T10:00:00.000Z', 0),
  ('note-d-002', 'proj-delta-0004', 'CRM Integration',          '[{"id":"blkd2","type":"paragraph","props":{"textColor":"default","backgroundColor":"default","textAlignment":"left"},"content":[{"type":"text","text":"Salesforce API v55. OAuth2 client credentials flow. Sync every 15 minutes.","styles":{}}],"children":[]}]', '["crm","data"]',      'note-d-001', '2026-04-04T10:00:00.000Z', '2026-04-04T10:00:00.000Z', 0),
  ('note-d-003', 'proj-delta-0004', 'KPI Definitions',          '[{"id":"blkd3","type":"paragraph","props":{"textColor":"default","backgroundColor":"default","textAlignment":"left"},"content":[{"type":"text","text":"MAU, DAU, conversion rate, and churn defined and agreed with stakeholders.","styles":{}}],"children":[]}]', '["kpi","analytics"]', NULL,         '2026-04-10T10:00:00.000Z', '2026-04-10T10:00:00.000Z', 0);

-- ── Scratchpads ───────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO scratchpads (id, project_id, title, content, created_at, updated_at, deleted) VALUES
  ('scratch-g-001', 'proj-gamma-0003', 'Sprint Notes',      '[{"id":"blksg1","type":"paragraph","props":{"textColor":"default","backgroundColor":"default","textAlignment":"left"},"content":[{"type":"text","text":"Sprint 4 goal: finish offline mode and App Store prep.","styles":{}}],"children":[]}]', '2026-06-01T10:00:00.000Z', '2026-06-01T10:00:00.000Z', 0),
  ('scratch-d-001', 'proj-delta-0004', 'Query Snippets',    '[{"id":"blksd1","type":"paragraph","props":{"textColor":"default","backgroundColor":"default","textAlignment":"left"},"content":[{"type":"text","text":"SELECT user_id, COUNT(*) as events FROM raw_events GROUP BY user_id;","styles":{}}],"children":[]}]', '2026-04-15T10:00:00.000Z', '2026-04-15T10:00:00.000Z', 0),
  ('scratch-d-002', 'proj-delta-0004', 'Dashboard Ideas',   '[{"id":"blksd2","type":"paragraph","props":{"textColor":"default","backgroundColor":"default","textAlignment":"left"},"content":[{"type":"text","text":"Funnel chart, cohort retention table, revenue over time line chart.","styles":{}}],"children":[]}]', '2026-06-05T10:00:00.000Z', '2026-06-05T10:00:00.000Z', 0);

-- ── Personal Todos ────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO personal_todos (id, title, notes, status, due_date, all_day, recurrence_type, recurrence_interval, recurrence_days, recurrence_end, next_occurrence, alert_minutes, notify_email, priority, tags, created_at, updated_at, deleted) VALUES
  ('todo-pc2-001', 'App Store review prep',       'Screenshots, description, keywords', 'pending', '2026-06-25T09:00:00.000Z', 0, 'none',   1, '[]', NULL, '2026-06-25T09:00:00.000Z', 60, 0, 'urgent', '["mobile","store"]', '2026-06-10T08:00:00.000Z', '2026-06-10T08:00:00.000Z', 0),
  ('todo-pc2-002', 'Weekly data pipeline check',  'Verify no failed jobs',              'pending', '2026-06-16T08:00:00.000Z', 0, 'weekly', 1, '[1]', NULL, '2026-06-16T08:00:00.000Z', 15, 0, 'high',   '["ops","data"]',     '2026-04-07T08:00:00.000Z', '2026-06-09T08:00:00.000Z', 0),
  ('todo-pc2-003', 'Demo for stakeholders',       'Delta dashboard demo call',          'pending', '2026-06-19T14:00:00.000Z', 0, 'none',   1, '[]', NULL, '2026-06-19T14:00:00.000Z', 30, 0, 'urgent', '["meeting"]',        '2026-06-15T09:00:00.000Z', '2026-06-15T09:00:00.000Z', 0),
  ('todo-pc2-004', 'Update TestFlight build',     '',                                   'done',    NULL,                         1, 'none',   1, '[]', NULL, NULL,                         -1, 0, 'medium', '["mobile","qa"]',    '2026-06-12T08:00:00.000Z', '2026-06-15T10:00:00.000Z', 0),
  ('todo-pc2-005', 'Daily standup',               '',                                   'pending', '2026-06-16T09:30:00.000Z', 0, 'daily',  1, '[]', NULL, '2026-06-16T09:30:00.000Z', 5,  0, 'low',    '["meeting"]',        '2026-04-01T08:00:00.000Z', '2026-06-15T08:00:00.000Z', 0);
