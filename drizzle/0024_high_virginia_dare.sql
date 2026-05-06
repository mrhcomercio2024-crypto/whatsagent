CREATE TABLE `objection_dispatches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`objectionId` int NOT NULL,
	`dispatchedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `objection_dispatches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `objections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agentId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`description` text,
	`trigger_keywords` text NOT NULL,
	`trigger_regex` text,
	`response_template` text NOT NULL,
	`literal_response` boolean NOT NULL DEFAULT false,
	`media_ids` text,
	`next_step_action` enum('stay','advance','restart') NOT NULL DEFAULT 'stay',
	`priority` int NOT NULL DEFAULT 100,
	`is_active` boolean NOT NULL DEFAULT true,
	`send_once_per_conversation` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `objections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `step_compliance_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`stepId` int NOT NULL,
	`ai_response` text NOT NULL,
	`passed` boolean NOT NULL,
	`reason` varchar(500),
	`regenerated` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `step_compliance_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `step_media_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`stepId` int NOT NULL,
	`mediaId` int NOT NULL,
	`fire_when` enum('on_enter','on_advance','on_demand') NOT NULL DEFAULT 'on_enter',
	`delay_seconds` int NOT NULL DEFAULT 0,
	`position` enum('before_message','after_message','standalone') NOT NULL DEFAULT 'standalone',
	`is_active` boolean NOT NULL DEFAULT true,
	CONSTRAINT `step_media_links_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `leads` ADD `facts` json;--> statement-breakpoint
ALTER TABLE `leads` ADD `factsUpdatedAt` timestamp;--> statement-breakpoint
ALTER TABLE `script_steps` ADD `objective` varchar(300);--> statement-breakpoint
ALTER TABLE `script_steps` ADD `mustAsk` text;--> statement-breakpoint
ALTER TABLE `script_steps` ADD `mustNotSay` text;--> statement-breakpoint
ALTER TABLE `script_steps` ADD `successSignals` text;--> statement-breakpoint
CREATE INDEX `obj_disp_conv_idx` ON `objection_dispatches` (`conversationId`,`objectionId`);--> statement-breakpoint
CREATE INDEX `objections_agent_idx` ON `objections` (`agentId`,`is_active`,`priority`);--> statement-breakpoint
CREATE INDEX `scl_conv_idx` ON `step_compliance_logs` (`conversationId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `sml_step_idx` ON `step_media_links` (`stepId`,`fire_when`,`is_active`);