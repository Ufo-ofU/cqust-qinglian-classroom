CREATE TABLE `login_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`question` integer DEFAULT 0 NOT NULL,
	`phase` text DEFAULT 'waiting' NOT NULL,
	`created` integer NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_code` ON `sessions` (`code`);--> statement-breakpoint
CREATE TABLE `votes` (
	`session` text NOT NULL,
	`question` integer NOT NULL,
	`participant` text NOT NULL,
	`choice` integer NOT NULL,
	`created` integer NOT NULL,
	PRIMARY KEY(`session`, `question`, `participant`),
	FOREIGN KEY (`session`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
