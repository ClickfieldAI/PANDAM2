ALTER TABLE `offers` ADD `parent_offer_id` text REFERENCES offers(id) ON DELETE set null;--> statement-breakpoint
CREATE UNIQUE INDEX `offers_parent_unique` ON `offers` (`parent_offer_id`);