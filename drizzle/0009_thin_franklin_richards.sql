ALTER TABLE `agents` ADD `summaryEveryN` int DEFAULT 6 NOT NULL;--> statement-breakpoint
ALTER TABLE `agents` ADD `summaryLlmModel` varchar(80);