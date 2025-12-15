CREATE TABLE `52fb1e6d5bb4bbd3c09535dc1a4a41ba2b2b4a64568b68780556bbcac3137c0d__haex-files__backends` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`encrypted_config` blob NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_tested_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE TABLE `52fb1e6d5bb4bbd3c09535dc1a4a41ba2b2b4a64568b68780556bbcac3137c0d__haex-files__file_backends` (
	`id` text PRIMARY KEY NOT NULL,
	`file_id` text NOT NULL,
	`backend_id` text NOT NULL,
	`remote_id` text NOT NULL,
	`synced_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`file_id`) REFERENCES `52fb1e6d5bb4bbd3c09535dc1a4a41ba2b2b4a64568b68780556bbcac3137c0d__haex-files__files`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`backend_id`) REFERENCES `52fb1e6d5bb4bbd3c09535dc1a4a41ba2b2b4a64568b68780556bbcac3137c0d__haex-files__backends`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `52fb1e6d5bb4bbd3c09535dc1a4a41ba2b2b4a64568b68780556bbcac3137c0d__haex-files__file_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`file_id` text NOT NULL,
	`chunk_index` integer NOT NULL,
	`size` integer NOT NULL,
	`encrypted_size` integer NOT NULL,
	`content_hash` text NOT NULL,
	`remote_id` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`file_id`) REFERENCES `52fb1e6d5bb4bbd3c09535dc1a4a41ba2b2b4a64568b68780556bbcac3137c0d__haex-files__files`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `52fb1e6d5bb4bbd3c09535dc1a4a41ba2b2b4a64568b68780556bbcac3137c0d__haex-files__files` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`name` text NOT NULL,
	`path` text NOT NULL,
	`mime_type` text,
	`size` integer DEFAULT 0 NOT NULL,
	`content_hash` text,
	`is_directory` integer DEFAULT false NOT NULL,
	`wrapped_key` blob,
	`sync_state` text DEFAULT 'localOnly' NOT NULL,
	`last_synced_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`space_id`) REFERENCES `52fb1e6d5bb4bbd3c09535dc1a4a41ba2b2b4a64568b68780556bbcac3137c0d__haex-files__spaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `52fb1e6d5bb4bbd3c09535dc1a4a41ba2b2b4a64568b68780556bbcac3137c0d__haex-files__settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE TABLE `52fb1e6d5bb4bbd3c09535dc1a4a41ba2b2b4a64568b68780556bbcac3137c0d__haex-files__spaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`wrapped_key` blob NOT NULL,
	`is_personal` integer DEFAULT true NOT NULL,
	`file_count` integer DEFAULT 0 NOT NULL,
	`total_size` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE TABLE `52fb1e6d5bb4bbd3c09535dc1a4a41ba2b2b4a64568b68780556bbcac3137c0d__haex-files__sync_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`file_id` text NOT NULL,
	`backend_id` text NOT NULL,
	`operation` text NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`error_message` text,
	`retry_count` integer DEFAULT 0 NOT NULL,
	`scheduled_at` text DEFAULT (CURRENT_TIMESTAMP),
	`started_at` text,
	`completed_at` text,
	FOREIGN KEY (`file_id`) REFERENCES `52fb1e6d5bb4bbd3c09535dc1a4a41ba2b2b4a64568b68780556bbcac3137c0d__haex-files__files`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`backend_id`) REFERENCES `52fb1e6d5bb4bbd3c09535dc1a4a41ba2b2b4a64568b68780556bbcac3137c0d__haex-files__backends`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `52fb1e6d5bb4bbd3c09535dc1a4a41ba2b2b4a64568b68780556bbcac3137c0d__haex-files__sync_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`local_path` text NOT NULL,
	`backend_id` text NOT NULL,
	`direction` text DEFAULT 'both' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`space_id`) REFERENCES `52fb1e6d5bb4bbd3c09535dc1a4a41ba2b2b4a64568b68780556bbcac3137c0d__haex-files__spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`backend_id`) REFERENCES `52fb1e6d5bb4bbd3c09535dc1a4a41ba2b2b4a64568b68780556bbcac3137c0d__haex-files__backends`(`id`) ON UPDATE no action ON DELETE cascade
);
