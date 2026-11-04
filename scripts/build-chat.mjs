import fs from 'node:fs';import {build} from 'esbuild';
const types={html:'text/html',css:'text/css',mjs:'text/javascript',json:'application/json',svg:'image/svg+xml'};
const assets={};for(const f of fs.readdirSync('dist')){if(!fs.statSync('dist/'+f).isFile())continue;const type=types[f.split('.').at(-1)];if(type)assets['/'+f]={type:type+'; charset=utf-8',body:fs.readFileSync('dist/'+f,'utf8')};}
fs.mkdirSync('.build',{recursive:true});fs.mkdirSync('dist/server',{recursive:true});fs.mkdirSync('dist/.openai',{recursive:true});
fs.writeFileSync('.build/assets.mjs','export default '+JSON.stringify(assets));
await build({entryPoints:['server/worker.mjs'],outfile:'dist/server/index.js',bundle:true,format:'esm',platform:'browser',conditions:['workerd','browser'],external:['node:*'],minify:true});
if(fs.existsSync('.openai/hosting.json'))fs.copyFileSync('.openai/hosting.json','dist/.openai/hosting.json');console.log('Worker built');
