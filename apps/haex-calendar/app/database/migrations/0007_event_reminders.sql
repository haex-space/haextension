CREATE TABLE `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-calendar__event_reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`offset_minutes` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-calendar__events`(`id`) ON UPDATE no action ON DELETE cascade
);
