CREATE TABLE `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-calendar__calendars` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#3b82f6' NOT NULL,
	`space_id` text,
	`visible` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()),
	`updated_at` integer DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE TABLE `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-calendar__events` (
	`id` text PRIMARY KEY NOT NULL,
	`calendar_id` text NOT NULL,
	`uid` text NOT NULL,
	`summary` text NOT NULL,
	`description` text,
	`location` text,
	`dtstart` text NOT NULL,
	`dtend` text NOT NULL,
	`all_day` integer DEFAULT false NOT NULL,
	`timezone` text DEFAULT 'Europe/Berlin' NOT NULL,
	`status` text DEFAULT 'CONFIRMED' NOT NULL,
	`sequence` integer DEFAULT 0 NOT NULL,
	`url` text,
	`categories` text,
	`color` text,
	`created_at` integer DEFAULT (unixepoch()),
	`updated_at` integer DEFAULT (unixepoch()),
	FOREIGN KEY (`calendar_id`) REFERENCES `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-calendar__calendars`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-calendar__events_uid_unique` ON `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-calendar__events` (`uid`);