const assert=require('node:assert/strict');
const fs=require('node:fs');
const v=require('../src/js/vehicle-search.js');
const raw=require('../data/vehicles-database.json');
assert(v.validCatalog(raw));
assert(!v.validCatalog([{Brand:'Old'}]));
const rows=raw.map(v.normalizeRow);
assert.equal(rows.length,20057);
assert(rows.every(r=>fs.existsSync('brands/'+r.brand_id+'.png')));
assert.equal(v.period(rows[0]),'2017 – ?');
assert.equal(v.period(rows[1]),'2012–2016');
assert.equal(v.moduleRows(rows,'ACM').length,208);
assert.equal(v.moduleRows(rows,'OTHER').length,197);
const groups=v.groupModuleSets(rows);
assert.equal(groups.reduce((n,g)=>n+g.rows.length,0),rows.length);
for(const g of groups){assert(g.rows.every(r=>r.Brand===g.row.Brand&&r.Model===g.row.Model&&r.Version===g.row.Version));}
const r=rows[0];const variants=v.groupModuleSets([r,{...r,ProductionStart:2018,'Engine type':'TEST'}]);
assert.equal(variants.length,1);assert.equal(variants[0].modules.length,1);assert.equal(variants[0].variants.length,2);
console.log('Vehicle catalog OK: all rows retained, brand images, years, module grouping');
