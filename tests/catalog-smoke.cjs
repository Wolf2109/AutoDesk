const assert=require('node:assert/strict');
const vm=require('node:vm');const fs=require('node:fs');
(async()=>{
 const stored=new Map(), calls=[];let fail=false;
 const rows={'vehicles-database.json':[{Brand:'VW'}],'ecu_database.json':[{bosch_number:'001'}],'dtc-database.json':{generic:{},manufacturers:{}}};
 const ctx={URL,Response,AbortSignal,Event,dispatchEvent(){},document:{baseURI:'http://127.0.0.1:18743/'},location:{hostname:'127.0.0.1'},caches:{open:async()=>({match:async k=>stored.get(k)?.clone(),put:async(k,v)=>stored.set(k,v.clone())})},fetch:async(url,options)=>{calls.push([url,options.cache]);if(fail)throw Error('offline');return new Response(JSON.stringify(rows[url.split('/').pop()]));}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('src/js/catalog-updates.js','utf8'),ctx);
 await ctx.loadAutoDeskCatalog('vehicles-database.json',Array.isArray);assert.equal(calls.length,1);assert.match(calls[0][0],/^http:\/\/127/);
 await ctx.loadAutoDeskCatalog('vehicles-database.json',Array.isArray);assert.equal(calls.length,1);
 const result=await ctx.AutoDeskCatalogs.sync();assert.equal(result.filter(r=>r.ok).length,3);assert.equal(calls.length,4);assert.ok(calls.slice(1).every(c=>c[0].startsWith('https://')&&c[1]==='no-store'));
 fail=true;assert.equal((await ctx.AutoDeskCatalogs.sync()).filter(r=>r.ok).length,0);const before=calls.length;await ctx.loadAutoDeskCatalog('vehicles-database.json',Array.isArray);assert.equal(calls.length,before);
 console.log('Manual catalog sync OK: local first, cached reads, explicit remote sync, offline retention');
})().catch(e=>{console.error(e);process.exitCode=1;});
