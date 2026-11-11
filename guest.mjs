import { readInvite, validatePeople, rsvpMessage, whatsappLink } from './domain.mjs';
import { InvitationSound } from './sound.mjs';
const $=s=>document.querySelector(s), esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fallback={casal:{noiva:'Beatriz',noivo:''},evento:{data:'2027-03-27'},whatsapp:{numero:'',modo:'teste'},confirmacao:{},fotos:[],som:{oferecer:true}};
let config=fallback, invite=null, chapter=0, opening=false, generation=0, message='';
const sound=new InvitationSound();
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const dateLabel=value=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return ''; const [y,m,d]=value.split('-');return `${d}/${m}/${y}`;};
try { invite=readInvite(location.href); } catch(error) { $('#invite-error').hidden=false; $('#invite-error').textContent=error.message; }
if(invite){$('#recipient').textContent=`Uma carta para ${invite.name}.`;$('#dedication').textContent=`${invite.name}, convidamos você a fazer parte do nosso próximo capítulo.`;}
async function loadConfig(){
  try {const response=await fetch('config.json',{cache:'no-cache'});if(response.ok)config=await response.json();}catch{/* essential content has a fallback */}
  $('#bride').textContent=config.casal?.noiva||'Beatriz';$('#groom').textContent=config.casal?.noivo||'seu amor';$('#name-note').hidden=Boolean(config.casal?.noivo);
  $('#preview-banner').hidden=config.previa!==true;
  if(config.evento?.horario)$('#time').textContent=`Às ${config.evento.horario.replace(':','h')}`;
  if(config.evento?.localNome)$('#venue').textContent=config.evento.localNome;
  if(config.evento?.endereco)$('#address').textContent=config.evento.endereco;
  if(config.evento?.localFicticio){$('#address').textContent=`${config.evento.endereco||'Trindade, Pernambuco'}. Local fictício para testes; o endereço real será informado pelos noivos.`;$('#maps').textContent='Ver Trindade no Maps ↗';}
  let maps=0;
  for(const [id,key] of [['maps','mapsUrl'],['waze','wazeUrl']]){const value=config.evento?.[key];if(value){try{const url=new URL(value);if(url.protocol==='https:'){$('#'+id).href=url.href;$('#'+id).hidden=false;maps++;}}catch{}}}
  $('#map-pending').hidden=maps>0;
  if(config.confirmacao?.prazo)$('#deadline').textContent=`Responda até ${dateLabel(config.confirmacao.prazo)}${config.confirmacao.prazoFicticio?' (prazo demonstrativo)':''}.`;
  sound.volume=Number.isFinite(config.som?.volume)?Math.max(0,Math.min(.25,config.som.volume)):.14;
  if(config.som?.oferecer===false){$('.sound-choice').hidden=true;$('.sound-control').hidden=true;await sound.enable(false);updateSoundButton();}
  const photos=(Array.isArray(config.fotos)?config.fotos:[]).filter(p=>typeof p==='string'&&/^assets\/[\w./-]+$/.test(p)&&!p.includes('..'));
  photos.forEach((src,index)=>{const figure=document.createElement('figure');const img=document.createElement('img');img.src=src;img.alt=`Uma memória do casal, fotografia ${index+1}`;img.loading='lazy';img.decoding='async';img.width=600;img.height=800;img.addEventListener('error',()=>figure.hidden=true);figure.append(img);$('#photos').append(figure);});
  $('#photo-placeholder').hidden=photos.length>0;
}
loadConfig();
function updateSoundButton(){ $('#sound').setAttribute('aria-pressed',String(sound.enabled));$('#sound').setAttribute('aria-label',sound.enabled?'Desativar efeitos sonoros':'Ativar efeitos sonoros');$('#sound').textContent=sound.enabled?'Som ligado ♪':'Som desligado ♪';$('#sound-choice').checked=sound.enabled;}
$('#sound').addEventListener('click',async()=>{await sound.enable(!sound.enabled);updateSoundButton();sound.play();});
$('#sound-choice').addEventListener('change',async e=>{await sound.enable(e.target.checked);updateSoundButton();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){sound.enable(false);updateSoundButton();}});
$('#garden').addEventListener('error',()=>$('#garden').hidden=true);
function petals(){if(reduced())return;$('#petals').replaceChildren();for(let i=0;i<10;i++){const petal=document.createElement('i');petal.style.setProperty('--x',`${8+i*9}%`);petal.style.setProperty('--delay',`${(i%4)*.12}s`);petal.style.setProperty('--turn',`${i*43}deg`);$('#petals').append(petal);}setTimeout(()=>$('#petals').replaceChildren(),2200);}
function showChapter(index,{focus=true,silent=false}={}){
  chapter=Math.max(0,Math.min(3,index));
  document.querySelectorAll('.chapter').forEach((page,i)=>{page.hidden=i!==chapter;page.classList.remove('turning');if(i===chapter&&!reduced()){void page.offsetWidth;page.classList.add('turning');}});
  document.querySelectorAll('[data-chapter]').forEach(button=>{if(Number(button.dataset.chapter)===chapter)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});
  $('#chapter-position').textContent=`0${chapter+1} / 04`;$('#previous').disabled=chapter===0;$('#next').disabled=chapter===3;
  $('#chapter-dots').innerHTML=[0,1,2,3].map(i=>`<i class="${i===chapter?'active':''}"></i>`).join('');
  if(!silent)sound.play();
  if(focus){const heading=$(`#chapter-${chapter} h2`);heading.tabIndex=-1;heading.focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});}
}
async function openLetter(skip=false){
  if(opening)return;opening=true;const current=++generation;
  if(skip){await sound.enable(false);updateSoundButton();}else if($('#sound-choice').checked){await sound.enable(true);updateSoundButton();}
  if(current!==generation)return;
  $('#seal').disabled=true;$('#opening-copy').textContent='Preparando a sua carta…';$('#envelope').classList.add('opening');if(!skip)sound.play('open');
  const image=$('#garden');const artReady=image.complete?Promise.resolve():new Promise(resolve=>{image.addEventListener('load',resolve,{once:true});image.addEventListener('error',resolve,{once:true});});
  await Promise.all([Promise.race([artReady,new Promise(resolve=>setTimeout(resolve,1200))]),new Promise(resolve=>setTimeout(resolve,skip||reduced()?0:1000))]);
  if(current!==generation)return;
  $('#welcome').hidden=true;$('#book').hidden=false;showChapter(skip?2:0,{silent:true});if(!skip)petals();opening=false;
}
$('#seal').addEventListener('click',()=>openLetter());$('#skip').addEventListener('click',()=>openLetter(true));
$('#replay').addEventListener('click',()=>{generation++;opening=false;$('#welcome').hidden=false;$('#book').hidden=true;$('#envelope').classList.remove('opening');$('#seal').disabled=false;$('#opening-copy').textContent='Toque no selo para descobrir.';$('#seal').focus();window.scrollTo({top:0,behavior:'instant'});});
document.querySelectorAll('[data-chapter]').forEach(button=>button.addEventListener('click',()=>showChapter(Number(button.dataset.chapter))));
document.querySelectorAll('[data-next]').forEach(button=>button.addEventListener('click',()=>showChapter(chapter+1)));
$('#previous').addEventListener('click',()=>showChapter(chapter-1));$('#next').addEventListener('click',()=>showChapter(chapter+1));
if(!invite){$('#rsvp').hidden=true;$('#allowance').textContent='Para responder, abra o link personalizado que os noivos enviaram para você.';}
else{
  $('#allowance').textContent=`${invite.name}, este convite contempla até ${invite.capacity} ${invite.capacity===1?'pessoa: você.':`pessoas, incluindo você.`}`;
  $('#people').innerHTML=Array.from({length:invite.capacity},(_,i)=>`<fieldset class="person"><legend>${i===0?esc(invite.name):`Acompanhante ${i}`}</legend>${i?`<label for="name-${i}">Nome completo <small>(se for comparecer)</small></label><input id="name-${i}" name="name-${i}" maxlength="100" autocomplete="off">`:'<p class="person-note">Titular do convite</p>'}<div class="status-options">${[['vai','Vou'],['nao','Não vou'],['pendente','Ainda não sei']].map(([v,t])=>`<label><input type="radio" name="status-${i}" value="${v}" ${v==='pendente'?'checked':''}><span>${t}</span></label>`).join('')}</div></fieldset>`).join('');
}
$('#rsvp').addEventListener('submit',e=>{
  e.preventDefault();if(!invite)return;const data=new FormData(e.target);
  try{const people=validatePeople(invite,Array.from({length:invite.capacity},(_,i)=>({name:i?data.get(`name-${i}`):invite.name,status:data.get(`status-${i}`)})));
    const couple=[config.casal?.noiva,config.casal?.noivo].filter(Boolean).join(' e ')||'os noivos';message=rsvpMessage(invite,people,couple,dateLabel(config.evento?.data)||'27/03/2027');
    $('#message-text').textContent=message;$('#message-preview').hidden=false;$('#form-feedback').textContent='Confira a mensagem abaixo antes de enviar.';$('#whatsapp').hidden=true;$('#destination-warning').hidden=true;
    try{$('#whatsapp').href=whatsappLink(config.whatsapp?.numero,message);$('#whatsapp').hidden=false;if(config.whatsapp?.modo==='teste')$('#form-feedback').textContent='Modo de teste: a mensagem será direcionada ao número de teste configurado.';}catch{$('#destination-warning').hidden=false;}
    sound.play('ready');$('#preview-title').tabIndex=-1;$('#preview-title').focus();
  }catch(error){$('#form-feedback').textContent=error.message;$('#message-preview').hidden=true;}
});
$('#whatsapp').addEventListener('click',()=>{$('#copy-feedback').textContent='WhatsApp solicitado. Envie a mensagem no aplicativo; os noivos registrarão sua resposta após recebê-la.';});
$('#copy-message').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(message);$('#copy-feedback').textContent='Mensagem copiada. Cole na conversa dos noivos e envie.';}catch{$('#copy-feedback').textContent='Não foi possível copiar automaticamente. Selecione o texto acima para copiar.';}});
