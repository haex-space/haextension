CREATE TABLE IF NOT EXISTS `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-game-unicorn__world_state` (
	`id` text PRIMARY KEY DEFAULT 'main' NOT NULL,
	`season` text DEFAULT 'spring' NOT NULL,
	`day_progress` real DEFAULT 0 NOT NULL,
	`chapter` integer DEFAULT 1 NOT NULL,
	`is_second_cycle` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()),
	`updated_at` integer DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-game-unicorn__completed_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`chapter` integer NOT NULL,
	`completed_at` integer DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-game-unicorn__flowers` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`x` real NOT NULL,
	`y` real NOT NULL,
	`pollinated` integer DEFAULT false NOT NULL,
	`fruiting` integer DEFAULT false NOT NULL,
	`nectar_amount` real DEFAULT 1.0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-game-unicorn__nest` (
	`id` text PRIMARY KEY DEFAULT 'main' NOT NULL,
	`x` real,
	`y` real,
	`wax_cells` integer DEFAULT 0 NOT NULL,
	`pollen_storage` real DEFAULT 0 NOT NULL,
	`nectar_storage` real DEFAULT 0 NOT NULL,
	`eggs` integer DEFAULT 0 NOT NULL,
	`larvae` integer DEFAULT 0 NOT NULL,
	`cocoons` integer DEFAULT 0 NOT NULL,
	`workers` integer DEFAULT 0 NOT NULL,
	`drones` integer DEFAULT 0 NOT NULL,
	`young_queens` integer DEFAULT 0 NOT NULL,
	`honey_pot` real DEFAULT 0 NOT NULL
);
