CREATE TABLE `articles` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`company` text NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`summary` text NOT NULL,
	`published_at` text,
	`discovered_at` text NOT NULL,
	`topics` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `articles_url_unique` ON `articles` (`url`);--> statement-breakpoint
CREATE INDEX `articles_company_idx` ON `articles` (`company_id`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `refresh_locks` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `source_refresh` (
	`source_id` text PRIMARY KEY NOT NULL,
	`last_attempt` text,
	`last_success` text,
	`etag` text,
	`last_modified` text,
	`error` text
);
