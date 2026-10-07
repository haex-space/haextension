CREATE TABLE `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-files__sync_state` (
	`id` text PRIMARY KEY NOT NULL,
	`rule_id` text NOT NULL,
	`relative_path` text NOT NULL,
	`backend_id` text NOT NULL,
	`file_size` integer DEFAULT 0 NOT NULL,
	`last_modified` text,
	`content_hash` text,
	`last_synced_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`rule_id`) REFERENCES `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-files__sync_rules`(`id`) ON UPDATE no action ON DELETE cascade
);
