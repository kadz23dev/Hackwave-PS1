-- Migration 004: UI Backend Tables for Notes, Settings, and Authentication Users

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  firebase_uid TEXT UNIQUE,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  password_hash TEXT,
  role TEXT DEFAULT 'developer',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  tag TEXT,
  body TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Seed initial notes if empty
INSERT OR IGNORE INTO notes (id, title, tag, body, created_at, updated_at) VALUES
(
  1,
  'Cart checkout selector drift on v2',
  'Checkout',
  'Button ID changed from #add-to-cart to #add-to-bag in shop-v2 redesign. Self-healing candidate score was 0.74. Backend order verification passed cleanly with zero LLM fallback calls.',
  datetime('now', '-10 minutes'),
  datetime('now', '-10 minutes')
),
(
  2,
  'Oracle assertions on order API',
  'Oracles',
  'Always verify POST /api/orders returns HTTP 200 and sqlite orders table increment matches the order-created invariant before promoting repairs.',
  datetime('now', '-1 hour'),
  datetime('now', '-1 hour')
),
(
  3,
  'Flaky payment button investigation',
  'Investigation',
  'Investigating timing differences between instant replay and fresh navigation context. Candidate scoring heuristics successfully filtered ambiguous options.',
  datetime('now', '-1 day'),
  datetime('now', '-1 day')
);

-- Seed default workspace settings if empty
INSERT OR IGNORE INTO settings (key, value_json, updated_at) VALUES
(
  'workspace',
  '{"name":"Demo Lead","email":"demo-lead@healtest.dev","alertBug":true,"alertReview":true,"webhook":"127.0.0.1:4300/api/webhook/slack","timeout":15000,"target":"http://127.0.0.1:4102"}',
  datetime('now')
),
(
  'billing',
  '{"currentPlan":"FREE","runsCount":7,"healsCount":3,"updatedAt":"2026-10-11T00:00:00Z"}',
  datetime('now')
);

-- Seed default demo user (password hash for "demo123" using SHA-256: 00b001a1829e0618ff1e793d5a1538356bb0d5db6ef2c6e3d233e72b4c5b2ffb)
INSERT OR IGNORE INTO users (id, firebase_uid, email, display_name, password_hash, role) VALUES
(
  1,
  'demo-lead-uid-001',
  'demo-lead@healtest.dev',
  'Demo Lead',
  '00b001a1829e0618ff1e793d5a1538356bb0d5db6ef2c6e3d233e72b4c5b2ffb',
  'admin'
);
