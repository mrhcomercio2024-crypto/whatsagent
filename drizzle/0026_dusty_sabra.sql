CREATE TABLE `public_simulator_configs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agentId` int NOT NULL,
	`slug` varchar(100) NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`displayName` varchar(120) NOT NULL DEFAULT 'RAVI',
	`statusText` varchar(120) NOT NULL DEFAULT 'online',
	`avatarUrl` varchar(500),
	`accentColor` varchar(20) NOT NULL DEFAULT '#00a884',
	`welcomeMessage` text NOT NULL,
	`startButtonText` varchar(120) NOT NULL DEFAULT 'SIM, QUERO SABER',
	`startLeadMessage` varchar(240) NOT NULL DEFAULT 'Sim, quero saber como funciona.',
	`inputPlaceholder` varchar(160) NOT NULL DEFAULT 'Digite uma mensagem',
	`checkoutUrl` varchar(1000),
	`checkoutButtonText` varchar(160) NOT NULL DEFAULT 'ABRIR CHECKOUT',
	`webhookSecret` varchar(128) NOT NULL,
	`purchaseEventNames` json,
	`checkoutRequestPatterns` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `public_simulator_configs_id` PRIMARY KEY(`id`),
	CONSTRAINT `public_simulator_configs_agentId_unique` UNIQUE(`agentId`),
	CONSTRAINT `public_simulator_configs_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `public_simulator_conversions` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`sessionId` bigint NOT NULL,
	`agentId` int NOT NULL,
	`eventId` varchar(180) NOT NULL,
	`eventType` enum('checkout_requested','checkout_link_sent','checkout_clicked','purchase_paid','purchase_failed','purchase_refunded') NOT NULL,
	`orderId` varchar(180),
	`amountCents` int,
	`currency` varchar(12) DEFAULT 'BRL',
	`payload` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `public_simulator_conversions_id` PRIMARY KEY(`id`),
	CONSTRAINT `public_simulator_conversions_eventId_unique` UNIQUE(`eventId`)
);
--> statement-breakpoint
CREATE TABLE `public_simulator_requests` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`sessionId` bigint NOT NULL,
	`requestId` varchar(80) NOT NULL,
	`kind` enum('start','text','audio') NOT NULL,
	`status` enum('processing','completed','failed') NOT NULL DEFAULT 'processing',
	`response` json,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `public_simulator_requests_id` PRIMARY KEY(`id`),
	CONSTRAINT `public_simulator_requests_requestId_unique` UNIQUE(`requestId`)
);
--> statement-breakpoint
CREATE TABLE `public_simulator_sessions` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`publicId` varchar(64) NOT NULL,
	`accessTokenHash` varchar(128) NOT NULL,
	`configId` int NOT NULL,
	`agentId` int NOT NULL,
	`leadId` int NOT NULL,
	`conversationId` int NOT NULL,
	`status` enum('waiting','active','completed','converted','archived') NOT NULL DEFAULT 'waiting',
	`startedAt` timestamp,
	`lastSeenAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	`capturedName` varchar(200),
	`capturedPhone` varchar(40),
	`capturedEmail` varchar(320),
	`utmSource` varchar(160),
	`utmMedium` varchar(160),
	`utmCampaign` varchar(240),
	`utmContent` varchar(240),
	`utmTerm` varchar(240),
	`gclid` varchar(240),
	`fbclid` varchar(240),
	`referrer` varchar(1000),
	`landingUrl` varchar(1500),
	`userAgent` varchar(1000),
	`ipHash` varchar(128),
	`checkoutRequestedAt` timestamp,
	`checkoutLinkSentAt` timestamp,
	`checkoutClickedAt` timestamp,
	`purchasedAt` timestamp,
	`purchaseEventId` varchar(180),
	`orderId` varchar(180),
	`amountCents` int,
	`currency` varchar(12) DEFAULT 'BRL',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `public_simulator_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `public_simulator_sessions_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `pub_sim_session_conv_unique` UNIQUE(`conversationId`)
);
--> statement-breakpoint
CREATE INDEX `pub_sim_cfg_agent_idx` ON `public_simulator_configs` (`agentId`);--> statement-breakpoint
CREATE INDEX `pub_sim_cfg_slug_idx` ON `public_simulator_configs` (`slug`);--> statement-breakpoint
CREATE INDEX `pub_sim_conv_session_idx` ON `public_simulator_conversions` (`sessionId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `pub_sim_conv_agent_idx` ON `public_simulator_conversions` (`agentId`,`eventType`,`createdAt`);--> statement-breakpoint
CREATE INDEX `pub_sim_conv_order_idx` ON `public_simulator_conversions` (`orderId`);--> statement-breakpoint
CREATE INDEX `pub_sim_req_session_idx` ON `public_simulator_requests` (`sessionId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `pub_sim_session_agent_idx` ON `public_simulator_sessions` (`agentId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `pub_sim_session_config_idx` ON `public_simulator_sessions` (`configId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `pub_sim_session_phone_idx` ON `public_simulator_sessions` (`capturedPhone`);--> statement-breakpoint
CREATE INDEX `pub_sim_session_email_idx` ON `public_simulator_sessions` (`capturedEmail`);--> statement-breakpoint
CREATE INDEX `pub_sim_session_status_idx` ON `public_simulator_sessions` (`agentId`,`status`);