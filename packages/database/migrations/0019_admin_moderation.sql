CREATE TABLE `admin_audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`reason` text,
	`metadata` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `admin_audit_actor_idx` ON `admin_audit_log` (`actor_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `admin_audit_target_idx` ON `admin_audit_log` (`target_type`,`target_id`);--> statement-breakpoint
CREATE INDEX `admin_audit_created_idx` ON `admin_audit_log` (`created_at`);--> statement-breakpoint
ALTER TABLE `users` ADD `role` text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `suspended_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `suspension_reason` text;--> statement-breakpoint
ALTER TABLE `listings` ADD `moderation_removed_at` integer;--> statement-breakpoint
ALTER TABLE `listings` ADD `moderation_reason` text;--> statement-breakpoint
ALTER TABLE `listings` ADD `moderation_by` text;--> statement-breakpoint
ALTER TABLE `needs` ADD `moderation_removed_at` integer;--> statement-breakpoint
ALTER TABLE `needs` ADD `moderation_reason` text;--> statement-breakpoint
ALTER TABLE `needs` ADD `moderation_by` text;--> statement-breakpoint
ALTER TABLE `reports` ADD `reviewed_by` text;--> statement-breakpoint
ALTER TABLE `reports` ADD `reviewed_at` integer;--> statement-breakpoint
ALTER TABLE `reports` ADD `resolution_note` text;