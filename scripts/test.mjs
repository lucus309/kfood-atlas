import {readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const files=readdirSync('.').filter(f=>/^test-.*\.mjs$/.test(f)).sort();
for(const file of files){console.log('\n'+file);execFileSync(process.execPath,[file],{stdio:'inherit'});}
console.log(`\n${files.length} test suites passed.`);
