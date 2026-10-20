CREATE TABLE `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-mail__rules` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`account_id` text,
	`enabled` integer DEFAULT true NOT NULL,
	`conditions_json` text NOT NULL,
	`actions_json` text NOT NULL,
	`origin` text DEFAULT 'user' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()),
	`updated_at` integer DEFAULT (unixepoch())
);
--> statement-breakpoint
ALTER TABLE `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-mail__mailboxes` ADD `rules_uid_through` integer;