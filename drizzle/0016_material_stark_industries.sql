CREATE TABLE `external_event_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agentId` int NOT NULL,
	`sourceId` int,
	`eventType` varchar(80) NOT NULL,
	`name` varchar(160) NOT NULL,
	`description` text,
	`actions` json NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`createLeadIfMissing` boolean NOT NULL DEFAULT true,
	`priority` int NOT NULL DEFAULT 100,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `external_event_rules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `external_event_sources` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agentId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`slug` varchar(80) NOT NULL,
	`secret` varchar(128) NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`platform` varchar(60) NOT NULL DEFAULT 'custom',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `external_event_sources_id` PRIMARY KEY(`id`),
	CONSTRAINT `external_event_sources_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `external_events` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`sourceId` int NOT NULL,
	`agentId` int NOT NULL,
	`eventType` varchar(80) NOT NULL,
	`leadIdentifier` varchar(320),
	`leadId` int,
	`payload` json NOT NULL,
	`status` enum('received','matched','unmatched','processed','ignored','failed') NOT NULL DEFAULT 'received',
	`actionsApplied` json,
	`errorMessage` text,
	`receivedAt` timestamp NOT NULL DEFAULT (now()),
	`processedAt` timestamp,
	CONSTRAINT `external_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `ext_rule_agent_type_idx` ON `external_event_rules` (`agentId`,`eventType`,`enabled`);--> statement-breakpoint
CREATE INDEX `ext_src_agent_idx` ON `external_event_sources` (`agentId`);--> statement-breakpoint
CREATE INDEX `ext_evt_agent_idx` ON `external_events` (`agentId`,`receivedAt`);--> statement-breakpoint
CREATE INDEX `ext_evt_source_idx` ON `external_events` (`sourceId`,`receivedAt`);--> statement-breakpoint
CREATE INDEX `ext_evt_type_idx` ON `external_events` (`agentId`,`eventType`);