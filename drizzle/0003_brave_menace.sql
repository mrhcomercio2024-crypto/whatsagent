ALTER TABLE `agents` ADD `debounceSeconds` int DEFAULT 8 NOT NULL;--> statement-breakpoint
ALTER TABLE `agents` ADD `typingSimulationEnabled` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `agents` ADD `typingCps` int DEFAULT 22 NOT NULL;--> statement-breakpoint
ALTER TABLE `agents` ADD `typingMinDelayMs` int DEFAULT 800 NOT NULL;--> statement-breakpoint
ALTER TABLE `agents` ADD `typingMaxDelayMs` int DEFAULT 8000 NOT NULL;--> statement-breakpoint
ALTER TABLE `agents` ADD `interMessageDelayMs` int DEFAULT 1200 NOT NULL;--> statement-breakpoint
ALTER TABLE `conversations` ADD `pendingProcessAt` timestamp;