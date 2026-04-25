ALTER TABLE `agents` ADD `splitLongMessages` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `agents` ADD `splitMaxChars` int DEFAULT 220 NOT NULL;