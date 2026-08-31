CREATE TABLE `channel_identities` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`agentId` int NOT NULL,
	`leadId` int NOT NULL,
	`channel` enum('whatsapp','instagram','web') NOT NULL,
	`accountId` varchar(100) NOT NULL,
	`externalUserId` varchar(200) NOT NULL,
	`username` varchar(160),
	`displayName` varchar(200),
	`profilePictureUrl` varchar(1000),
	`metadata` json,
	`lastSeenAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `channel_identities_id` PRIMARY KEY(`id`),
	CONSTRAINT `channel_identity_external_unique` UNIQUE(`agentId`,`channel`,`accountId`,`externalUserId`)
);
--> statement-breakpoint
CREATE TABLE `instagram_integrations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agentId` int NOT NULL,
	`metaAppId` varchar(64) NOT NULL,
	`instagramAccountId` varchar(80),
	`username` varchar(160),
	`accountName` varchar(200),
	`profilePictureUrl` varchar(1000),
	`accessTokenEncrypted` longtext,
	`tokenExpiresAt` timestamp,
	`tokenStatus` enum('missing','valid','expired','revoked','error') NOT NULL DEFAULT 'missing',
	`scopes` json,
	`webhookStatus` enum('pending','verified','subscribed','error') NOT NULL DEFAULT 'pending',
	`webhookVerifiedAt` timestamp,
	`webhookSubscribedAt` timestamp,
	`lastWebhookAt` timestamp,
	`lastInboundAt` timestamp,
	`lastOutboundAt` timestamp,
	`lastSyncAt` timestamp,
	`lastError` text,
	`lastErrorCode` varchar(80),
	`lastErrorSubcode` varchar(80),
	`lastErrorAt` timestamp,
	`isConnected` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `instagram_integrations_id` PRIMARY KEY(`id`),
	CONSTRAINT `instagram_integrations_agentId_unique` UNIQUE(`agentId`),
	CONSTRAINT `instagram_integration_account_unique` UNIQUE(`instagramAccountId`)
);
--> statement-breakpoint
CREATE TABLE `instagram_logs` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`agentId` int,
	`integrationId` int,
	`conversationId` int,
	`leadId` int,
	`eventType` varchar(100) NOT NULL,
	`level` enum('info','warning','error') NOT NULL DEFAULT 'info',
	`providerMessageId` varchar(240),
	`httpStatus` int,
	`metaErrorCode` varchar(80),
	`metaErrorSubcode` varchar(80),
	`message` varchar(500),
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `instagram_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `instagram_oauth_states` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`stateHash` varchar(64) NOT NULL,
	`agentId` int NOT NULL,
	`userId` int NOT NULL,
	`redirectOrigin` varchar(500) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`consumedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `instagram_oauth_states_id` PRIMARY KEY(`id`),
	CONSTRAINT `instagram_oauth_states_stateHash_unique` UNIQUE(`stateHash`)
);
--> statement-breakpoint
CREATE TABLE `instagram_webhook_events` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`integrationId` int,
	`agentId` int,
	`eventKey` varchar(240) NOT NULL,
	`eventType` varchar(80) NOT NULL,
	`providerMessageId` varchar(240),
	`instagramAccountId` varchar(80),
	`igsid` varchar(200),
	`payload` json NOT NULL,
	`status` enum('received','ignored','processing','processed','failed') NOT NULL DEFAULT 'received',
	`attemptCount` int NOT NULL DEFAULT 0,
	`httpStatus` int,
	`metaErrorCode` varchar(80),
	`metaErrorSubcode` varchar(80),
	`errorMessage` text,
	`receivedAt` timestamp NOT NULL DEFAULT (now()),
	`processedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `instagram_webhook_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `instagram_webhook_events_eventKey_unique` UNIQUE(`eventKey`)
);
--> statement-breakpoint
ALTER TABLE `conversations` DROP INDEX `conv_agent_lead_unique`;--> statement-breakpoint
ALTER TABLE `conversations` ADD `channel` enum('whatsapp','instagram','web') DEFAULT 'whatsapp' NOT NULL;--> statement-breakpoint
ALTER TABLE `conversations` ADD `channelMetadata` json;--> statement-breakpoint
ALTER TABLE `messages` ADD `channel` enum('whatsapp','instagram','web') DEFAULT 'whatsapp' NOT NULL;--> statement-breakpoint
ALTER TABLE `messages` ADD `providerMessageId` varchar(240);--> statement-breakpoint
ALTER TABLE `messages` ADD `providerStatus` varchar(40);--> statement-breakpoint
ALTER TABLE `conversations` ADD CONSTRAINT `conv_agent_lead_unique` UNIQUE(`agentId`,`leadId`,`channel`);--> statement-breakpoint
CREATE INDEX `channel_identity_lead_idx` ON `channel_identities` (`leadId`,`channel`);--> statement-breakpoint
CREATE INDEX `instagram_log_agent_event_idx` ON `instagram_logs` (`agentId`,`eventType`,`createdAt`);--> statement-breakpoint
CREATE INDEX `instagram_log_conversation_idx` ON `instagram_logs` (`conversationId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `instagram_oauth_state_expiry_idx` ON `instagram_oauth_states` (`expiresAt`,`consumedAt`);--> statement-breakpoint
CREATE INDEX `instagram_event_agent_status_idx` ON `instagram_webhook_events` (`agentId`,`status`,`receivedAt`);--> statement-breakpoint
CREATE INDEX `instagram_event_account_idx` ON `instagram_webhook_events` (`instagramAccountId`,`receivedAt`);--> statement-breakpoint
CREATE INDEX `conv_agent_channel_idx` ON `conversations` (`agentId`,`channel`,`lastMessageAt`);--> statement-breakpoint
CREATE INDEX `msg_provider_idx` ON `messages` (`channel`,`providerMessageId`);