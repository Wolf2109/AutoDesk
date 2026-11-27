#!/usr/bin/env python3
"""Build the bundled JSON from the MIT-licensed upstream SQLite database."""
import argparse, json, pathlib, sqlite3, subprocess, tempfile, re
p=argparse.ArgumentParser();p.add_argument('--ref',default='main');p.add_argument('--repo',type=pathlib.Path);a=p.parse_args()
root=pathlib.Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as temp:
    repo=a.repo or pathlib.Path(temp)/'upstream'
    if not a.repo:
        subprocess.run(['git','clone','--depth','1','--branch',a.ref,'https://github.com/Wal33D/dtc-database.git',str(repo)],check=True)
    db=repo/'data/dtc_codes.db'
    if not db.exists(): subprocess.run(['python3','build_database.py'],cwd=repo,check=True)
    rev=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()
    result={'version':rev,'source':'https://github.com/Wal33D/dtc-database','generic':{},'manufacturers':{}}
    with sqlite3.connect(db) as c:
        for code,make,desc in c.execute("SELECT code,manufacturer,description FROM dtc_definitions WHERE locale='en' ORDER BY manufacturer,code"):
            code=code.strip().upper();make=make.strip().upper();desc=desc.strip()
            if not re.fullmatch(r'[PBCU][0-3][0-9A-F]{3}',code) or not desc: continue
            group=result['generic'] if make=='GENERIC' else result['manufacturers'].setdefault(make,{})
            group[code]=desc
    total=len(result['generic'])+sum(map(len,result['manufacturers'].values()))
    if total<10000 or len(result['manufacturers'])<10: raise RuntimeError(f'Unexpected incomplete database: {total}')
    (root/'DTC-UPSTREAM-LICENSE.txt').write_bytes((repo/'LICENSE').read_bytes())
    target=root/'data/dtc-database.json';tmp=target.with_suffix('.tmp');tmp.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8');tmp.replace(target)
    print(f'{total} definitions; {len(result["manufacturers"])} manufacturers; revision {rev}')
