CREATE TABLE `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-pass__haex_passwords_passkeys` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text,
	`credential_id` text NOT NULL,
	`relying_party_id` text NOT NULL,
	`relying_party_name` text,
	`user_handle` text NOT NULL,
	`user_name` text,
	`user_display_name` text,
	`private_key` text NOT NULL,
	`public_key` text NOT NULL,
	`algorithm` integer DEFAULT -7 NOT NULL,
	`sign_count` integer DEFAULT 0 NOT NULL,
	`created_at` text,
	`last_used_at` text,
	`is_discoverable` integer DEFAULT true NOT NULL,
	`icon` text,
	`color` text,
	`nickname` text,
	FOREIGN KEY (`item_id`) REFERENCES `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-pass__haex_passwords_item_details`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-pass__haex_passwords_passkeys_credential_id_unique` ON `b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca__haex-pass__haex_passwords_passkeys` (`credential_id`);