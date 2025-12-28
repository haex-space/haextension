CREATE TABLE `52fb1e6d5bb4bbd3c09535dc1a4a41ba2b2b4a64568b68780556bbcac3137c0d__haex-files__sync_state` (
	`id` text PRIMARY KEY NOT NULL,
	`rule_id` text NOT NULL,
	`relative_path` text NOT NULL,
	`backend_id` text NOT NULL,
	`file_size` integer DEFAULT 0 NOT NULL,
	`last_modified` text,
	`content_hash` text,
	`last_synced_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`rule_id`) REFERENCES `52fb1e6d5bb4bbd3c09535dc1a4a41ba2b2b4a64568b68780556bbcac3137c0d__haex-files__sync_rules`(`id`) ON UPDATE no action ON DELETE cascade
);
