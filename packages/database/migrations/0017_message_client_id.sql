ALTER TABLE `messages` ADD `client_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `messages_client_id_unique` ON `messages` (`sender_id`,`client_id`);