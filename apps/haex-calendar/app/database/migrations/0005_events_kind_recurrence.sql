ALTER TABLE `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-calendar__events` ADD `kind` text DEFAULT 'event' NOT NULL;
--> statement-breakpoint
ALTER TABLE `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-calendar__events` ADD `event_type_id` text;
--> statement-breakpoint
ALTER TABLE `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-calendar__events` ADD `rrule` text;
--> statement-breakpoint
ALTER TABLE `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-calendar__events` ADD `rrule_override` integer DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-calendar__events` ADD `color_override` integer DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-calendar__events` ADD `completed_at` integer;
