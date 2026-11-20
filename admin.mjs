import { validateRow, inviteLink, inviteLinkV2, adminTotals, parseBackup, csvCell, parseNomesAcompanhantes, isDemoBackup } from './domain.mjs?v=202611200440';
import * as A from './admin-acesso.mjs?v=202611200440';
const $=s=>document.querySelector(s), esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// `?demo=1` abre o painel sobre a lista de demonstração (namespace jb-demo-v2:*), sem tocar a lista real.
// Demo fica sem senha: só tem dados fictícios e nunca lê/escreve a lista real; a senha não protegeria nada de valor.
const DEMO=new URLSearchParams(location.search).get('demo')==='1';
const key=DEMO?'jb-demo-v2:lista':A.CHAVE_COFRE;let rows=[],candidate=null,candidateDemo=false,corrupt=false,vault=null,sessionKey=null,meta=A.metaVazia(),legacyText=null,lastActivity=Date.now(),hiddenAt=null;
let filtro='todos',abertoId=null;
if(DEMO){$('#demo-banner').hidden=false;document.title='DEMONSTRAÇÃO · '+document.title;}
const store={get:k=>{try{return localStorage.getItem(k)}catch{return null}},set:(k,v)=>localStorage.setItem(k,v),del:k=>{try{localStorage.removeItem(k)}catch{}}};
function setCorrupt(msg){corrupt=true;$('#storage-error').hidden=false;$('#storage-error').textContent=msg;$('#add-form button[type=submit]').disabled=true;$('#backup').disabled=true;$('#csv').disabled=true;}
function saveMeta(){try{store.set(A.CHAVE_META,JSON.stringify(meta));}catch{}}
async function persist(next){const checked=parseBackup(JSON.stringify({version:1,rows:next}));
  if(DEMO)localStorage.setItem(key,JSON.stringify({version:1,demo:true,rows:checked}));
  else{if(!sessionKey)throw Error('Painel bloqueado. Desbloqueie com a senha.');const novo=await A.gravarCofre(vault,sessionKey,checked);localStorage.setItem(key,JSON.stringify(novo));vault=novo;meta=A.registrarAlteracao(meta);saveMeta();}
  rows=checked;updateBackupUi();}
function fmtData(iso){try{return new Date(iso).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}catch{return iso}}
const plural=n=>n+' '+(n===1?'alteração':'alterações');
function updateBackupUi(){if(DEMO){$('#backup-banner').hidden=true;$('#backup-status').textContent='';return;}
  const n=meta.alteracoes;$('#backup-banner').hidden=n===0;$('#backup-banner-texto').textContent=n?plural(n)+' sem backup.':'';
  $('#backup-status').textContent=meta.ultimoBackup?'Último backup exportado neste navegador: '+fmtData(meta.ultimoBackup)+' · '+plural(n)+' desde então.':'Nenhum backup exportado ainda neste navegador · '+plural(n)+'.';}
const base=new URL('index.html',location.href).href,baseV2=new URL('v2/index.html',location.href).href;
function linkV2(row){const href=inviteLinkV2(baseV2,row);if(!DEMO)return href;const u=new URL(href);u.searchParams.set('demo','1');return u.href;}
// Rascunho da mensagem de envio (texto a revisar com o casal). Abre o WhatsApp sem destinatário: quem envia é a pessoa.
function mensagemEnvio(row){const primeiro=/^fam[ií]lia\s/i.test(row.name)?row.name:row.name.split(' ')[0];return `Olá, ${primeiro}! Com muita alegria, Jezriel e Beatriz convidam ${row.capacity>1?"vocês":"você"} para o casamento. ${row.capacity>1?"O convite de vocês":"Seu convite"} está aqui:\n${linkV2(row)}`;}

/* ---------- toast ---------- */
let toastTimer=null;
function toast(text){const el=$('#action-feedback');el.textContent=text;el.classList.add('is-on');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('is-on'),4200);}

/* ---------- folhas (bottom sheets) ---------- */
let sheetAberta=null,sheetOrigem=null,sheetComHistorico=false;
function abrirSheet(id,origem){if(sheetAberta&&sheetAberta!==id)fecharSheet({semHistorico:true,semFoco:true});sheetAberta=id;sheetOrigem=origem||document.activeElement;$('#sheet-bg').hidden=false;$(id).hidden=false;document.body.style.overflow='hidden';
  if(!sheetComHistorico){try{history.pushState({jbSheet:1},'');sheetComHistorico=true;}catch{}}
  const foco=$(id).querySelector('[data-autofocus]')||$(id).querySelector('[data-close]');foco?.focus({preventScroll:true});}
function fecharSheet({semHistorico=false,semFoco=false}={}){if(!sheetAberta)return;$(sheetAberta).hidden=true;$('#sheet-bg').hidden=true;document.body.style.overflow='';if(sheetAberta==='#sheet-convite')abertoId=null;sheetAberta=null;
  if(sheetComHistorico&&!semHistorico){sheetComHistorico=false;try{history.back();}catch{}}
  if(!semFoco&&sheetOrigem?.isConnected)sheetOrigem.focus({preventScroll:true});}
window.addEventListener('popstate',()=>{sheetComHistorico=false;if(sheetAberta)fecharSheet({semHistorico:true});});
$('#sheet-bg').addEventListener('click',()=>fecharSheet());
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&sheetAberta)fecharSheet();});
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>fecharSheet()));

/* ---------- lista ---------- */
const semAcento=t=>t.normalize('NFD').replace(/[̀-ͯ]/g,'').toLocaleLowerCase('pt-BR');
const FILTROS=[['todos','Todos',()=>true],['enviar','A enviar',r=>!r.enviado&&r.status==='pendente'],['pendente','Sem resposta',r=>r.status==='pendente'],['confirmado','Vão',r=>r.status==='confirmado'],['recusado','Não vão',r=>r.status==='recusado']];
function situacao(row){if(row.status==='confirmado')return['ok',`Vão ${row.confirmed} de ${row.capacity}`];if(row.status==='recusado')return['no','Não vão'];return row.enviado?['wait','Aguardando resposta']:['todo','Link não enviado'];}
const vagasTxt=n=>n+(n===1?' vaga':' vagas');
function draw(){
  const total=adminTotals(rows),pct=total.capacity?Math.round(total.confirmed/total.capacity*100):0,aEnviar=rows.filter(FILTROS[1][2]).length;
  $('#stats').innerHTML=`<div class="gl-summary__main"><strong>${total.confirmed}</strong> de ${total.capacity} pessoas confirmadas</div><div class="gl-bar" role="progressbar" aria-label="Pessoas confirmadas" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div><div class="gl-kpis"><div><strong>${total.invites}</strong><span>convites</span></div><div><strong>${total.capacity}</strong><span>vagas</span></div><div><strong>${aEnviar}</strong><span>a enviar</span></div></div>`;
  $('#filters').innerHTML=FILTROS.map(([id,rot,f])=>`<button type="button" data-filter="${id}" aria-pressed="${filtro===id}">${rot}<b>${rows.filter(f).length}</b></button>`).join('');
  const query=semAcento($('#search').value.trim()),f=FILTROS.find(x=>x[0]===filtro)[2];
  let lista=rows.map((r,i)=>({r,i})).filter(({r})=>semAcento(r.name).includes(query)&&f(r));
  if($('#sort').value==='az')lista.sort((a,b)=>a.r.name.localeCompare(b.r.name,'pt-BR',{sensitivity:'base'}));else lista.reverse();
  $('#list-info').textContent=`${lista.length} de ${rows.length} convites`;
  $('#list').innerHTML=lista.length?lista.map(({r})=>{const [tipo,txt]=situacao(r);return `<li><button type="button" class="gl-row" data-id="${esc(r.id)}"><span class="gl-dot gl-dot--${tipo}" aria-hidden="true"></span><span class="gl-row__main"><strong>${esc(r.name)}</strong><small>${vagasTxt(r.capacity)} · ${txt}</small></span><span class="gl-row__end${tipo==='ok'?' gl-row__end--ok':''}" aria-hidden="true">${tipo==='ok'?r.confirmed+'/'+r.capacity:'›'}</span></button></li>`;}).join(''):`<li class="gl-empty"><h3>${rows.length?'Ninguém neste filtro.':'A lista começa com alguém especial.'}</h3><p>${rows.length?'Tente outro nome ou filtro.':'Toque em “Novo convite” para cadastrar o primeiro nome.'}</p></li>`;
  if(abertoId)desenharConvite();
}
$('#filters').addEventListener('click',e=>{const b=e.target.closest('[data-filter]');if(!b)return;filtro=b.dataset.filter;draw();});
$('#list').addEventListener('click',e=>{const b=e.target.closest('[data-id]');if(!b)return;abertoId=b.dataset.id;desenharConvite();abrirSheet('#sheet-convite',b);});
$('#search').addEventListener('input',draw);$('#sort').addEventListener('change',draw);

/* ---------- folha de um convite ---------- */
function desenharConvite(){
  const row=rows.find(r=>r.id===abertoId);if(!row){fecharSheet();return;}
  $('#convite-titulo').textContent=row.name;$('#convite-sub').textContent=`${vagasTxt(row.capacity)} · código ${row.id.slice(0,8)}`;
  const st=row.status,nomes=row.acompanhantes||[];
  $('#convite-body').innerHTML=`
  <h3>Resposta</h3>
  <div class="gl-seg" role="group" aria-label="Resposta do convidado">${[['pendente','Sem resposta'],['confirmado','Vão'],['recusado','Não vão']].map(([v,t])=>`<button type="button" data-status="${v}" aria-pressed="${st===v}">${t}</button>`).join('')}</div>
  ${st==='confirmado'?`<div class="gl-count"><span id="conf-label">Quantas pessoas vão?</span><div class="gl-stepper"><button type="button" data-conf="-1" aria-label="Menos uma pessoa" ${row.confirmed<=1?'disabled':''}>−</button><input data-confirmed type="number" min="1" max="${row.capacity}" value="${row.confirmed}" inputmode="numeric" aria-labelledby="conf-label"><button type="button" data-conf="1" aria-label="Mais uma pessoa" ${row.confirmed>=row.capacity?'disabled':''}>+</button></div></div>`:''}
  <h3>Link do convite</h3>
  <div class="gl-actions">
    <a class="gl-btn gl-btn--wa" data-whats href="${esc('https://wa.me/?text='+encodeURIComponent(mensagemEnvio(row)))}" target="_blank" rel="noopener noreferrer">Enviar pelo WhatsApp</a>
    <div id="ask-enviado" class="gl-ask" hidden>Enviou a mensagem? <button type="button" data-marcar-enviado>Marcar como enviado</button></div>
    <button type="button" class="gl-btn" data-copy-v2>Copiar link</button>
    <label class="gl-check"><input type="checkbox" data-enviado ${row.enviado?'checked':''}> Link já enviado</label>
    <a class="gl-btn gl-btn--ghost" data-open-v2 href="${esc(linkV2(row))}" target="_blank" rel="noopener">Conferir o convite ↗</a>
  </div>
  <p class="admin-row-message gl-msg" role="status"></p>
  ${row.capacity>1?`<details class="gl-more"${nomes.length?' open':''}><summary>Acompanhantes · ${nomes.filter(Boolean).length} de ${row.capacity-1} com nome</summary><label>Um nome por linha, até ${row.capacity-1}. Vazio: o convidado preenche.<textarea data-names rows="3" maxlength="4000">${esc(nomes.join('\n'))}</textarea></label><button type="button" class="gl-btn" data-save-names>Salvar nomes</button></details>`:''}
  <details class="gl-more"><summary>Editar ou excluir</summary>
    <label>Nome no convite<input data-edit-name maxlength="100" value="${esc(row.name)}" autocomplete="off" autocapitalize="words"></label>
    <div class="gl-field"><span id="edit-cap-label">Vagas, contando o titular</span><div class="gl-stepper"><button type="button" data-edit-step="-1" aria-label="Menos uma vaga">−</button><input data-edit-cap type="number" min="1" max="20" value="${row.capacity}" inputmode="numeric" aria-labelledby="edit-cap-label"><button type="button" data-edit-step="1" aria-label="Mais uma vaga">+</button></div></div>
    <p class="gl-hint">Mudar nome ou vagas gera um link novo. Se o antigo já foi enviado, envie o novo.</p>
    <div class="gl-actions"><button type="button" class="gl-btn" data-save-edit>Salvar alterações</button><button type="button" class="gl-btn gl-btn--danger" data-delete>Excluir convite</button></div>
    <button type="button" class="gl-btn gl-btn--ghost" data-copy>Copiar link da versão 1 (antiga)</button>
  </details>`;
}
const box=()=>$('#convite-body'),msg=t=>{const m=box().querySelector('.admin-row-message');if(m)m.textContent=t;};
async function salvar(row,mudanca,okText){try{const updated=validateRow({...row,...mudanca});await persist(rows.map(r=>r.id===row.id?updated:r));draw();if(okText)toast(okText);return true;}catch(error){msg(error.message);return false;}}
async function copiar(link,okText){try{await navigator.clipboard.writeText(link);msg(okText);}catch{msg('Copie o link abaixo:');const input=document.createElement('input');input.value=link;input.readOnly=true;input.setAttribute('aria-label','Link do convite para copiar');box().querySelector('.admin-row-message').append(input);input.focus();input.select();}}
box().addEventListener('click',async e=>{
  const row=rows.find(r=>r.id===abertoId);if(!row)return;const t=e.target.closest('button,a');if(!t)return;
  if(t.dataset.status){const s=t.dataset.status;if(s===row.status)return;const confirmed=s==='confirmado'?row.capacity:0;await salvar(row,{status:s,confirmed},{pendente:`${row.name}: sem resposta.`,confirmado:`${row.name}: vão ${confirmed} de ${row.capacity}. Ajuste a quantidade se preciso.`,recusado:`${row.name}: não vão.`}[s]);return;}
  if(t.dataset.conf){const n=Math.min(row.capacity,Math.max(1,row.confirmed+Number(t.dataset.conf)));if(n!==row.confirmed)await salvar(row,{confirmed:n},`${row.name}: vão ${n} de ${row.capacity}.`);return;}
  if('whats' in t.dataset){box().querySelector('#ask-enviado').hidden=!!row.enviado;return;}
  if('marcarEnviado' in t.dataset){await salvar(row,{enviado:true},`${row.name}: link marcado como enviado.`);return;}
  if('copyV2' in t.dataset){try{await copiar(linkV2(row),'Link copiado. Cole na conversa do convidado.');}catch(error){msg(error.message);}return;}
  if('copy' in t.dataset){await copiar(inviteLink(base,row),'Link da versão 1 copiado.');return;}
  if('saveNames' in t.dataset){try{const names=parseNomesAcompanhantes(box().querySelector('[data-names]').value);const {acompanhantes:_a,...sem}=row;const updated=validateRow(names.length?{...sem,acompanhantes:names}:sem);await persist(rows.map(r=>r.id===row.id?updated:r));draw();toast(`Nomes de ${row.name} salvos (${names.filter(Boolean).length}). O link já usa os nomes novos.`);}catch(error){msg(error.message);}return;}
  if(t.dataset.editStep){const inp=box().querySelector('[data-edit-cap]');inp.value=Math.min(20,Math.max(1,(Number(inp.value)||1)+Number(t.dataset.editStep)));return;}
  if('saveEdit' in t.dataset){const name=box().querySelector('[data-edit-name]').value,capacity=Number(box().querySelector('[data-edit-cap]').value);const confirmed=row.status==='confirmado'?Math.min(row.confirmed,capacity):0;await salvar(row,{name,capacity,confirmed},'Convite atualizado. Se o link antigo já foi enviado, envie o novo.');return;}
  if('delete' in t.dataset){if(!t.dataset.armed){t.dataset.armed='1';t.textContent='Toque de novo para excluir';setTimeout(()=>{if(t.isConnected){delete t.dataset.armed;t.textContent='Excluir convite';}},4000);return;}
    try{await persist(rows.filter(r=>r.id!==row.id));fecharSheet();draw();toast(`Convite de ${row.name} excluído. Um backup anterior ainda o contém.`);}catch(error){msg(error.message);}return;}
});
box().addEventListener('change',async e=>{const row=rows.find(r=>r.id===abertoId);if(!row)return;
  if(e.target.matches('[data-enviado]')){await salvar(row,{enviado:e.target.checked},e.target.checked?`${row.name}: link marcado como enviado.`:`${row.name}: link marcado como não enviado.`);}
  if(e.target.matches('[data-confirmed]')){const n=Math.round(Number(e.target.value));if(!(n>=1&&n<=row.capacity)){msg(`Use de 1 a ${row.capacity}.`);e.target.value=row.confirmed;return;}await salvar(row,{confirmed:n},`${row.name}: vão ${n} de ${row.capacity}.`);}
});

/* ---------- novo convite ---------- */
$('#abrir-novo').addEventListener('click',e=>{$('#add-feedback').textContent='';abrirSheet('#sheet-novo',e.currentTarget);$('#guest-name').focus();});
$('#add-form').querySelectorAll('[data-step]').forEach(b=>b.addEventListener('click',()=>{const inp=$('#add-form [name=capacity]');inp.value=Math.min(20,Math.max(1,(Number(inp.value)||1)+Number(b.dataset.step)));}));
$('#add-form').addEventListener('submit',async event=>{event.preventDefault();if(corrupt)return;const data=new FormData(event.target);try{const names=parseNomesAcompanhantes(data.get('acompanhantes'));const row=validateRow({id:crypto.randomUUID(),name:data.get('name'),capacity:Number(data.get('capacity')),...(names.length?{acompanhantes:names}:{}),status:'pendente',confirmed:0});await persist([...rows,row]);event.target.reset();event.target.querySelector('details').open=false;draw();$('#add-feedback').textContent=`Convite de ${row.name} criado (${vagasTxt(row.capacity)}). Digite o próximo nome ou feche.`;$('#guest-name').focus();}catch(error){$('#add-feedback').textContent=error.message;}});

/* ---------- menu: backup, CSV, restauração ---------- */
$('#abrir-menu').addEventListener('click',e=>{updateBackupUi();abrirSheet('#sheet-menu',e.currentTarget);});
function download(content,name,type){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);}
function exportar(){if(corrupt||(!DEMO&&!sessionKey)){$('#backup-feedback').textContent='A lista não foi carregada. Preserve o armazenamento original e restaure um backup válido.';return;}download(A.montarBackup(rows,{demo:DEMO}),(DEMO?'DEMO-':'')+'convites-backup-'+new Date().toISOString().slice(0,10)+'.json','application/json');if(!DEMO){meta=A.registrarBackup(meta);saveMeta();}updateBackupUi();$('#backup-feedback').textContent='Backup preparado e download iniciado. Confira se o arquivo foi salvo e guarde-o em local privado: ele não é cifrado.';}
$('#backup').addEventListener('click',exportar);$('#backup-banner-btn').addEventListener('click',()=>{exportar();toast('Backup baixado. Guarde o arquivo em local privado.');});
$('#csv').addEventListener('click',()=>{download('﻿'+[['Código','Titular','Vagas totais','Status','Pessoas confirmadas','Link enviado','Acompanhantes (nomes)'],...rows.map(r=>[r.id,r.name,r.capacity,r.status,r.confirmed,r.enviado?'sim':'não',(r.acompanhantes||[]).join(' | ')])].map(row=>row.map(csvCell).join(';')).join('\r\n'),'lista-convidados.csv','text/csv;charset=utf-8');});
$('#import').addEventListener('change',async event=>{candidate=null;$('#import-preview').hidden=true;const file=event.target.files[0];try{if(!file)return;if(file.size>2_000_000)throw Error('Backup muito grande.');const text=await file.text();candidate=parseBackup(text);candidateDemo=isDemoBackup(text);$('#demo-import-box').hidden=candidateDemo===DEMO;$('#demo-import-ok').checked=false;const total=adminTotals(candidate);$('#import-description').textContent=`O backup contém ${candidate.length} convites, ${total.capacity} vagas e ${total.confirmed} pessoas confirmadas. A restauração substituirá a lista atual de ${rows.length} convites. Exporte a lista atual antes de prosseguir.${candidateDemo&&!DEMO?' ATENÇÃO: este backup é de DEMONSTRAÇÃO (dados fictícios).':''}${!candidateDemo&&DEMO?' ATENÇÃO: este backup é da lista REAL e você está no painel de demonstração.':''}`;$('#import-preview').hidden=false;}catch(error){$('#backup-feedback').textContent=error.message;}event.target.value='';});
$('#confirm-import').addEventListener('click',async()=>{if(!candidate)return;if(candidateDemo!==DEMO&&!$('#demo-import-ok').checked){$('#backup-feedback').textContent=candidateDemo?'Este backup é de demonstração. Marque a confirmação explícita para colocá-lo na lista real.':'Este backup é da lista real. Marque a confirmação explícita para colocá-lo na demonstração.';return;}try{await persist(candidate);if(!DEMO){meta={...meta,alteracoes:0};saveMeta();updateBackupUi();}candidate=null;corrupt=false;$('#storage-error').hidden=true;$('#add-form button[type=submit]').disabled=false;$('#backup').disabled=false;$('#csv').disabled=false;$('#import-preview').hidden=true;draw();$('#backup-feedback').textContent='Backup restaurado neste navegador.';}catch(error){$('#backup-feedback').textContent=`Não foi possível restaurar: ${error.message}`;}});
$('#cancel-import').addEventListener('click',()=>{candidate=null;$('#import-preview').hidden=true;});

// ---- Proteção local por senha ----
const show=(id,on)=>{$(id).hidden=!on;};
function showPanel(){show('#gate',false);show('#intro',false);show('#painel',true);$('#prot-bar').hidden=DEMO;$('#bloquear').hidden=DEMO;draw();updateBackupUi();}
function showGate(which){fecharSheet({semFoco:true});show('#painel',false);show('#intro',true);show('#gate',true);show('#form-criar',which==='criar');show('#form-entrar',which==='entrar');}
function lock(msg){sessionKey=null;rows=[];candidate=null;$('#list').innerHTML='';$('#stats').innerHTML='';$('#list-info').textContent='';$('#add-form').reset();$('#search').value='';filtro='todos';abertoId=null;$('#convite-body').innerHTML='';['#action-feedback','#add-feedback','#backup-feedback'].forEach(id=>$(id).textContent='');$('#import-preview').hidden=true;show('#form-troca',false);$('#form-troca').reset();
  showGate('entrar');$('#senha-entrar').value='';$('#entrar-feedback').textContent=msg||'';$('#senha-entrar').focus();}
function readTries(){try{return JSON.parse(store.get(A.CHAVE_TENTATIVAS))||{n:0,ate:0}}catch{return{n:0,ate:0}}}
function boot(){
  const raw=store.get(A.CHAVE_COFRE);
  if(raw){try{vault=A.lerCofre(raw);}catch(error){setCorrupt(error.message+' Nada foi sobrescrito. Use "Esqueci a senha" para recomeçar e restaure um backup.');showGate('entrar');$('#form-entrar button').disabled=true;$('#esqueci').open=true;return;}
    meta=A.lerMeta(store.get(A.CHAVE_META));showGate('entrar');return;}
  legacyText=store.get(A.CHAVE_LEGADA);
  if(legacyText){try{parseBackup(legacyText);show('#migracao-box',true);}catch{setCorrupt('A lista antiga deste navegador não pôde ser lida. Ela não foi alterada nem apagada. Restaure um backup válido.');legacyText=null;}}
  meta=A.lerMeta(store.get(A.CHAVE_META));
  if(corrupt){showGate('entrar');$('#form-entrar button').disabled=true;return;}
  showGate('criar');
}
$('#migracao-backup').addEventListener('click',()=>{try{const old=parseBackup(legacyText);download(A.montarBackup(old),'convites-backup-antes-da-senha-'+new Date().toISOString().slice(0,10)+'.json','application/json');$('#criar-feedback').textContent='Backup baixado. Guarde-o em local privado e confira o arquivo antes de criar a senha.';}catch(error){$('#criar-feedback').textContent=error.message;}});
$('#form-criar').addEventListener('submit',async event=>{event.preventDefault();const fb=$('#criar-feedback');try{A.validarSenhaNova($('#senha-nova').value,$('#senha-conf').value);fb.textContent='Criando proteção…';
  const senha=$('#senha-nova').value;const r=legacyText?await A.migrarLegado(legacyText,senha):{...(await A.criarCofre(senha,[])),linhas:[]};
  const conferido=await A.abrirCofre(r.cofre,senha);if(JSON.stringify(conferido.linhas)!==JSON.stringify(r.linhas))throw Error('A conferência da migração falhou.');
  localStorage.setItem(A.CHAVE_COFRE,JSON.stringify(r.cofre));
  if(legacyText){store.del(A.CHAVE_LEGADA);legacyText=null;show('#migracao-box',false);}
  vault=r.cofre;sessionKey=conferido.chave;rows=conferido.linhas;$('#form-criar').reset();fb.textContent='';lastActivity=Date.now();showPanel();toast('Senha criada. Faça um backup agora para ter como recuperar a lista.');
}catch(error){fb.textContent=error.message;}});
$('#form-entrar').addEventListener('submit',async event=>{event.preventDefault();const fb=$('#entrar-feedback');const t=readTries();const agora=Date.now();
  if(t.ate>agora){fb.textContent='Aguarde '+Math.ceil((t.ate-agora)/1000)+' s antes de tentar de novo.';return;}
  try{fb.textContent='Verificando…';const r=await A.abrirCofre(vault,$('#senha-entrar').value);store.del(A.CHAVE_TENTATIVAS);sessionKey=r.chave;rows=r.linhas;$('#senha-entrar').value='';fb.textContent='';lastActivity=Date.now();showPanel();}
  catch(error){const n=t.n+1;const espera=A.atrasoTentativas(n);try{store.set(A.CHAVE_TENTATIVAS,JSON.stringify({n,ate:Date.now()+espera}));}catch{}fb.textContent=error.message+(espera?' Aguarde '+Math.ceil(espera/1000)+' s para tentar de novo.':'');$('#senha-entrar').value='';}});
$('#bloquear').addEventListener('click',()=>lock('Painel bloqueado.'));
$('#abrir-troca').addEventListener('click',()=>{show('#form-troca',true);$('#troca-atual').focus();});
$('#troca-cancelar').addEventListener('click',()=>{show('#form-troca',false);$('#form-troca').reset();$('#troca-feedback').textContent='';});
$('#form-troca').addEventListener('submit',async event=>{event.preventDefault();const fb=$('#troca-feedback');try{fb.textContent='Trocando…';const r=await A.trocarSenha(vault,$('#troca-atual').value,$('#troca-nova').value,$('#troca-conf').value);localStorage.setItem(A.CHAVE_COFRE,JSON.stringify(r.cofre));vault=r.cofre;sessionKey=r.chave;$('#form-troca').reset();show('#form-troca',false);fb.textContent='';fecharSheet();toast('Senha trocada. Use a nova senha no próximo acesso.');}catch(error){fb.textContent=error.message;}});
$('#apagar-painel').addEventListener('click',()=>{const fb=$('#apagar-feedback');if($('#apagar-confirma').value.trim()!=='APAGAR'){fb.textContent='Digite APAGAR para confirmar.';return;}
  [A.CHAVE_COFRE,A.CHAVE_META,A.CHAVE_TENTATIVAS].forEach(store.del);vault=null;sessionKey=null;rows=[];meta=A.metaVazia();corrupt=false;$('#storage-error').hidden=true;$('#add-form button[type=submit]').disabled=false;$('#backup').disabled=false;$('#csv').disabled=false;$('#apagar-confirma').value='';fb.textContent='';$('#esqueci').open=false;$('#form-entrar button').disabled=false;
  boot();$('#criar-feedback').textContent='Dados do painel apagados. Crie uma senha nova e depois use "Restaurar backup JSON" para recuperar a lista.';});
// Bloqueio automático: inatividade e aba oculta por tempo prolongado.
['pointerdown','keydown','input','touchstart','scroll'].forEach(ev=>document.addEventListener(ev,()=>{lastActivity=Date.now();},{passive:true,capture:true}));
document.addEventListener('visibilitychange',()=>{if(document.hidden)hiddenAt=Date.now();else{if(sessionKey&&hiddenAt&&Date.now()-hiddenAt>A.OCULTA_MS)lock('Bloqueado: a aba ficou oculta por vários minutos.');hiddenAt=null;lastActivity=Date.now();}});
setInterval(()=>{if(!sessionKey)return;const agora=Date.now();if(agora-lastActivity>A.INATIVIDADE_MS)lock('Bloqueado por inatividade.');else if(document.hidden&&hiddenAt&&agora-hiddenAt>A.OCULTA_MS)lock('Bloqueado: a aba ficou oculta por vários minutos.');},5000);
if(DEMO){try{const text=localStorage.getItem(key);if(text)rows=parseBackup(text);}catch{setCorrupt('Não foi possível ler a lista de demonstração deste navegador. Seus dados não foram sobrescritos. Restaure um backup válido antes de continuar.');}showPanel();}else boot();
