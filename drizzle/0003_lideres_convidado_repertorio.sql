ALTER TABLE `event_slots` ADD `guest_name` text;--> statement-breakpoint
ALTER TABLE `events` ADD `setlist_updated_at` integer;--> statement-breakpoint
ALTER TABLE `events` ADD `setlist_updated_by` text;--> statement-breakpoint
ALTER TABLE `users` ADD `leads_instrumental` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `leads_vocal` integer DEFAULT false NOT NULL;