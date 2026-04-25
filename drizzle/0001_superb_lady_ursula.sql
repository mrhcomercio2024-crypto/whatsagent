CREATE TABLE `agent_brain` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agentId` int NOT NULL,
	`masterPrompt` text NOT NULL,
	`tone` text,
	`rules` text,
	`products` text,
	`objections` text,
	`companyInfo` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `agent_brain_id` PRIMARY KEY(`id`),
	CONSTRAINT `agent_brain_agentId_unique` UNIQUE(`agentId`)
);
--> statement-breakpoint
CREATE TABLE `agents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`description` text,
	`status` enum('active','paused','draft') NOT NULL DEFAULT 'draft',
	`defaultLlmModel` varchar(80) NOT NULL DEFAULT 'gpt-4o',
	`persona` text,
	`language` varchar(10) NOT NULL DEFAULT 'pt-BR',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `agents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `business_hours` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agentId` int NOT NULL,
	`enabled` boolean NOT NULL DEFAULT false,
	`timezone` varchar(60) NOT NULL DEFAULT 'America/Sao_Paulo',
	`weekly` json,
	`outOfHoursMessage` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `business_hours_id` PRIMARY KEY(`id`),
	CONSTRAINT `business_hours_agentId_unique` UNIQUE(`agentId`)
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agentId` int NOT NULL,
	`leadId` int NOT NULL,
	`status` enum('open','human_handoff','closed','archived') NOT NULL DEFAULT 'open',
	`aiPaused` boolean NOT NULL DEFAULT false,
	`currentStepId` int,
	`lastInboundAt` timestamp,
	`lastOutboundAt` timestamp,
	`lastMessageAt` timestamp,
	`assignedUserId` int,
	`sentMediaIds` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `conversations_id` PRIMARY KEY(`id`),
	CONSTRAINT `conv_agent_lead_unique` UNIQUE(`agentId`,`leadId`)
);
--> statement-breakpoint
CREATE TABLE `followup_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agentId` int NOT NULL,
	`conversationId` int NOT NULL,
	`ruleId` int NOT NULL,
	`scheduledAt` timestamp NOT NULL,
	`status` enum('pending','sent','cancelled','failed') NOT NULL DEFAULT 'pending',
	`sentAt` timestamp,
	`errorMessage` text,
	`attemptCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `followup_jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `followup_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agentId` int NOT NULL,
	`name` varchar(200) NOT NULL,
	`orderIndex` int NOT NULL,
	`delayMinutes` int NOT NULL,
	`messageMode` enum('ai_generated','fixed_text','template') NOT NULL,
	`fixedText` text,
	`aiInstruction` text,
	`templateId` int,
	`templateVariables` json,
	`windowPolicy` enum('auto','force_template','force_free') NOT NULL DEFAULT 'auto',
	`cancelOnReply` boolean NOT NULL DEFAULT true,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `followup_rules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `handoff_keywords` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agentId` int NOT NULL,
	`keyword` varchar(200) NOT NULL,
	`notifyMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `handoff_keywords_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `knowledge_base` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agentId` int NOT NULL,
	`title` varchar(200) NOT NULL,
	`content` text NOT NULL,
	`tags` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `knowledge_base_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `leads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agentId` int NOT NULL,
	`phoneNumber` varchar(40) NOT NULL,
	`name` varchar(200),
	`email` varchar(320),
	`temperature` enum('hot','warm','cold','unknown') NOT NULL DEFAULT 'unknown',
	`qualificationNotes` text,
	`tags` varchar(500),
	`customFields` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `leads_id` PRIMARY KEY(`id`),
	CONSTRAINT `leads_agent_phone_unique` UNIQUE(`agentId`,`phoneNumber`)
);
--> statement-breakpoint
CREATE TABLE `media_assets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agentId` int NOT NULL,
	`name` varchar(200) NOT NULL,
	`description` text,
	`mediaType` enum('image','video','document','audio') NOT NULL,
	`storageKey` varchar(500) NOT NULL,
	`storageUrl` varchar(500) NOT NULL,
	`mimeType` varchar(100),
	`caption` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `media_assets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `media_triggers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agentId` int NOT NULL,
	`mediaId` int NOT NULL,
	`triggerType` enum('keyword','step','ai_decision') NOT NULL,
	`keywords` varchar(500),
	`stepId` int,
	`sendOncePerConversation` boolean NOT NULL DEFAULT true,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `media_triggers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`direction` enum('inbound','outbound') NOT NULL,
	`sender` enum('lead','ai','human','system') NOT NULL,
	`contentType` enum('text','image','video','audio','document','template') NOT NULL DEFAULT 'text',
	`body` text,
	`mediaUrl` varchar(500),
	`mediaId` int,
	`templateName` varchar(200),
	`waMessageId` varchar(200),
	`waStatus` enum('queued','sent','delivered','read','failed'),
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `metrics_events` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`agentId` int NOT NULL,
	`conversationId` int,
	`eventType` varchar(80) NOT NULL,
	`valueNumber` int,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `metrics_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `script_steps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agentId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`orderIndex` int NOT NULL,
	`instructions` text NOT NULL,
	`completionCriteria` text,
	`llmModel` varchar(80),
	`isMandatory` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `script_steps_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `whatsapp_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agentId` int NOT NULL,
	`phoneNumberId` varchar(80),
	`businessAccountId` varchar(80),
	`accessToken` text,
	`verifyToken` varchar(200),
	`appSecret` varchar(200),
	`displayPhoneNumber` varchar(40),
	`isConnected` boolean NOT NULL DEFAULT false,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `whatsapp_config_id` PRIMARY KEY(`id`),
	CONSTRAINT `whatsapp_config_agentId_unique` UNIQUE(`agentId`)
);
--> statement-breakpoint
CREATE TABLE `whatsapp_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agentId` int NOT NULL,
	`name` varchar(200) NOT NULL,
	`languageCode` varchar(10) NOT NULL DEFAULT 'pt_BR',
	`category` enum('MARKETING','UTILITY','AUTHENTICATION') NOT NULL,
	`bodyText` text NOT NULL,
	`variables` json,
	`status` enum('approved','pending','rejected') NOT NULL DEFAULT 'approved',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `whatsapp_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `conv_status_idx` ON `conversations` (`status`);--> statement-breakpoint
CREATE INDEX `job_status_idx` ON `followup_jobs` (`status`,`scheduledAt`);--> statement-breakpoint
CREATE INDEX `job_conv_idx` ON `followup_jobs` (`conversationId`);--> statement-breakpoint
CREATE INDEX `followup_agent_order_idx` ON `followup_rules` (`agentId`,`orderIndex`);--> statement-breakpoint
CREATE INDEX `handoff_agent_idx` ON `handoff_keywords` (`agentId`);--> statement-breakpoint
CREATE INDEX `kb_agent_idx` ON `knowledge_base` (`agentId`);--> statement-breakpoint
CREATE INDEX `media_agent_idx` ON `media_assets` (`agentId`);--> statement-breakpoint
CREATE INDEX `trigger_agent_idx` ON `media_triggers` (`agentId`);--> statement-breakpoint
CREATE INDEX `msg_conv_idx` ON `messages` (`conversationId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `msg_wa_idx` ON `messages` (`waMessageId`);--> statement-breakpoint
CREATE INDEX `metrics_agent_type_idx` ON `metrics_events` (`agentId`,`eventType`,`createdAt`);--> statement-breakpoint
CREATE INDEX `script_steps_agent_order_idx` ON `script_steps` (`agentId`,`orderIndex`);--> statement-breakpoint
CREATE INDEX `template_agent_idx` ON `whatsapp_templates` (`agentId`);