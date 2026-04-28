CREATE TABLE `message_retries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agentId` int NOT NULL,
	`conversationId` int NOT NULL,
	`leadId` int NOT NULL,
	`payload` json NOT NULL,
	`sender` enum('ai','operator','system') NOT NULL DEFAULT 'ai',
	`attempt` int NOT NULL DEFAULT 0,
	`maxAttempts` int NOT NULL DEFAULT 5,
	`nextRetryAt` timestamp NOT NULL,
	`status` enum('pending','succeeded','exhausted','cancelled','cancelled_by_reply') NOT NULL DEFAULT 'pending',
	`lastError` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `message_retries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_msg_retries_status` ON `message_retries` (`status`,`nextRetryAt`);--> statement-breakpoint
CREATE INDEX `idx_msg_retries_conv` ON `message_retries` (`conversationId`);--> statement-breakpoint
CREATE INDEX `idx_msg_retries_agent` ON `message_retries` (`agentId`,`status`);