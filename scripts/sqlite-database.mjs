import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

export function createLocalDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(fs.readFileSync(new URL('../drizzle/0000_chat.sql', import.meta.url), 'utf8'));
  return {
    prepare(query) {
      let values = [];
      return {
        bind(...args) {
          values = args;
          return this;
        },
        async first() {
          return sqlite.prepare(query).get(...values) || null;
        },
        async run() {
          return sqlite.prepare(query).run(...values);
        },
      };
    },
    close() {
      sqlite.close();
    },
  };
}
