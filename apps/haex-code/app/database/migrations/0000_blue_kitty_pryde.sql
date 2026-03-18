CREATE TABLE `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-code__settings` (
	`id` text PRIMARY KEY DEFAULT 'default' NOT NULL,
	`ui_scale` text DEFAULT 'default' NOT NULL,
	`editor_theme` text DEFAULT 'vs-dark' NOT NULL,
	`editor_font_size` integer DEFAULT 14 NOT NULL,
	`editor_font_family` text DEFAULT '''JetBrains Mono'', monospace' NOT NULL,
	`editor_tab_size` integer DEFAULT 2 NOT NULL,
	`editor_word_wrap` text DEFAULT 'off' NOT NULL,
	`editor_minimap` integer DEFAULT true NOT NULL,
	`editor_line_numbers` text DEFAULT 'on' NOT NULL,
	`terminal_font_size` integer DEFAULT 14 NOT NULL,
	`terminal_font_family` text DEFAULT '''JetBrains Mono'', monospace' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()),
	`updated_at` integer DEFAULT (unixepoch())
);
