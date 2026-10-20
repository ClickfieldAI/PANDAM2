CREATE TABLE `favourites` (
	`user_id` text NOT NULL,
	`listing_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	PRIMARY KEY(`user_id`, `listing_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `favourites_user_idx` ON `favourites` (`user_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `listings` ADD `deleted_at` integer;--> statement-breakpoint
ALTER TABLE `needs` ADD `deleted_at` integer;