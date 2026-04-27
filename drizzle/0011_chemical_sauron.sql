CREATE TABLE `lead_status_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agentId` int NOT NULL,
	`slug` varchar(80) NOT NULL,
	`label` varchar(120) NOT NULL,
	`description` text NOT NULL,
	`isBlocking` boolean NOT NULL DEFAULT true,
	`replyWhenBlocked` text,
	`handoffOnMatch` boolean NOT NULL DEFAULT true,
	`notifyOwnerOnMatch` boolean NOT NULL DEFAULT true,
	`badgeColor` varchar(20) NOT NULL DEFAULT 'amber',
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lead_status_rules_id` PRIMARY KEY(`id`),
	CONSTRAINT `lead_status_rules_agent_slug_unique` UNIQUE(`agentId`,`slug`)
);
--> statement-breakpoint
ALTER TABLE `leads` ADD `statusTag` varchar(80);--> statement-breakpoint
ALTER TABLE `leads` ADD `statusTagSetAt` timestamp;