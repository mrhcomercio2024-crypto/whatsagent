ALTER TABLE `users` ADD `passwordHash` varchar(100);--> statement-breakpoint
ALTER TABLE `users` ADD `passwordUpdatedAt` timestamp;