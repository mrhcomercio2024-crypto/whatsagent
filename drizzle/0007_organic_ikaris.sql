CREATE TABLE `restricted_terms` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agentId` int NOT NULL,
	`term` varchar(200) NOT NULL,
	`action` enum('block','rewrite') NOT NULL DEFAULT 'block',
	`notes` varchar(300),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `restricted_terms_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `script_steps` ADD `literalMode` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `script_steps` ADD `literalText` text;--> statement-breakpoint
CREATE INDEX `restricted_agent_idx` ON `restricted_terms` (`agentId`);