CREATE TABLE `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-doom__game_file_chunks_no_sync` (
	`fingerprint` text NOT NULL,
	`chunk_index` integer NOT NULL,
	`data` blob NOT NULL,
	PRIMARY KEY(`fingerprint`, `chunk_index`)
);
--> statement-breakpoint
CREATE TABLE `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-doom__game_files_no_sync` (
	`fingerprint` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`family` text NOT NULL,
	`file_name` text NOT NULL,
	`size` integer NOT NULL,
	`chunk_count` integer NOT NULL,
	`imported_at` text NOT NULL
);
