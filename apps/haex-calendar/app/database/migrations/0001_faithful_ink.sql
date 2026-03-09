CREATE TABLE `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-calendar__settings` (
	`id` text PRIMARY KEY DEFAULT 'default' NOT NULL,
	`default_view` text DEFAULT 'month' NOT NULL,
	`week_start` text DEFAULT 'monday' NOT NULL,
	`default_event_duration` integer DEFAULT 60 NOT NULL,
	`locale` text DEFAULT 'de' NOT NULL,
	`time_format` text DEFAULT '24h' NOT NULL,
	`date_format` text DEFAULT 'dd.MM.yyyy' NOT NULL,
	`timezone` text DEFAULT 'Europe/Berlin' NOT NULL,
	`show_weekends` integer DEFAULT true NOT NULL,
	`show_declined_events` integer DEFAULT true NOT NULL,
	`show_completed_tasks` integer DEFAULT true NOT NULL,
	`show_week_numbers` integer DEFAULT false NOT NULL,
	`shorter_events` integer DEFAULT false NOT NULL,
	`dim_past_events` integer DEFAULT false NOT NULL,
	`side_by_side_day_view` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()),
	`updated_at` integer DEFAULT (unixepoch())
);
