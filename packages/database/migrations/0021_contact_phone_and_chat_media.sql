ALTER TABLE `profiles` ADD `phone_e164` text;--> statement-breakpoint
ALTER TABLE `messages` ADD `video_key` text;--> statement-breakpoint
ALTER TABLE `messages` ADD `latitude` real;--> statement-breakpoint
ALTER TABLE `messages` ADD `longitude` real;--> statement-breakpoint
ALTER TABLE `messages` ADD `place_name` text;