CREATE TABLE `barter_transaction_events` (
	`id` text PRIMARY KEY NOT NULL,
	`transaction_id` text NOT NULL,
	`actor_user_id` text,
	`type` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`transaction_id`) REFERENCES `barter_transactions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `barter_events_unique` ON `barter_transaction_events` (`transaction_id`,`type`,`actor_user_id`);--> statement-breakpoint
CREATE INDEX `barter_events_tx_idx` ON `barter_transaction_events` (`transaction_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `offers` ADD `idempotency_key` text;--> statement-breakpoint
-- Data-safety pre-step: if racing requests ever left two PENDING offers from one sender for the same item,
-- keep the earliest and withdraw the rest so the unique indexes below can be created on existing data.
UPDATE `offers` SET `status` = 'cancelled' WHERE `status` = 'pending' AND `requested_listing_id` IS NOT NULL AND EXISTS (SELECT 1 FROM `offers` o2 WHERE o2.`status` = 'pending' AND o2.`from_user_id` = `offers`.`from_user_id` AND o2.`requested_listing_id` = `offers`.`requested_listing_id` AND (o2.`created_at` < `offers`.`created_at` OR (o2.`created_at` = `offers`.`created_at` AND o2.`id` < `offers`.`id`)));--> statement-breakpoint
UPDATE `offers` SET `status` = 'cancelled' WHERE `status` = 'pending' AND `requested_need_id` IS NOT NULL AND EXISTS (SELECT 1 FROM `offers` o2 WHERE o2.`status` = 'pending' AND o2.`from_user_id` = `offers`.`from_user_id` AND o2.`requested_need_id` = `offers`.`requested_need_id` AND (o2.`created_at` < `offers`.`created_at` OR (o2.`created_at` = `offers`.`created_at` AND o2.`id` < `offers`.`id`)));--> statement-breakpoint
CREATE UNIQUE INDEX `offers_pending_listing_unique` ON `offers` (`from_user_id`,`requested_listing_id`) WHERE "offers"."status" = 'pending' AND "offers"."requested_listing_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `offers_pending_need_unique` ON `offers` (`from_user_id`,`requested_need_id`) WHERE "offers"."status" = 'pending' AND "offers"."requested_need_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `offers_idempotency_unique` ON `offers` (`from_user_id`,`idempotency_key`);--> statement-breakpoint
ALTER TABLE `barter_transactions` ADD `initiator_confirmed_at` integer;--> statement-breakpoint
ALTER TABLE `barter_transactions` ADD `counterparty_confirmed_at` integer;