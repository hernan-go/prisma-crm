CREATE TABLE IF NOT EXISTS admin_sessions (
 token_hash CHAR(64) PRIMARY KEY,
 expires_at BIGINT NOT NULL,
 INDEX idx_session_expiry(expires_at)
) ENGINE=InnoDB;
