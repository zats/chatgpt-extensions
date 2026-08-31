CREATE TABLE version_claims (
  version TEXT PRIMARY KEY NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('creating', 'issue')),
  issue_number INTEGER,
  lease_expires_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
