CREATE TABLE `public_push_subscriptions` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`configId` int NOT NULL,
	`agentId` int NOT NULL,
	`sessionId` bigint NOT NULL,
	`leadId` int NOT NULL,
	`conversationId` int NOT NULL,
	`endpointHash` varchar(64) NOT NULL,
	`endpointCiphertext` longtext NOT NULL,
	`p256dhCiphertext` text NOT NULL,
	`authCiphertext` text NOT NULL,
	`permissionStatus` enum('default','granted','denied') NOT NULL DEFAULT 'granted',
	`browser` varchar(80),
	`device` varchar(80),
	`userAgent` varchar(1000),
	`active` boolean NOT NULL DEFAULT true,
	`lastPushAt` timestamp,
	`failureCount` int NOT NULL DEFAULT 0,
	`invalidatedAt` timestamp,
	`revokedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `public_push_subscriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `public_push_subscriptions_endpointHash_unique` UNIQUE(`endpointHash`)
);
--> statement-breakpoint
CREATE TABLE `recovery_events` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`eventId` varchar(80) NOT NULL,
	`pushId` varchar(64) NOT NULL,
	`jobId` bigint NOT NULL,
	`ruleId` int NOT NULL,
	`sessionId` bigint NOT NULL,
	`agentId` int NOT NULL,
	`channel` enum('push','email','instagram','whatsapp') NOT NULL DEFAULT 'push',
	`eventType` enum('queued','sent','delivered','clicked','returned','checkout_after_push','purchase_after_push','failed','cancelled','subscription_invalid') NOT NULL,
	`revenueCents` int,
	`attributionWindowHours` int,
	`payload` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `recovery_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `recovery_events_eventId_unique` UNIQUE(`eventId`)
);
--> statement-breakpoint
CREATE TABLE `recovery_jobs` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`pushId` varchar(64) NOT NULL,
	`idempotencyKey` varchar(180) NOT NULL,
	`ruleId` int NOT NULL,
	`configId` int NOT NULL,
	`agentId` int NOT NULL,
	`sessionId` bigint NOT NULL,
	`leadId` int NOT NULL,
	`conversationId` int NOT NULL,
	`subscriptionId` bigint,
	`channel` enum('push','email','instagram','whatsapp') NOT NULL DEFAULT 'push',
	`status` enum('pending','processing','sent','cancelled','failed','expired') NOT NULL DEFAULT 'pending',
	`sequenceOrder` int NOT NULL DEFAULT 0,
	`scheduledAt` timestamp NOT NULL,
	`lockedAt` timestamp,
	`sentAt` timestamp,
	`deliveredAt` timestamp,
	`clickedAt` timestamp,
	`returnedAt` timestamp,
	`checkoutAfterPushAt` timestamp,
	`purchaseAfterPushAt` timestamp,
	`revenueAfterPushCents` int,
	`attributionWindowHours` int NOT NULL DEFAULT 168,
	`attributionExpiresAt` timestamp,
	`attemptCount` int NOT NULL DEFAULT 0,
	`maxAttempts` int NOT NULL DEFAULT 1,
	`payload` json,
	`lastError` text,
	`cancelReason` varchar(120),
	`cancelledAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `recovery_jobs_id` PRIMARY KEY(`id`),
	CONSTRAINT `recovery_jobs_pushId_unique` UNIQUE(`pushId`),
	CONSTRAINT `recovery_jobs_idempotencyKey_unique` UNIQUE(`idempotencyKey`)
);
--> statement-breakpoint
CREATE TABLE `recovery_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`configId` int NOT NULL,
	`agentId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`channel` enum('push','email','instagram','whatsapp') NOT NULL DEFAULT 'push',
	`triggerType` enum('user_inactive') NOT NULL DEFAULT 'user_inactive',
	`sequenceOrder` int NOT NULL DEFAULT 0,
	`delayMinutes` int NOT NULL,
	`eligibleStages` json,
	`eligibleTemperatures` json,
	`minLeadScore` int NOT NULL DEFAULT 0,
	`requireInterest` boolean NOT NULL DEFAULT true,
	`messageTemplate` text NOT NULL,
	`aiPersonalizationEnabled` boolean NOT NULL DEFAULT false,
	`aiPrompt` text,
	`attributionWindowHours` int NOT NULL DEFAULT 168,
	`maxAttempts` int NOT NULL DEFAULT 1,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `recovery_rules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `public_simulator_configs` ADD `pushEnabled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `public_simulator_configs` ADD `pushConsentEnabled` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `public_simulator_configs` ADD `pushConsentMinInteractions` int DEFAULT 4 NOT NULL;--> statement-breakpoint
ALTER TABLE `public_simulator_configs` ADD `pushInterestScoreThreshold` int DEFAULT 40 NOT NULL;--> statement-breakpoint
ALTER TABLE `public_simulator_configs` ADD `pushStrongInterestScore` int DEFAULT 65 NOT NULL;--> statement-breakpoint
ALTER TABLE `public_simulator_configs` ADD `pushConsentMessage` text;--> statement-breakpoint
ALTER TABLE `public_simulator_configs` ADD `pushConsentButtonText` varchar(160) DEFAULT 'SIM, QUERO QUE O RAVI ME AVISE' NOT NULL;--> statement-breakpoint
ALTER TABLE `public_simulator_configs` ADD `pushGlobalCooldownMinutes` int DEFAULT 180 NOT NULL;--> statement-breakpoint
ALTER TABLE `public_simulator_configs` ADD `pushMaxPerSequence` int DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE `public_simulator_configs` ADD `pushAttributionWindowHours` int DEFAULT 168 NOT NULL;--> statement-breakpoint
ALTER TABLE `public_simulator_configs` ADD `pushAiPersonalizationEnabled` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `public_simulator_sessions` ADD `leadScore` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `public_simulator_sessions` ADD `interestSignals` json;--> statement-breakpoint
ALTER TABLE `public_simulator_sessions` ADD `pushConsentOfferedAt` timestamp;--> statement-breakpoint
ALTER TABLE `public_simulator_sessions` ADD `pushConsentGrantedAt` timestamp;--> statement-breakpoint
ALTER TABLE `public_simulator_sessions` ADD `pushConsentDeclinedAt` timestamp;--> statement-breakpoint
ALTER TABLE `public_simulator_sessions` ADD `pushOptedOutAt` timestamp;--> statement-breakpoint
CREATE INDEX `pub_push_sub_session_idx` ON `public_push_subscriptions` (`sessionId`,`active`);--> statement-breakpoint
CREATE INDEX `pub_push_sub_conv_idx` ON `public_push_subscriptions` (`conversationId`,`active`);--> statement-breakpoint
CREATE INDEX `pub_push_sub_agent_idx` ON `public_push_subscriptions` (`agentId`,`active`);--> statement-breakpoint
CREATE INDEX `recovery_event_push_idx` ON `recovery_events` (`pushId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `recovery_event_rule_idx` ON `recovery_events` (`ruleId`,`eventType`);--> statement-breakpoint
CREATE INDEX `recovery_event_session_idx` ON `recovery_events` (`sessionId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `recovery_job_due_idx` ON `recovery_jobs` (`status`,`channel`,`scheduledAt`);--> statement-breakpoint
CREATE INDEX `recovery_job_session_idx` ON `recovery_jobs` (`sessionId`,`status`);--> statement-breakpoint
CREATE INDEX `recovery_job_attr_idx` ON `recovery_jobs` (`sessionId`,`sentAt`);--> statement-breakpoint
CREATE INDEX `recovery_job_rule_idx` ON `recovery_jobs` (`ruleId`,`status`);--> statement-breakpoint
CREATE INDEX `recovery_rule_config_idx` ON `recovery_rules` (`configId`,`channel`,`isActive`,`sequenceOrder`);--> statement-breakpoint
CREATE INDEX `recovery_rule_agent_idx` ON `recovery_rules` (`agentId`);