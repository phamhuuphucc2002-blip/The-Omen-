CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'Member',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_name TEXT,
  token_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS knowledge (
  id UUID PRIMARY KEY,
  owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'vi',
  content TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'public',
  status TEXT NOT NULL DEFAULT 'DRAFT',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS knowledge_versions (
  id BIGSERIAL PRIMARY KEY,
  knowledge_id UUID NOT NULL REFERENCES knowledge(id) ON DELETE CASCADE,
  editor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  version INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS files (
  id UUID PRIMARY KEY,
  owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  knowledge_id UUID REFERENCES knowledge(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS books (
  id UUID PRIMARY KEY,
  owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  source_language TEXT NOT NULL DEFAULT 'unknown',
  target_language TEXT NOT NULL DEFAULT 'vi',
  status TEXT NOT NULL DEFAULT 'PLANNED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS book_translations (
  id BIGSERIAL PRIMARY KEY,
  book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  chapter TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  original_text TEXT NOT NULL DEFAULT '',
  translated_text TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'DRAFT',
  author_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL DEFAULT '',
  resource_id TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sync_operations (
  operation_id TEXT PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  deleted BOOLEAN NOT NULL DEFAULT false,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE knowledge ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'DRAFT';
ALTER TABLE books ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'PLANNED';
ALTER TABLE book_translations ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'DRAFT';

CREATE INDEX IF NOT EXISTS idx_knowledge_category ON knowledge(category_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_owner ON knowledge(owner_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_status ON knowledge(status);
CREATE INDEX IF NOT EXISTS idx_versions_knowledge ON knowledge_versions(knowledge_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_books_owner ON books(owner_id);
CREATE INDEX IF NOT EXISTS idx_books_status ON books(status);
CREATE INDEX IF NOT EXISTS idx_book_translations_book ON book_translations(book_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_book_translations_status ON book_translations(status);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_user_created ON sync_operations(user_id, created_at DESC);
