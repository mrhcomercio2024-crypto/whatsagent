CREATE TABLE `zapi_instances` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agentId` int NOT NULL,
	`instanceId` varchar(120) NOT NULL,
	`token` varchar(200) NOT NULL,
	`clientToken` varchar(200),
	`webhookSecret` varchar(80) NOT NULL,
	`isConnected` boolean NOT NULL DEFAULT false,
	`lastStatusCheckAt` timestamp,
	`connectedPhone` varchar(40),
	`lastError` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `zapi_instances_id` PRIMARY KEY(`id`),
	CONSTRAINT `zapi_instances_agentId_unique` UNIQUE(`agentId`)
);
