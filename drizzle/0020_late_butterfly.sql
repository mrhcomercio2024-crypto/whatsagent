ALTER TABLE `external_event_rules` ADD `channelAgentId` int;--> statement-breakpoint
ALTER TABLE `external_event_rules` ADD `templateId` int;--> statement-breakpoint
ALTER TABLE `external_event_rules` ADD `delayMinutes` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `external_event_rules` ADD `moveToStepId` int;--> statement-breakpoint
ALTER TABLE `external_event_rules` ADD `tagLabel` varchar(80);--> statement-breakpoint
ALTER TABLE `external_event_rules` ADD `aiContext` text;--> statement-breakpoint
ALTER TABLE `external_event_rules` ADD `isActive` boolean DEFAULT true NOT NULL;