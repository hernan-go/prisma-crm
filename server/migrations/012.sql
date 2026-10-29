-- Knowledge library only. DDL commits implicitly. No periods or business content.
-- A partial application must be inspected before retrying (plain CREATE fails closed).
CREATE TABLE knowledge_categories (
 id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 name VARCHAR(120) NOT NULL,
 position INT UNSIGNED NOT NULL,
 revision INT UNSIGNED NOT NULL DEFAULT 1,
 archived_at DATETIME(3) NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_knowledge_category_name(name),
 CONSTRAINT chk_knowledge_category_position CHECK(position>=1),
 CONSTRAINT chk_knowledge_category_revision CHECK(revision>=1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE knowledge_documents (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
 title VARCHAR(240) NOT NULL,
 category_id INT UNSIGNED NULL,
 content_md MEDIUMTEXT NOT NULL,
 is_active BOOLEAN NOT NULL DEFAULT FALSE,
 revision INT UNSIGNED NOT NULL DEFAULT 1,
 content_version INT UNSIGNED NOT NULL DEFAULT 1,
 pillar_key VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 deleted_at DATETIME(3) NULL,
 purge_after DATETIME(3) NULL,
 UNIQUE KEY uq_knowledge_pillar(pillar_key),
 KEY ix_knowledge_list(deleted_at,is_active,updated_at),
 CONSTRAINT fk_knowledge_category FOREIGN KEY(category_id) REFERENCES knowledge_categories(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT chk_knowledge_document_revision CHECK(revision>=1 AND content_version>=1),
 CONSTRAINT chk_knowledge_document_size CHECK(OCTET_LENGTH(content_md)<=524288),
 CONSTRAINT chk_knowledge_document_active CHECK(is_active IN (0,1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE knowledge_document_versions (
 document_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 version INT UNSIGNED NOT NULL,
 title VARCHAR(240) NOT NULL,
 category_id INT UNSIGNED NULL,
 category_name VARCHAR(120) NULL,
 content_md MEDIUMTEXT NOT NULL,
 content_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 operation VARCHAR(16) NOT NULL,
 actor_kind VARCHAR(24) NOT NULL DEFAULT 'administration',
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 restored_from_version INT UNSIGNED NULL,
 is_protected BOOLEAN NOT NULL DEFAULT FALSE,
 protected_at DATETIME(3) NULL,
 protection_reason VARCHAR(240) NULL,
 PRIMARY KEY(document_id,version),
 CONSTRAINT fk_knowledge_version_document FOREIGN KEY(document_id) REFERENCES knowledge_documents(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT chk_knowledge_version_number CHECK(version>=1),
 CONSTRAINT chk_knowledge_version_size CHECK(OCTET_LENGTH(content_md)<=524288),
 CONSTRAINT chk_knowledge_version_protected CHECK(is_protected IN (0,1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE knowledge_library_state (
 id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
 pillars_initialized_at DATETIME(3) NULL,
 pillars_template_version INT UNSIGNED NULL,
 trash_retention_days INT UNSIGNED NULL,
 CONSTRAINT chk_knowledge_singleton CHECK(id=1),
 CONSTRAINT chk_knowledge_retention CHECK(trash_retention_days IS NULL OR trash_retention_days>=1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
