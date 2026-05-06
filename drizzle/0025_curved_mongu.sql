ALTER TABLE `agents` ADD `toneProfile` enum('rigid','balanced','natural','custom') DEFAULT 'balanced' NOT NULL;--> statement-breakpoint
ALTER TABLE `agents` ADD `emojiPolicy` enum('none','sparse','rich') DEFAULT 'sparse' NOT NULL;--> statement-breakpoint
ALTER TABLE `agents` ADD `useLeadNamePct` int DEFAULT 30 NOT NULL;