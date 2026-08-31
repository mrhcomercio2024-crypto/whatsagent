ALTER TABLE `instagram_integrations` ADD `oauthProvider` enum('instagram','facebook') DEFAULT 'facebook' NOT NULL;--> statement-breakpoint
ALTER TABLE `instagram_integrations` ADD `facebookPageId` varchar(80);--> statement-breakpoint
ALTER TABLE `instagram_integrations` ADD `facebookPageName` varchar(200);--> statement-breakpoint
ALTER TABLE `instagram_integrations` ADD `pendingAssetsEncrypted` longtext;