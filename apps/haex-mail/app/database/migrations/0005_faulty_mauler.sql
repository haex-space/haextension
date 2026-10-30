CREATE TABLE `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-mail__draft_attachments_no_sync` (
	`id` text PRIMARY KEY NOT NULL,
	`draft_id` text NOT NULL,
	`position` integer NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`content_id` text,
	`size` integer NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-mail__drafts_no_sync` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`to_text` text DEFAULT '' NOT NULL,
	`cc_text` text DEFAULT '' NOT NULL,
	`bcc_text` text DEFAULT '' NOT NULL,
	`subject` text DEFAULT '' NOT NULL,
	`body_html` text DEFAULT '' NOT NULL,
	`in_reply_to` text,
	`references_json` text DEFAULT '[]' NOT NULL,
	`edited_at` integer NOT NULL,
	`upload_due_at` integer,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer DEFAULT 0 NOT NULL,
	`server_message_id` text,
	`previous_message_ids_json` text DEFAULT '[]' NOT NULL,
	`removed_at` integer,
	`created_at` integer DEFAULT (unixepoch()),
	`updated_at` integer DEFAULT (unixepoch())
);
