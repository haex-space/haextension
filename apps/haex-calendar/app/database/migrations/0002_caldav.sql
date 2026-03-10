CREATE TABLE `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-calendar__caldav_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`server_url` text NOT NULL,
	`username` text NOT NULL,
	`password` text NOT NULL,
	`principal_url` text,
	`calendar_home_url` text,
	`last_sync_at` integer,
	`created_at` integer DEFAULT (unixepoch()),
	`updated_at` integer DEFAULT (unixepoch())
);
--> statement-breakpoint
ALTER TABLE `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-calendar__calendars` ADD `caldav_account_id` text;
--> statement-breakpoint
ALTER TABLE `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-calendar__calendars` ADD `caldav_path` text;
--> statement-breakpoint
ALTER TABLE `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-calendar__calendars` ADD `caldav_ctag` text;
--> statement-breakpoint
ALTER TABLE `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-calendar__events` ADD `etag` text;
--> statement-breakpoint
ALTER TABLE `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-calendar__events` ADD `href` text;
