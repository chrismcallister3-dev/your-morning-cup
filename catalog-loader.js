(async()=>{try{
const response=await fetch('content/catalog.json',{cache:'no-store'});
if(!response.ok)throw new Error('Catalog unavailable');
const d=await response.json();
if(d.schemaVersion!==1||!Array.isArray(d.items)||!d.edition)throw new Error('Invalid catalog');
const index=new Map(d.items.map(x=>[x.id,x]));
const items=d.edition.discoveryIds.map(id=>index.get(id));
if(!items.length||items.some(x=>!x))throw new Error('Missing discovery');
const names=['The Daily Pour','A Little Froth','Something to Chew On','The Last Sip'];
const panel=document.querySelector('#ymc-discover .pane-scroll');
const sections=[...panel.querySelectorAll('.sect')];
const article=document.querySelector('#ymc-deep .article');
const dives=new Map((d.deepDives||[]).map(x=>[x.id,x]));
const dive=dives.get(d.edition.featuredDiveId);
if(sections.length!==names.length||!article||!dive)throw new Error('Missing layout');
const node=(tag,cls,content)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(content!==undefined)e.textContent=content;return e;};
const link=source=>{const a=node('a','',source.label);a.href=source.url;a.target='_blank';a.rel='noopener noreferrer';return a;};
const groups=new Map(names.map(n=>[n,[]]));
for(const item of items){
if(!groups.has(item.section))throw new Error('Unknown category');
const card=node('div','item');
if(item.kind==='quote'){
const q=node('div','quote');q.append(node('p','',item.quote),node('span','',item.attribution));card.append(q);
if(item.source)card.append(link(item.source));
}else{
card.append(node('div','meta',item.meta||''),node('h3','',item.title),node('p','',item.summary));
const ll=node('div','linkline');if(item.source)ll.append(link(item.source));
if(item.deepDiveId){
const selected=dives.get(item.deepDiveId);
if(!selected)throw new Error('Missing story Deep Dive');
const b=node('button','diveBtn','Take a Deeper Dive?');b.dataset.dive=item.deepDiveId;
b.addEventListener('click',()=>{
article.innerHTML=selected.html;
// Navigation owns panel switching and the card-specific scroll reset.
document.getElementById('ymc').dispatchEvent(new CustomEvent('ymc:open-dive'));
});ll.append(b);}
card.append(ll);}
groups.get(item.section).push(card);
}
names.forEach((name,i)=>{let n=sections[i].nextElementSibling;while(n&&n.classList.contains('item')){const next=n.nextElementSibling;n.remove();n=next;}
const f=document.createDocumentFragment();groups.get(name).forEach(c=>f.append(c));sections[i].after(f);});
article.innerHTML=dive.html;
const date=document.querySelector('.hero p[style]');if(date)date.textContent=d.edition.label;
const count=document.querySelector('#ymc-discover .panehead .muted');if(count)count.textContent=items.length+' discoveries';
}catch(e){console.warn('Morning Cup: existing static edition retained.',e);}
})();
