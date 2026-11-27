const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {start}=require('../desktop/server.cjs');
test('desktop server serves app and all three databases',async()=>{
 const server=await start(path.resolve(__dirname,'..'),0);
 try {
  const base=`http://127.0.0.1:${server.address().port}`;
  assert.match(await (await fetch(base+'/')).text(),/AutoDesk/);
  for(const f of ['vehicles-database.json','ecu_database.json','dtc-database.json']) {
   const r=await fetch(base+'/data/'+f,{method:'HEAD'});assert.equal(r.status,200);assert.ok(Number(r.headers.get('content-length'))>0);
  }
  assert.equal((await fetch(base+'/missing')).status,404);
  assert.equal((await fetch(base+'/',{method:'POST'})).status,403);
 } finally {await new Promise(r=>server.close(r));}
});
