CREATE TABLE `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-doom__saves` (
	`id` text PRIMARY KEY NOT NULL,
	`game_fingerprint` text NOT NULL,
	`slot` integer NOT NULL,
	`name` text NOT NULL,
	`data` blob NOT NULL,
	`saved_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-doom__saves_game_slot` ON `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-doom__saves` (`game_fingerprint`,`slot`);