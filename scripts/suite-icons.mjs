// Reuse the extension's exact vector shapes in GTK without a JavaScript runtime.
import {readFileSync,writeFileSync} from 'node:fs';
const source=readFileSync(new URL('../extension/icons.js',import.meta.url),'utf8');
const {SOLID_SHAPES}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const result={};
for(const [name,draw] of Object.entries(SOLID_SHAPES))
    result[name]=draw({base:'__BASE__',light:'__LIGHT__',dark:'__DARK__',deep:'__DEEP__'});
const path=new URL('../suite/lovycairn_suite/shapes.json',import.meta.url);
const data=JSON.stringify(result,null,2)+'\n';
if(process.argv.includes('--check')){
    if(readFileSync(path,'utf8')!==data)throw new Error('Run node scripts/suite-icons.mjs to refresh native icons');
}else writeFileSync(path,data);
