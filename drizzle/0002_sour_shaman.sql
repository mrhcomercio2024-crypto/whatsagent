CREATE TABLE `qr_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agentId` int NOT NULL,
	`status` enum('disconnected','connecting','awaiting_qr','connected','logged_out','banned') NOT NULL DEFAULT 'disconnected',
	`authDir` varchar(500),
	`lastQr` text,
	`jid` varchar(120),
	`displayName` varchar(200),
	`lastConnectedAt` timestamp,
	`lastError` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `qr_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `qr_sessions_agentId_unique` UNIQUE(`agentId`)
);
--> statement-breakpoint
ALTER TABLE `agents` ADD `connectionMode` enum('official','qr') DEFAULT 'official' NOT NULL;