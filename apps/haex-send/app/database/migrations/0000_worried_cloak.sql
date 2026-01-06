CREATE TABLE `db066d88aefdce40b4a96d66fb1c04b639f8981be60a397942f4cc18c61c40db__haex-send__haex_send_settings` (
	`id` text PRIMARY KEY DEFAULT 'settings' NOT NULL,
	`alias` text,
	`port` integer DEFAULT 53317,
	`auto_accept` integer DEFAULT false,
	`save_directory` text,
	`require_pin` integer DEFAULT false,
	`pin` text,
	`show_notifications` integer DEFAULT true,
	`created_at` text,
	`updated_at` integer
);
