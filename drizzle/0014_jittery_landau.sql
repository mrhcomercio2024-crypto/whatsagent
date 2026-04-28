ALTER TABLE `conversations` ADD `awaitingReactionMediaId` int;--> statement-breakpoint
ALTER TABLE `conversations` ADD `awaitingReactionSentAt` timestamp;--> statement-breakpoint
ALTER TABLE `conversations` ADD `lastMediaReaction` varchar(16);