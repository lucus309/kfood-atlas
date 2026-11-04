CREATE TABLE chat_usage (day TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0);
--> statement-breakpoint
CREATE TABLE chat_cache (key TEXT PRIMARY KEY, result TEXT NOT NULL, created_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE chat_rate (key TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0);
--> statement-breakpoint
