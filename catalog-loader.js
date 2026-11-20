/* Your Morning Cup — isolated preview pilot: return-visit edition assembly.
   Uses only editorially approved catalog excerpts; no AI calls, logins, or server storage. */
(async()=>{
'use strict';
const params=new URLSearchParams(location.search);
const deepTest=params.get('ymc_deep_test')==='1';
const cycleTest=params.get('ymc_cycle_test')==='1'&&!deepTest;
const STORAGE=deepTest?'ymc.preview.deep-test.v1':cycleTest?'ymc.preview.cycle-test.v1':'ymc.preview.edition.v1';
const CAPACITY=3;
const MAX_REFILLS=2;
const $=s=>document.querySelector(s);
const panel=$('#ymc-discover .pane-scroll');
const article=$('#ymc-deep .article');
if(!panel||!article)return;
const sectionNames=['The Daily Pour','A Little Froth','Something to Chew On','The Last Sip'];
const sections=[...panel.querySelectorAll('.sect')];
if(sections.length!==4)return;
const node=(tag,cls,txt)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(txt!==undefined)el.textContent=txt;return el;};
const localDate=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
const testDate=cycleTest?params.get('ymc_test_date'):null;
const validTestDate=testDate&&/^\d{4}-\d{2}-\d{2}$/.test(testDate)&&!isNaN(new Date(testDate+'T12:00:00').valueOf());
const today=validTestDate?testDate:localDate();
const tomorrow=()=>{const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);};
const read=()=>{try{return JSON.parse(localStorage.getItem(STORAGE)||'null');}catch{return null;}};
const store=s=>{try{localStorage.setItem(STORAGE,JSON.stringify(s));}catch{console.warn('Morning Cup: browser storage unavailable; persistence disabled.');}};
const preferences=()=>{try{const p=JSON.parse(localStorage.getItem('ymc.reader.preferences')||'{}');return {topics:Array.isArray(p.topics)?p.topics:[],exclusions:Array.isArray(p.exclusions)?p.exclusions:[]};}catch{return {topics:[],exclusions:[]};}};
const hash=s=>{let h=2166136261;for(const c of s){h=Math.imul(h^c.charCodeAt(0),16777619);}return h>>>0;};
const ageInDays=item=>{if(!item.publishedAt)return null;const d=Date.parse(item.publishedAt+'T12:00:00Z');if(!Number.isFinite(d))return null;return (Date.parse(today+'T12:00:00Z')-d)/86400000;};
const eligible=item=>{
  if(!item.source?.url||!item.title||!item.summary)return false;
  const age=ageInDays(item);
  if(age!==null&&age>7&&item.longevity==='expires-quickly')return false;
  if(age!==null&&age>45&&item.longevity==='time-sensitive')return false;
  return true;
};
const normal=x=>String(x||'').trim().toLowerCase();
function select(pool,count,date,salt){
  const p=preferences();const exclusions=p.exclusions.map(normal);
  const allowed=pool.filter(x=>!exclusions.some(e=>e&&[x.category,...x.topics,...x.exclusionTags].some(t=>normal(t).includes(e)||e.includes(normal(t)))));
  const tags=p.topics.map(normal);
  const ranked=allowed.map(item=>{
    const topicHits=tags.filter(t=>t&&[item.category,...item.topics].some(a=>normal(a).includes(t)||t.includes(normal(a)))).length;
    return {item,topicHits,noise:hash(date+'|'+salt+'|'+item.id)};
  }).sort((a,b)=>(tags.length?b.topicHits-a.topicHits:0)||a.noise-b.noise);
  const chosen=[],cat=new Set(),kind=new Set();
  for(const v of ranked){if(chosen.length>=count)break;if(!cat.has(v.item.category)&&!kind.has(v.item.editorialContribution)){chosen.push(v.item);cat.add(v.item.category);kind.add(v.item.editorialContribution);}}
  for(const v of ranked){if(chosen.length>=count)break;if(!chosen.includes(v.item)&&!cat.has(v.item.category)){chosen.push(v.item);cat.add(v.item.category);}}
  for(const v of ranked){if(chosen.length>=count)break;if(!chosen.includes(v.item))chosen.push(v.item);}
  return chosen;
}
function saveScroll(){
  const s=read();if(s&&s.date===today){s.scrollTop=panel.scrollTop;store(s);}
}
let scrollSave=0;
panel.addEventListener('scroll',()=>{clearTimeout(scrollSave);scrollSave=setTimeout(saveScroll,180);},{passive:true});
try{
 const response=await fetch('content/approved-catalog-pilot.json?rev=20261119b',{cache:'no-store'});
 if(!response.ok)throw Error('Catalog fetch: '+response.status);
 const catalog=await response.json();
 if(catalog.schemaVersion!==2||!Array.isArray(catalog.items)||!catalog.items.length)throw Error('Invalid catalog structure');
 const deepResponse=await fetch('content/deep-dives-pilot.json?rev=20261120a',{cache:'no-store'});
 if(!deepResponse.ok)throw Error('Deep Dive catalog fetch failed');
 const deepCatalog=await deepResponse.json();
 const dives=new Map((deepCatalog.items||[]).map(x=>[x.id,x]));
 const index=new Map(catalog.items.map(i=>[i.id,i]));
 const pool=catalog.items.filter(eligible);
 const cached=read();
 const testBanner=cycleTest?node('div','note',''):null;
 let state=(cached&&Array.isArray(cached.seen)&&Array.isArray(cached.ids)&&Number.isInteger(cached.refillsUsed))?cached:null;
 if(!state||state.date!==today){
   const seen=state?.seen?.filter(id=>index.has(id))||[];
   const poolLeft=pool.filter(x=>!seen.includes(x.id));
   const chosen=deepTest?['YMC-P038','YMC-P039','YMC-P040'].map(id=>index.get(id)).filter(Boolean):select(poolLeft,CAPACITY,today,'first');
   state={date:today,ids:chosen.map(x=>x.id),seen:[...new Set([...seen,...chosen.map(x=>x.id)])],refillsUsed:0,scrollTop:0};
   store(state);
 }else{
   state.ids=state.ids.filter(id=>index.has(id)&&pool.some(x=>x.id===id));
   if(deepTest&&state.ids.join(',')!=='YMC-P038,YMC-P039,YMC-P040'){
     state.ids=['YMC-P038','YMC-P039','YMC-P040'];state.seen=[...new Set([...state.seen,...state.ids])];state.refillsUsed=0;state.scrollTop=0;
   }
   store(state);
 }
 const quote=sections[3].nextElementSibling?.classList.contains('item')?sections[3].nextElementSibling.cloneNode(true):null;
 const end=panel.querySelector('.edition-end')||node('div','edition-end');
 const instruction=node('div','muted');
 const refillControls=node('div','ymc-refill-controls');
 const refillBtn=node('button','diveBtn','Refill My Cup');
 refillBtn.style.padding='11px 20px';
 refillBtn.type='button';
 const status=node('div','muted');
 status.style.marginTop='10px';
 function renderDive(dive){
   article.replaceChildren();
   article.append(node('div','over',dive.eyebrow),node('h2','',dive.title),node('p','intro',dive.intro));
   for(const section of dive.sections||[]){article.append(node('h4','',section.heading));for(const para of section.paragraphs||[])article.append(node('p','',para));}
   article.append(node('h4','','Read the original reporting'));
   const l=node('a','',dive.sourceLabel+' ↗');l.href=dive.sourceUrl;l.target='_blank';l.rel='noopener noreferrer';article.append(l);
   article.append(node('p','muted','Original Morning Cup editorial interpretation based on the linked source; controlled preview test.'));
 }
 function display(){
   sectionNames.forEach((name,i)=>{let n=sections[i].nextElementSibling;while(n&&n.classList.contains('item')){const next=n.nextElementSibling;n.remove();n=next;}});
   if(quote)sections[3].after(quote.cloneNode(true));
   const buckets=[[],[],[]];
   const selected=state.ids.map(id=>index.get(id)).filter(Boolean);
   for(let i=0;i<selected.length;i++){
     const it=selected[i],card=node('div','item');
     card.append(node('div','meta',it.category+' · '+it.editorialContribution.replace('-',' ')),node('h3','',it.title),node('p','',it.summary));
     const line=node('div','linkline'),a=node('a','',('Original source: '+it.source.publisher+' ↗'));
     a.href=it.source.url;a.rel='noopener noreferrer';a.target='_blank';line.append(a);
     const dive=dives.get(it.id);
     if(dive){const b=node('button','diveBtn','Take a Deeper Dive?');b.type='button';b.addEventListener('click',()=>{renderDive(dive);document.getElementById('ymc').dispatchEvent(new CustomEvent('ymc:open-dive'));});line.append(b);}
     card.append(line);
     buckets[i%3].push(card);
   }
   buckets.forEach((cards,i)=>{const f=document.createDocumentFragment();cards.forEach(c=>f.append(c));sections[i].after(f);});
   const label=$('.hero p[style]');if(label)label.textContent=today+' · Your curated edition'+(testDate?' · Test date':'');
   const foot=$('.foot');if(foot)foot.textContent='Your Morning Cup · Thoughtfully curated · No endless scrolling';
   const count=$('#ymc-discover .panehead .muted');if(count)count.textContent=selected.length+' discoveries';
   if(!end.isConnected)panel.append(end);
   if(cycleTest&&testBanner&&!testBanner.isConnected)panel.insertBefore(testBanner,panel.querySelector('.sect'));
   if(cycleTest&&testBanner){
     testBanner.replaceChildren();
     testBanner.append(node('strong','', 'Daily-cycle pilot · '+today));
     const info=node('p','','Current IDs: '+(state.ids.join(', ')||'none')+' · Seen: '+state.seen.length+' · Refills used: '+state.refillsUsed+'/2');
     testBanner.append(info);
     const actions=node('div','linkline');
     const same=node('a','','Reopen this date');same.href='?ymc_cycle_test=1&ymc_test_date='+today;
     const next=node('a','','Simulate next date');next.href='?ymc_cycle_test=1&ymc_test_date='+tomorrow();
     const reset=node('button','back','Reset test history');reset.type='button';reset.style.margin='0';reset.addEventListener('click',()=>{try{localStorage.removeItem(STORAGE);}catch{}location.href='?ymc_cycle_test=1&ymc_test_date='+today;});
     actions.append(same,next,reset);testBanner.append(actions);
   }
   if(!instruction.isConnected)end.append(instruction);
   if(!refillControls.isConnected)panel.insertBefore(refillControls,panel.querySelector('.sect'));
   if(!refillBtn.isConnected)refillControls.append(refillBtn);
   if(!status.isConnected)refillControls.append(status);
   instruction.textContent=selected.length?'Your cup is empty. For now.':'No new eligible discoveries remain in this pilot catalog.';
   const remaining=MAX_REFILLS-state.refillsUsed;
   const remainingSelection=select(pool.filter(x=>!state.seen.includes(x.id)),1,today,'availability');
   refillBtn.disabled=deepTest||remaining===0||remainingSelection.length===0;
   refillBtn.style.opacity=refillBtn.disabled?'.4':'1';
   status.textContent=deepTest?'Deep Dive navigation test · Refills disabled in this dedicated test':remaining+' of '+MAX_REFILLS+' Refills remaining today'+(refillBtn.disabled&&remaining>0?' · No further eligible discoveries':'');
 }
 refillBtn.addEventListener('click',()=>{
   if(state.date!==today||state.refillsUsed>=MAX_REFILLS||deepTest)return;
   const available=pool.filter(x=>!state.seen.includes(x.id));
   const next=select(available,CAPACITY,today,'refill-'+state.refillsUsed);
   if(!next.length){display();return;}
   state.ids=next.map(x=>x.id);
   state.seen=[...new Set([...state.seen,...state.ids])];
   state.refillsUsed++;state.scrollTop=0;store(state);
   display();panel.scrollTop=0;
 });
 const diveTitle=node('h2','','More to explore');
 article.replaceChildren(diveTitle,node('p','intro','This edition contains original Morning Cup summaries and links to their sources. Full Deep Dives will be added after editorial preparation and verification.'));
 display();
 panel.scrollTop=state.scrollTop||0;
 // Isolated cycle tests: ?ymc_cycle_test=1, then use the visible date controls.
 window.YMCPilot={date:today,getState:()=>({...state}),catalogCount:catalog.items.length,eligibleCount:pool.length};
}catch(e){console.warn('Morning Cup: saved sample edition retained because pilot catalog failed.',e);}
})();