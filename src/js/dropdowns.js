/* Native selects retain their values, validation and existing event handlers. */
(() => {
  const controls = new WeakMap();
  let current = null, counter = 0;
  const el = (tag, cls) => Object.assign(document.createElement(tag), {className:cls});
  const norm = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase();
  function enhance(select) {
    if (controls.has(select) || select.multiple || select.size > 1) return;
    const wrap = el('div','vs-host shared-select'), picker = el('div','vs-picker'), line = el('div','vs-input');
    const input = el('input',''), toggle = el('button','vs-toggle'), portal = el('div','vs-host shared-select-portal'), list = el('div','vs-options');
    const id = `shared-select-${++counter}`;
    input.type='search'; input.id=id; input.autocomplete='off'; input.setAttribute('role','combobox'); input.setAttribute('aria-autocomplete','list'); input.setAttribute('aria-controls',id+'-list');
    const label = select.getAttribute('aria-label') || Array.from(select.labels || []).map(l=>l.textContent.trim()).join(' ') || 'Izaberite';
    input.setAttribute('aria-label',label); toggle.type='button'; toggle.setAttribute('aria-label','Prikaži: '+label); toggle.setAttribute('aria-controls',id+'-list');
    toggle.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
    list.id=id+'-list'; list.setAttribute('role','listbox'); list.hidden=true; portal.append(list);
    let matches=[], active=-1;
    const sync = () => { input.disabled=toggle.disabled=select.disabled; input.setAttribute('aria-required',String(select.required)); if(current!==api) input.value=select.selectedOptions[0]?.textContent.trim() || ''; if(select.disabled && current===api) close(); };
    function close(){ if(current===api) current=null; picker.classList.remove('is-open'); input.setAttribute('aria-expanded','false'); toggle.setAttribute('aria-expanded','false'); input.removeAttribute('aria-activedescendant'); list.hidden=true; portal.remove(); sync(); }
    function position(){ const r=line.getBoundingClientRect(), v=window.visualViewport, top=v?.offsetTop||0, bottom=top+(v?.height||innerHeight); const below=bottom-r.bottom-8, above=r.top-top-8, up=below<210&&above>below; const height=Math.max(40,Math.min(280,up?above:below)); portal.style.left=r.left+'px'; portal.style.width=r.width+'px'; list.style.maxHeight=height+'px'; portal.style.top=(up?r.top-6:r.bottom+6)+'px'; portal.classList.toggle('above',up); }
    function choose(option){ if(option.disabled||select.disabled)return; select.selectedIndex=option.index; close(); select.dispatchEvent(new Event('input',{bubbles:true})); select.dispatchEvent(new Event('change',{bubbles:true})); sync(); }
    function show(q=''){ if(select.disabled)return; if(current&&current!==api)current.close(); current=api; picker.classList.add('is-open'); input.setAttribute('aria-expanded','true'); toggle.setAttribute('aria-expanded','true'); matches=Array.from(select.options).filter(o=>!o.hidden&&!o.disabled&&norm(o.textContent).includes(norm(q))); active=-1; input.removeAttribute('aria-activedescendant'); const fragment=document.createDocumentFragment(); matches.forEach((o,i)=>{const b=el('button','vs-option'); b.type='button'; b.tabIndex=-1; b.id=id+'-option-'+i; b.setAttribute('role','option'); b.setAttribute('aria-selected',String(o.selected)); b.textContent=o.textContent; b.onpointerdown=e=>{if(e.pointerType==='mouse')e.preventDefault();}; b.onclick=()=>choose(o); fragment.append(b);}); if(!matches.length){const p=el('p','subtle');p.textContent='Nema rezultata';fragment.append(p);} list.replaceChildren(fragment); document.body.append(portal); list.hidden=false; list.scrollTop=0; position(); }
    const api={close,sync,wrap,portal,select}; controls.set(select,api);
    input.onfocus=()=>{if(current!==api)show();input.select();}; input.onclick=()=>{if(current!==api)show();}; input.oninput=()=>show(input.value);
    toggle.onpointerdown=e=>{if(e.pointerType==='mouse')e.preventDefault();}; toggle.onclick=()=>{if(document.activeElement===input)input.blur();if(current===api)close();else show();};
    const keys=e=>{if(e.key==='Escape'&&current===api){e.preventDefault();e.stopPropagation();close();}else if(e.key==='Tab'){close();}else if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();if(current!==api)show();if(!matches.length)return;active=active<0?(e.key==='ArrowDown'?0:matches.length-1):Math.max(0,Math.min(matches.length-1,active+(e.key==='ArrowDown'?1:-1))); Array.from(list.children).forEach((b,i)=>b.classList.toggle('vs-active',i===active));input.setAttribute('aria-activedescendant',list.children[active].id);list.children[active].scrollIntoView({block:'nearest'});}else if(e.key==='Enter'&&current===api){e.preventDefault();if(active>=0)choose(matches[active]);else if(matches.length===1)choose(matches[0]);}};
    input.onkeydown=keys; toggle.onkeydown=keys;
    select.addEventListener('focus',()=>input.focus()); select.addEventListener('invalid',()=>{input.setAttribute('aria-invalid','true');input.focus();}); select.addEventListener('change',()=>{input.removeAttribute('aria-invalid');queueMicrotask(sync);});
    line.append(input,toggle);picker.append(line);wrap.append(picker); select.after(wrap); select.classList.add('shared-native-select');select.tabIndex=-1;select.setAttribute('aria-hidden','true'); close();
  }
  function scan(root){if(root.nodeType!==1)return;if(root.matches('select'))enhance(root);root.querySelectorAll('select').forEach(enhance);}
  document.addEventListener('pointerdown',e=>{if(current&&!current.wrap.contains(e.target)&&!current.portal.contains(e.target))current.close();},true);
  document.addEventListener('focusin',e=>{if(current&&!current.wrap.contains(e.target)&&!current.portal.contains(e.target)&&e.target!==current.select)current.close();});
  window.addEventListener('scroll',e=>{if(current&&!current.portal.contains(e.target))current.close();},true);
  window.addEventListener('resize',()=>current?.close());
  document.addEventListener('change',()=>queueMicrotask(()=>document.querySelectorAll('select.shared-native-select').forEach(s=>controls.get(s)?.sync())));
  document.addEventListener('reset',()=>queueMicrotask(()=>document.querySelectorAll('select.shared-native-select').forEach(s=>controls.get(s)?.sync())));
  new MutationObserver(records=>{for(const r of records){if(r.target instanceof Element){const s=r.target.closest('select');if(s){enhance(s);controls.get(s)?.sync();}}for(const n of r.addedNodes)scan(n);}if(current&&!current.select.isConnected)current.close();}).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['disabled','selected','hidden','value']});
  scan(document.body);
})();
