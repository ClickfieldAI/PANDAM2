CREATE TABLE `notification_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`push_enabled` integer DEFAULT true NOT NULL,
	`listing_alerts` integer DEFAULT true NOT NULL,
	`updated_at` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `notifications` ADD `title` text;--> statement-breakpoint
ALTER TABLE `notifications` ADD `body` text;--> statement-breakpoint
ALTER TABLE `notifications` ADD `dedupe_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_dedupe_unique` ON `notifications` (`user_id`,`dedupe_key`) WHERE "notifications"."dedupe_key" IS NOT NULL;