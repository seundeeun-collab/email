const $ = (q) => document.querySelector(q);
const escapeHtml = (s='') => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state = { config: {}, mailboxes: [], messages: [], view: 'inbox', address: '', selected: null, search: '' };
const colors = ['','peach','blue'];
function toast(text) { const el=$('#toast'); el.textContent=text; el.classList.add('show'); clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.classList.remove('show'),2500); }
async function api(url, options={}) { const r=await fetch(url,{...options,headers:{'content-type':'application/json',...(options.headers||{})}}); const data=await r.json().catch(()=>({})); if(!r.ok) throw new Error(data.error||'Something went wrong.'); return data; }
function dateLabel(date) { const d=new Date(date), now=new Date(); if(d.toDateString()===now.toDateString()) return d.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}); if((now-d)<7*86400000) return d.toLocaleDateString([], {weekday:'short'}); return d.toLocaleDateString([], {month:'short',day:'numeric'}); }
function messageText(m) { return (m.text||'').replace(/\s+/g,' ').trim() || (m.html||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim() || 'Open this message to view its contents.'; }
function render() {
  const unread=state.messages.filter(m=>m.unread).length;
  $('#unread-count').textContent=unread||''; $('#mail-count').textContent=state.messages.length;
  $('#main-address').textContent=state.mailboxes[0]?.address || (state.config.domain ? `Choose an address @ ${state.config.domain}` : 'Connect your email domain in Settings');
  $('#domain-suffix').textContent='@'+(state.config.domain||'yourdomain.com');
  $('#connection-status').textContent=state.config.configured?'Inbox connected':'Setup needed';
  $('#live-label').textContent=state.config.configured?'Live inbox':'Setup needed'; $('.live-indicator').classList.toggle('connected',state.config.configured);
  const addresses=state.mailboxes;
  $('#address-list').innerHTML=addresses.length?addresses.map(a=>`<button class="address-entry ${state.address===a.address?'selected':''}" data-address="${escapeHtml(a.address)}"><i class="address-dot"></i><span>${escapeHtml(a.address)}</span><span class="address-count">${state.messages.filter(m=>m.unread&&m.to?.includes(a.address)).length||''}</span></button>`).join(''):'<div style="padding:0 10px 9px;color:#a5aaa4;font-size:10px;line-height:1.6">Your addresses will live here.</div>';
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.view===state.view));
  $('#current-folder').textContent=state.address||({inbox:'Inbox',starred:'Starred',archive:'Archive'}[state.view]||'Inbox');
  let messages=state.messages.filter(m=>!state.address||m.to?.includes(state.address));
  if(state.view==='starred') messages=messages.filter(m=>m.starred);
  if(state.view==='archive') messages=messages.filter(m=>m.archived);
  else if(state.view==='inbox') messages=messages.filter(m=>!m.archived);
  if(state.search) { const q=state.search.toLowerCase(); messages=messages.filter(m=>`${m.from} ${m.subject} ${messageText(m)}`.toLowerCase().includes(q)); }
  $('#mail-title').innerHTML=`${state.view==='inbox'?'Your inbox':state.view==='starred'?'Starred':'Archive'} <span class="title-count">${messages.length}</span>`;
  $('#mail-caption').textContent=messages.length?'A calm little space for everything that finds its way here.':'A calm little space for everything that finds its way here.';
  if(!messages.length) $('#message-list').innerHTML=`<div class="empty-state"><div class="empty-graphic">✉</div><h3>${state.search?'No mail found.':'A fresh start.'}</h3><p>${state.search?'Try another name or keyword.':'When a message arrives, it’ll find its way right here. Create an address to get going.'}</p>${state.config.domain?'<button class="button subtle" id="empty-create">＋ Create an address</button>':''}</div>`;
  else $('#message-list').innerHTML=messages.map((m,i)=>`<article class="message-row ${m.unread?'unread':''} ${state.selected===m.id?'selected':''}" data-message="${escapeHtml(m.id)}"><div class="sender-avatar ${colors[i%colors.length]}">${escapeHtml((m.from.match(/\p{L}/u)||['?'])[0].toUpperCase())}</div><div class="message-content"><div class="message-head"><span class="message-sender">${escapeHtml(m.from.replace(/<.*?>/g,'').trim())}</span><span class="message-date">${escapeHtml(dateLabel(m.receivedAt))}</span></div><div class="message-subject">${escapeHtml(m.subject||'(no subject)')}</div><div class="message-preview">${escapeHtml(messageText(m))}</div></div>${m.unread?'<span class="message-label">New</span>':''}</article>`).join('');
  if(state.selected) showDetail(state.messages.find(m=>m.id===state.selected));
  else $('#detail-pane').innerHTML='<div class="detail-empty"><div class="detail-illustration">✉</div><h3>Make yourself at home.</h3><p>Choose a message to read it here. New mail will appear as soon as it arrives.</p><div class="detail-hint"><span class="key">⌘</span><span class="key">K</span> <span>to search</span></div></div>';
}
function showDetail(m) {
  if(!m)return;
  const body=m.html?`<iframe class="detail-html" sandbox="" title="Email content" srcdoc="${escapeHtml(m.html)}"></iframe>`:`<div class="detail-body">${escapeHtml(m.text||'This message has no text content.')}</div>`;
  $('#detail-pane').innerHTML=`<div class="detail-message"><div class="detail-top"><span class="eyebrow">MESSAGE</span><div><button class="icon-button" id="star-message" title="Star message">${m.starred?'★':'☆'}</button><button class="icon-button" id="archive-message" title="Archive">▤</button></div></div><h2 class="detail-subject">${escapeHtml(m.subject||'(no subject)')}</h2><div class="detail-from"><span class="sender-avatar">${escapeHtml((m.from.match(/\p{L}/u)||['?'])[0].toUpperCase())}</span><span><strong>${escapeHtml(m.from)}</strong><small>to ${escapeHtml((m.to||[]).join(', '))} · ${escapeHtml(new Date(m.receivedAt).toLocaleString())}</small></span></div><div class="detail-body">${body}</div>${m.attachments?.length?`<p class="message-preview">${m.attachments.length} attachment(s)</p>`:''}</div>`;
  $('#star-message').onclick=async()=>{m.starred=!m.starred;render();};
  $('#archive-message').onclick=async()=>{m.archived=true;state.selected=null;render();};
}
async function load() { try { [state.config,state.mailboxes,state.messages]=await Promise.all([api('/api/config'),api('/api/mailboxes'),api('/api/messages')]); render(); } catch(e) { if(e.message==='Sign in to continue.') { $('#login').classList.remove('hidden'); $('#app-shell').style.display='none'; } else toast(e.message); } }
async function createAddress() { $('#address-error').textContent=''; try { const item=await api('/api/mailboxes',{method:'POST',body:JSON.stringify({name:$('#address-name').value})}); state.mailboxes.push(item); state.address=item.address; $('#address-dialog').close(); $('#address-name').value=''; render(); toast('Your new address is ready.'); } catch(e) { $('#address-error').textContent=e.message; } }
function openAddress() { if(!state.config.domain) { $('#settings-dialog').showModal(); return; } $('#address-error').textContent=''; $('#address-dialog').showModal(); setTimeout(()=>$('#address-name').focus(),80); }
document.querySelectorAll('[data-view]').forEach(el=>el.addEventListener('click',()=>{state.view=el.dataset.view;state.address='';render();}));
$('#new-address').onclick=$('#new-address-small').onclick=openAddress;
$('#address-form').addEventListener('submit',e=>{e.preventDefault();createAddress();}); $('#create-address').onclick=e=>{e.preventDefault();createAddress();};
document.querySelectorAll('[data-suggestion]').forEach(el=>el.onclick=()=>{$('#address-name').value=el.dataset.suggestion;$('#address-name').focus();});
$('#address-list').addEventListener('click',e=>{const b=e.target.closest('[data-address]');if(b){state.address=state.address===b.dataset.address?'':b.dataset.address;state.view='inbox';render();}});
$('#message-list').addEventListener('click',async e=>{if(e.target.closest('#empty-create'))return openAddress();const row=e.target.closest('[data-message]');if(!row)return;state.selected=row.dataset.message;const m=state.messages.find(x=>x.id===state.selected);if(m.unread){m.unread=false;api(`/api/messages/${encodeURIComponent(m.id)}`,{method:'PATCH',body:JSON.stringify({unread:false})}).catch(()=>{});}render();});
$('#search').oninput=e=>{state.search=e.target.value;render();};$('#refresh').onclick=load;$('#settings-open').onclick=()=>{$('#setup-status').textContent=state.config.configured?'Everything is connected. Your inbox is ready.':state.config.domain?'Domain found. Add your Resend API key and webhook secret to finish setup.':'Connect a domain and mail provider to start receiving.';$('#settings-dialog').showModal();};
$('#copy-main').onclick=async()=>{const text=state.mailboxes[0]?.address;if(!text)return toast('Create an address first.');await navigator.clipboard.writeText(text);toast('Copied to clipboard.');};
$('#notification-toggle').onclick=async()=>{if(!('Notification'in window))return toast('This browser does not support notifications.');const result=await Notification.requestPermission();toast(result==='granted'?'Notifications enabled.':'Notifications are turned off.');};
$('#login-form').onsubmit=async e=>{e.preventDefault();try{await api('/api/login',{method:'POST',body:JSON.stringify({password:$('#password').value})});$('#login').classList.add('hidden');$('#app-shell').style.display='grid';await load();}catch(err){$('#login-error').textContent=err.message;}};
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('#search').focus();}});
let known=new Set();
async function poll(){try{const next=await api('/api/messages');const incoming=next.filter(m=>!known.has(m.id));if(known.size&&incoming.length){incoming.forEach(m=>{if(Notification.permission==='granted')new Notification(m.from,{body:m.subject||'New email'});});toast(incoming.length===1?'You have a new message.':`You have ${incoming.length} new messages.`);}known=new Set(next.map(m=>m.id));const before=state.messages.map(m=>`${m.id}:${m.unread}`).join('|');state.messages=next;if(before!==next.map(m=>`${m.id}:${m.unread}`).join('|'))render();}catch{} }
load().then(()=>{known=new Set(state.messages.map(m=>m.id));setInterval(poll,12000);});
