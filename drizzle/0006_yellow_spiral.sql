CREATE TABLE `cost_extras` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agentId` int,
	`label` varchar(200) NOT NULL,
	`amountMicroUsd` int NOT NULL,
	`period` enum('one_time','monthly') NOT NULL DEFAULT 'monthly',
	`occurredOn` timestamp NOT NULL DEFAULT (now()),
	`notes` varchar(300),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cost_extras_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `llm_prices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`model` varchar(120) NOT NULL,
	`inputPer1M` int NOT NULL,
	`outputPer1M` int NOT NULL,
	`notes` varchar(250),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `llm_prices_id` PRIMARY KEY(`id`),
	CONSTRAINT `llm_prices_model_unique` UNIQUE(`model`)
);
--> statement-breakpoint
CREATE TABLE `llm_usage` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agentId` int,
	`conversationId` int,
	`leadId` int,
	`model` varchar(120) NOT NULL,
	`purpose` varchar(60) NOT NULL,
	`promptTokens` int NOT NULL DEFAULT 0,
	`completionTokens` int NOT NULL DEFAULT 0,
	`totalTokens` int NOT NULL DEFAULT 0,
	`costMicroUsd` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `llm_usage_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `usage_agent_date_idx` ON `llm_usage` (`agentId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `usage_lead_idx` ON `llm_usage` (`leadId`);--> statement-breakpoint
CREATE INDEX `usage_conv_idx` ON `llm_usage` (`conversationId`);--> statement-breakpoint
CREATE INDEX `usage_model_idx` ON `llm_usage` (`model`);