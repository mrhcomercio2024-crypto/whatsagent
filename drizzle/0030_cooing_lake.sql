ALTER TABLE `public_simulator_requests` DROP INDEX `public_simulator_requests_requestId_unique`;--> statement-breakpoint
ALTER TABLE `public_simulator_requests` MODIFY COLUMN `status` enum('processing','completed','failed','expired') NOT NULL DEFAULT 'processing';--> statement-breakpoint
ALTER TABLE `public_simulator_requests` ADD `expiresAt` timestamp;--> statement-breakpoint
ALTER TABLE `public_simulator_requests` ADD `lastRecoveryAt` timestamp;--> statement-breakpoint
ALTER TABLE `public_simulator_requests` ADD `recoveryAttempts` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `public_simulator_requests` ADD `lastHttpStatus` int;--> statement-breakpoint
ALTER TABLE `public_simulator_requests` ADD CONSTRAINT `pub_sim_req_session_request_unique` UNIQUE(`sessionId`,`requestId`);--> statement-breakpoint
CREATE INDEX `pub_sim_req_request_idx` ON `public_simulator_requests` (`requestId`);