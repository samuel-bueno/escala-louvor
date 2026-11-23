ALTER TABLE `events` ADD `rehearsal_id` text REFERENCES events(id) ON DELETE SET NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `events_series_date_uq` ON `events` (`organization_id`,`recurrence_id`,`date`) WHERE `recurrence_id` IS NOT NULL;--> statement-breakpoint
ALTER TABLE `org_settings` ADD `sunday_series_until` text;