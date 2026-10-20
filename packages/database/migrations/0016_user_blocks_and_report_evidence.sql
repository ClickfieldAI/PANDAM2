CREATE TABLE `user_blocks` (
	`blocker_id` text NOT NULL,
	`blocked_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	PRIMARY KEY(`blocker_id`, `blocked_id`),
	FOREIGN KEY (`blocker_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`blocked_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "user_blocks_distinct" CHECK("user_blocks"."blocker_id" <> "user_blocks"."blocked_id")
);
--> statement-breakpoint
CREATE INDEX `user_blocks_blocked_idx` ON `user_blocks` (`blocked_id`);--> statement-breakpoint
ALTER TABLE `reports` ADD `subject_snapshot` text;--> statement-breakpoint
-- Data-safety pre-step: if a reporter already filed the same live report more than once, keep the
-- earliest and mark the later copies dismissed, so the unique index below can be created on existing data.
UPDATE `reports` SET `status` = 'dismissed' WHERE `status` IN ('open', 'reviewing') AND EXISTS (SELECT 1 FROM `reports` r2 WHERE r2.`status` IN ('open', 'reviewing') AND r2.`reporter_id` = `reports`.`reporter_id` AND r2.`subject_type` = `reports`.`subject_type` AND r2.`subject_id` = `reports`.`subject_id` AND (r2.`created_at` < `reports`.`created_at` OR (r2.`created_at` = `reports`.`created_at` AND r2.`id` < `reports`.`id`)));--> statement-breakpoint
CREATE UNIQUE INDEX `reports_live_unique` ON `reports` (`reporter_id`,`subject_type`,`subject_id`) WHERE "reports"."status" IN ('open', 'reviewing');