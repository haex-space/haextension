CREATE TABLE `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-mail__accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`email` text NOT NULL,
	`imap_host` text NOT NULL,
	`imap_port` integer DEFAULT 993 NOT NULL,
	`imap_security` text DEFAULT 'tls' NOT NULL,
	`smtp_host` text,
	`smtp_port` integer DEFAULT 465,
	`smtp_security` text DEFAULT 'tls',
	`password_item_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()),
	`updated_at` integer DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE TABLE `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-mail__mailboxes` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`name` text NOT NULL,
	`delimiter` text,
	`role` text,
	`unseen` integer DEFAULT 0,
	`message_count` integer DEFAULT 0,
	`uid_validity` integer,
	`uid_next` integer,
	`created_at` integer DEFAULT (unixepoch()),
	`updated_at` integer DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE TABLE `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-mail__message_bodies` (
	`message_id` text PRIMARY KEY NOT NULL,
	`body_text` text,
	`body_html` text,
	`attachments_json` text DEFAULT '[]' NOT NULL,
	`fetched_at` integer DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE TABLE `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-mail__messages` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`mailbox_name` text NOT NULL,
	`uid` integer NOT NULL,
	`thread_key` text,
	`flags` text DEFAULT '[]' NOT NULL,
	`internal_date` integer,
	`subject` text,
	`from_json` text DEFAULT '[]' NOT NULL,
	`to_json` text DEFAULT '[]' NOT NULL,
	`cc_json` text DEFAULT '[]' NOT NULL,
	`message_id` text,
	`in_reply_to` text,
	`references` text DEFAULT '[]' NOT NULL,
	`size` integer,
	`created_at` integer DEFAULT (unixepoch()),
	`updated_at` integer DEFAULT (unixepoch())
);
