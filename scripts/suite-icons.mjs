// Reuse the extension's exact vector shapes in GTK without a JavaScript runtime.
import {readFileSync,writeFileSync} from 'node:fs';
const source=readFileSync(new URL('../extension/icons.js',import.meta.url),'utf8');
const {SOLID_SHAPES}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const result={};
for(const [name,draw] of Object.entries(SOLID_SHAPES))
    result[name]=draw({base:'__BASE__',light:'__LIGHT__',dark:'__DARK__',deep:'__DEEP__'});
const path=new URL('../suite/lovycairn_suite/shapes.json',import.meta.url);
const data=JSON.stringify(result,null,2)+'\n';
const groupSource=readFileSync(new URL('../extension/groups.js',import.meta.url),'utf8');
const paletteSource=readFileSync(new URL('../extension/palette.js',import.meta.url),'utf8');
const {P}=await import('data:text/javascript;base64,'+Buffer.from(paletteSource).toString('base64'));
const ids=declaration=>{
    const body=groupSource.match(new RegExp(declaration+' = \\[([\\s\\S]*?)\\n\\];'))?.[1];
    if(!body)throw new Error('Cannot find desktop icon declaration: '+declaration);
    return [...body.matchAll(/\[N_\('(?:\\.|[^'])*'\), '([^']+)'\]/g)].map(match=>match[1]);
};
const common=ids('const COMMON_SOLID');
const noteSource=readFileSync(new URL('../notes/lovycairn-notes',import.meta.url),'utf8');
const noteBlock=noteSource.match(/COLORS = \{[\s\S]*?\n\}/)?.[0];
if(!noteBlock)throw new Error('Cannot find note palette');
const noteColors=Object.fromEntries([...noteBlock.matchAll(/"([\w-]+)": \(_\("([^"]+)"\), "(#[\da-fA-F]{6})"\)/g)]
    .map(([,key,name,color])=>[key,{name,color}]));
if(!noteColors.yellow)throw new Error('Default note color is missing');
const visuals={
    project:{shape:'cube',color:P.ink2,allowed:[...ids('export const ICONS'),...common.filter(id=>!['terminal','rack'].includes(id))]},
    group:{shape:'folder',color:P.ink,allowed:[...ids('export const GROUP_ICONS'),...common]},
    notes:{default:'yellow',colors:noteColors},
};
for(const [target,contents] of [[path,data],[new URL('../suite/lovycairn_suite/visuals.json',import.meta.url),JSON.stringify(visuals,null,2)+'\n']]){
    if(process.argv.includes('--check')){
        if(readFileSync(target,'utf8')!==contents)throw new Error('Run node scripts/suite-icons.mjs to refresh native icons and colors');
    }else writeFileSync(target,contents);
}
