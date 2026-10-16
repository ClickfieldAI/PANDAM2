CREATE TABLE `demo_fee_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`listing_id` text,
	`listing_title` text,
	`currency` text DEFAULT 'INR' NOT NULL,
	`amount` integer NOT NULL,
	`fee_amount` integer NOT NULL,
	`net_amount` integer NOT NULL,
	`tier_label` text NOT NULL,
	`fee_schedule` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`is_demo` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'simulated_paid' NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "demo_fee_tx_is_demo" CHECK("demo_fee_transactions"."is_demo" = 1),
	CONSTRAINT "demo_fee_tx_amount_positive" CHECK("demo_fee_transactions"."amount" > 0),
	CONSTRAINT "demo_fee_tx_fee_valid" CHECK("demo_fee_transactions"."fee_amount" >= 0 AND "demo_fee_transactions"."fee_amount" <= "demo_fee_transactions"."amount"),
	CONSTRAINT "demo_fee_tx_net_consistent" CHECK("demo_fee_transactions"."net_amount" = "demo_fee_transactions"."amount" - "demo_fee_transactions"."fee_amount")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `demo_fee_tx_idem_unique` ON `demo_fee_transactions` (`user_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `demo_fee_tx_created_idx` ON `demo_fee_transactions` (`created_at`);