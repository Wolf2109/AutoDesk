'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2'};
function start(root, port=18743) {
  root = path.resolve(root);
  return new Promise((resolve,reject)=>{
    const server=http.createServer((req,res)=>{
      if(req.headers.host !== `127.0.0.1:${server.address().port}` || !['GET','HEAD'].includes(req.method)) {res.writeHead(403).end();return;}
      let p;
      try {p=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);} catch {res.writeHead(400).end();return;}
      const file=path.resolve(root,'.'+(p==='/'?'/index.html':p));
      if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
      fs.stat(file,(err,s)=>{
        if(err||!s.isFile()){res.writeHead(404).end();return;}
        res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Content-Length':s.size,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});
        if(req.method==='HEAD') return res.end();
        fs.createReadStream(file).on('error',()=>res.destroy()).pipe(res);
      });
    });
    server.once('error',reject);server.listen(port,'127.0.0.1',()=>resolve(server));
  });
}
module.exports={start};
