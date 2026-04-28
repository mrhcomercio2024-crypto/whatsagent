ALTER TABLE `media_triggers` MODIFY COLUMN `triggerType` enum('keyword','step','ai_decision','intent') NOT NULL;--> statement-breakpoint
ALTER TABLE `media_triggers` ADD `intentLabel` varchar(80);--> statement-breakpoint
ALTER TABLE `media_triggers` ADD `intentDescription` text;