ALTER TABLE `recovery_jobs` ADD `sequenceKey` varchar(100) NOT NULL;--> statement-breakpoint
CREATE INDEX `recovery_job_sequence_idx` ON `recovery_jobs` (`sessionId`,`sequenceKey`,`status`);