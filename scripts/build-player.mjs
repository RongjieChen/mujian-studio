import {build} from 'esbuild';
import fs from 'node:fs';
await build({entryPoints:['src/web/player-entry.tsx'],bundle:true,minify:true,format:'iife',target:'es2022',outfile:'dist/player-runtime.js',define:{'process.env.NODE_ENV':'"production"'}});
console.log('Standalone player built.');
