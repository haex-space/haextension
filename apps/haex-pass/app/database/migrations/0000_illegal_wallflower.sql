CREATE TABLE IF NOT EXISTS `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-pass__haex_passwords_binaries` (
	`hash` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`size` integer NOT NULL,
	`type` text DEFAULT 'attachment',
	`created_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-pass__haex_passwords_generator_presets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`length` integer DEFAULT 16 NOT NULL,
	`uppercase` integer DEFAULT true NOT NULL,
	`lowercase` integer DEFAULT true NOT NULL,
	`numbers` integer DEFAULT true NOT NULL,
	`symbols` integer DEFAULT true NOT NULL,
	`exclude_chars` text DEFAULT '',
	`use_pattern` integer DEFAULT false NOT NULL,
	`pattern` text DEFAULT '',
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-pass__haex_passwords_group_items` (
	`group_id` text,
	`item_id` text,
	PRIMARY KEY(`item_id`, `group_id`),
	FOREIGN KEY (`group_id`) REFERENCES `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-pass__haex_passwords_groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-pass__haex_passwords_item_details`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-pass__haex_passwords_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`description` text,
	`icon` text,
	`sort_order` integer,
	`color` text,
	`parent_id` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` integer,
	FOREIGN KEY (`parent_id`) REFERENCES `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-pass__haex_passwords_groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-pass__haex_passwords_item_binaries` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`binary_hash` text NOT NULL,
	`file_name` text NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-pass__haex_passwords_item_details`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`binary_hash`) REFERENCES `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-pass__haex_passwords_binaries`(`hash`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-pass__haex_passwords_item_details` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text,
	`username` text,
	`password` text,
	`note` text,
	`icon` text,
	`color` text,
	`tags` text,
	`url` text,
	`otp_secret` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-pass__haex_passwords_item_key_values` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text,
	`key` text,
	`value` text,
	`updated_at` integer,
	FOREIGN KEY (`item_id`) REFERENCES `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-pass__haex_passwords_item_details`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-pass__haex_passwords_item_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`snapshot_data` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`modified_at` text,
	FOREIGN KEY (`item_id`) REFERENCES `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-pass__haex_passwords_item_details`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-pass__haex_passwords_snapshot_binaries` (
	`id` text PRIMARY KEY NOT NULL,
	`snapshot_id` text NOT NULL,
	`binary_hash` text NOT NULL,
	`file_name` text NOT NULL,
	FOREIGN KEY (`snapshot_id`) REFERENCES `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-pass__haex_passwords_item_snapshots`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`binary_hash`) REFERENCES `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-pass__haex_passwords_binaries`(`hash`) ON UPDATE no action ON DELETE cascade
);
