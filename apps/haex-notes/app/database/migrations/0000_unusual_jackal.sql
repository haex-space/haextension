CREATE TABLE `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-notes__notebooks` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text DEFAULT 'Notizbuch' NOT NULL,
	`default_template` text DEFAULT 'lined' NOT NULL,
	`cover_color` text DEFAULT '#3b82f6' NOT NULL,
	`cover_image` text,
	`created_at` integer DEFAULT (unixepoch()),
	`updated_at` integer DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE TABLE `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-notes__pages` (
	`id` text PRIMARY KEY NOT NULL,
	`notebook_id` text NOT NULL,
	`page_number` integer DEFAULT 0 NOT NULL,
	`template` text DEFAULT 'lined' NOT NULL,
	`strokes` text DEFAULT '[]' NOT NULL,
	`tables` text DEFAULT '[]' NOT NULL,
	`background_image` text,
	`thumbnail` text,
	`created_at` integer DEFAULT (unixepoch()),
	`updated_at` integer DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE TABLE `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-notes__palettes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`colors` text DEFAULT '[]' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()),
	`updated_at` integer DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE TABLE `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-notes__pencil_case` (
	`id` text PRIMARY KEY DEFAULT 'default' NOT NULL,
	`slots` text DEFAULT '[]' NOT NULL,
	`max_slots` integer DEFAULT 5 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()),
	`updated_at` integer DEFAULT (unixepoch())
);
