CREATE TABLE `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-mail__pending_moves` (
	`message_id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`mailbox_name` text NOT NULL,
	`uid` integer NOT NULL,
	`destination_name` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()),
	`updated_at` integer DEFAULT (unixepoch())
);
