/* Garmin Coach PWA - logica do app.
   Dados e memoria: Supabase (com login, privado). Chave da IA: so neste aparelho. */
const CFG = window.CFG;
const sb = supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
const $ = (id) => document.getElementById(id);
const KEYLS = "coach_api_key";
const KEYSINCE = "conv_since";
const sinceVal=()=>localStorage.getItem(KEYSINCE)||"";

const SYSTEM = `Voce e um treinador pessoal experiente em ciclismo e treino de forca, com base cientifica (fisiologia, periodizacao, treino polarizado, forca para ciclistas, recuperacao, sono, gestao de carga). Acompanha UM atleta de forma proxima e continua.
Jeito: portugues do Brasil, caloroso, direto e motivador; especifico e acionavel; honesto; usa os DADOS fornecidos; LEMBRA do historico e dos seus conselhos anteriores fazendo continuidade; prioriza recuperacao/sono/prevencao de lesao.
Seguranca: nao e medico (diante de dor/sintomas, oriente buscar profissional); nunca recomende doping ou praticas de risco; se faltar dado, diga o que observar sem inventar.
Comente explicitamente o SLEEP SCORE, o BODY BATTERY (pico do dia) e a HRV da semana como marcadores de recuperacao. Faca observacoes INDIVIDUAIS sobre as atividades mais relevantes da semana (cite a atividade pelo nome e o que achou) e COMPARE sessoes da mesma modalidade entre si e ao longo das semanas para mostrar evolucao. Ao comentar uma atividade, refira-se a ela pela DATA (ex.: 'no pedal de 05/06...'). Compare SEMPRE apenas semanas COMPLETAS; NUNCA tire conclusoes da semana em curso (parcial) -- ela distorce volume e carga. Sempre acompanhe a EVOLUCAO DO PERFIL: cite FC de repouso, VO2max, FTP e FC max atuais e compare com a vez anterior (ex.: FC repouso caiu de 57 para 54 = melhora), usando os indicadores semana a semana.\nNa avaliacao semanal use secoes curtas: Como foi a semana / Evolucao do perfil / O que evoluiu / Pontos de atencao / Plano para a proxima semana / Um empurraozinho.`;

const UID_FIXO="11dd4f4a-634a-48bf-a5a7-c12220c3b22d";
let UID = UID_FIXO, ANALISE = null, SNAP_AT = null;

function _bucketsJS(gran){
  const kf=keyFnG(gran), m=new Map();
  const E=k=>{ if(!m.has(k)) m.set(k,{k,carga:0,sono:[],sscore:[],stress:[],fcrep:[],bba:[],bbb:[],hrv:[],cic_h:0,for_h:0,cic_n:0,for_n:0,km:0,vo2:null}); return m.get(k); };
  for(const r of (ANALISE.daily||[])){const b=E(kf(r.d)); b.carga+=r.carga||0;
    if(r.sono!=null)b.sono.push(r.sono); if(r.sono_score!=null)b.sscore.push(r.sono_score); if(r.stress!=null)b.stress.push(r.stress); if(r.fcrep!=null)b.fcrep.push(r.fcrep);
    if(r.bb_alta!=null)b.bba.push(r.bb_alta); if(r.bb_baixa!=null)b.bbb.push(r.bb_baixa); if(r.hrv!=null)b.hrv.push(r.hrv);}
  for(const x of (ANALISE.ativs||[])){const b=E(kf(x.d));
    if(x.cat==="ciclismo"){b.cic_h+=x.h;b.cic_n++;b.km+=x.km||0;} else if(x.cat==="forca"){b.for_h+=x.h;b.for_n++;}}
  for(const v of (ANALISE.vo2_xy||[])){const k=kf(v.d); if(m.has(k))m.get(k).vo2=v.v;}
  return [...m.keys()].sort().map(k=>m.get(k));
}
const avgN=arr=>arr.length?Math.round(arr.reduce((x,y)=>x+y,0)/arr.length*10)/10:null;

function digest(a){
  if(!a) return "Sem dados ainda.";
  const p=a.perfil||{},r=a.resumo||{},sd=a.saude||{},L=[];
  L.push(`PERFIL: idade ${p.idade}, sexo ${p.sexo}, FC max ${p.fc_max}, FC repouso ${p.fc_repouso}, FTP ${p.ftp||"sem medidor de potencia"}`);
  L.push(`JANELA: ${a.dias} dias ate ${a.gerado_em} | ${r.n_atividades} atividades (${r.n_ciclismo} pedais, ${r.n_forca} forca) | ${r.horas_total}h | ACWR atual ${r.acwr_atual}`);
  L.push(`SAUDE (media 30d): sono ${sd.media_sono_30d}h, stress ${sd.media_stress_30d}, passos ${sd.media_passos_30d}, cal ativas ${sd.media_cal_ativas_30d}`);
  const z=a.zonas_fc||{}; const tot=Object.values(z).reduce((x,y)=>x+y,0)||1;
  if(Object.keys(z).length) L.push("TEMPO POR ZONA DE FC: "+Object.entries(z).map(([k,v])=>`${k} ${Math.round(100*v/tot)}%`).join(", "));
  // semana a semana (ultimas 12)
  try{
    const hojeWk=wkKeyG(a.gerado_em||new Date().toISOString().slice(0,10));
    const sem=_bucketsJS("sem").filter(b=>b.k!==hojeWk).slice(-12);
    L.push("SEMANA A SEMANA (apenas semanas COMPLETAS; a semana em curso foi omitida):");
    sem.forEach(b=>L.push(`  ${b.k}: carga ${Math.round(b.carga)}, pedal ${b.cic_h.toFixed(1)}h(${b.cic_n}), forca ${b.for_n}x, km ${Math.round(b.km)}, sono ${avgN(b.sono)??"-"}h(score ${avgN(b.sscore)??"-"}), stress ${avgN(b.stress)??"-"}, FCrep ${avgN(b.fcrep)??"-"}, bodyBattery pico-medio ${avgN(b.bba)??"-"} (vale ${avgN(b.bbb)??"-"}), HRV ${avgN(b.hrv)??"-"}, VO2 ${b.vo2??"-"}`));
  }catch(e){}
  // atividades recentes detalhadas (ultimas 15)
  const ats=(a.ativs||[]).slice(-20);
  if(ats.length){
    L.push("ATIVIDADES RECENTES (mais novas por ultimo):");
    ats.forEach(x=>{
      const partes=[`${x.d} "${x.nome||x.tipo||x.cat}" [${x.cat}]`, `${(x.h*60).toFixed(0)}min`];
      if(x.km) partes.push(`${x.km}km`);
      if(x.hr) partes.push(`FCmed ${x.hr}${x.hrmax?("/max "+x.hrmax):""}`);
      if(x.pot) partes.push(`pot ${x.pot}W${x.np?("/NP "+x.np):""}`);
      if(x.cad) partes.push(`cad ${x.cad}`);
      if(x.te) partes.push(`TE ${x.te}`);
      if(x.carga) partes.push(`carga ${x.carga}`);
      if(x.cal) partes.push(`${x.cal}kcal`);
      L.push("  "+partes.join(", "));
    });
  }
  (a.plano||[]).slice(0,8).forEach(it=>L.push(`SINAL [${it.nivel}] ${it.titulo}: ${it.texto}`));
  return L.join("\n");
}

async function callClaude(system, messages, maxTokens){
  const key = localStorage.getItem(KEYLS);
  if(!key) throw new Error("Configure sua chave da IA em Ajustes.");
  const res = await fetch("https://api.anthropic.com/v1/messages",{
    method:"POST",
    headers:{"x-api-key":key,"anthropic-version":"2023-06-01","content-type":"application/json","anthropic-dangerous-direct-browser-access":"true"},
    body:JSON.stringify({model:CFG.MODEL||"claude-sonnet-4-6",max_tokens:maxTokens||1200,system,messages})
  });
  if(!res.ok) throw new Error("IA: "+res.status+" "+(await res.text()).slice(0,200));
  const j=await res.json();
  return (j.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("\n").trim();
}

async function getHistorico(){ const {data}=await sb.from("coach_history").select("criado_em,texto").eq("user_id",UID).order("criado_em",{ascending:true}).limit(8); return data||[]; }
function contexto(hist){ const h=(hist||[]).map(x=>`--- ${(x.criado_em||"").slice(0,10)} ---\n${x.texto}`).join("\n")||"Sem aconselhamentos anteriores."; return `${SYSTEM}\n\n=== DADOS ATUAIS ===\n${digest(ANALISE)}\n\n=== ACONSELHAMENTOS ANTERIORES ===\n${h}`; }

async function gerarAvaliacao(){
  const hist=await getHistorico();
  const texto=await callClaude(contexto(hist),[{role:"user",content:"Considere apenas semanas COMPLETAS (ignore a semana em curso). Comente o sleep score e o body battery da ultima semana completa, e comente individualmente as atividades mais relevantes dela. Faca a AVALIACAO seguindo as secoes, incluindo a secao Evolucao do perfil com FC de repouso, VO2max, FTP e FC max atuais e como mudaram desde a ultima avaliacao. De continuidade aos seus conselhos anteriores (verificando o que foi seguido)."}],1600);
  await sb.from("coach_history").insert({user_id:UID,resumo:Object.assign({},ANALISE?.resumo||{},{perfil:ANALISE?.perfil||{}}),texto});
  return texto;
}

/* ---------- periodos ---------- */
let GRANP="mes", OFFP=0;
function wkKeyG(d){const t=new Date(d+"T00:00:00");const o=(t.getDay()+6)%7;t.setDate(t.getDate()-o);return t.toISOString().slice(0,10);}
function keyFnG(g){
  if(g==="dia")return d=>d;
  if(g==="sem")return wkKeyG;
  if(g==="mes")return d=>d.slice(0,7);
  if(g==="tri")return d=>d.slice(0,4)+"-T"+(Math.floor((+d.slice(5,7)-1)/3)+1);
  if(g==="ano")return d=>d.slice(0,4);
  return d=>d.slice(0,7); // tudo = mes a mes
}
const MESN=["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
function rotuloG(k,g){
  if(g==="dia"){const p=k.split("-");return p[2]+"/"+p[1];}
  if(g==="sem"){const p=k.split("-");return "sem "+p[2]+"/"+p[1];}
  if(g==="mes"){const p=k.split("-");return MESN[(+p[1])-1]+"/"+p[0].slice(2);}
  if(g==="tri"){const p=k.split("-T");return p[1]+"o tri/"+p[0].slice(2);}
  if(g==="ano")return k;
  const p=k.split("-");return MESN[(+p[1])-1]+"/"+p[0].slice(2); // tudo = mensal
}

/* ---------- render painel ---------- */
let charts=[];
function destroyCharts(){charts.forEach(c=>c.destroy());charts=[];}
function renderPainel(){
  if(!ANALISE){ $("painelVazio").textContent="Ainda nao recebi seus dados. Rode o app no PC (rodar.bat) para enviar."; return; }
  $("painelVazio").textContent="";
  const r=ANALISE.resumo||{}, sd=ANALISE.saude||{};
  const kp=[["Atividades",r.n_atividades],["Pedais",r.n_ciclismo],["Forca",r.n_forca],
    ["ACWR",r.acwr_atual!=null?Number(r.acwr_atual).toFixed(2):"--"],
    ["Sono 30d",sd.media_sono_30d!=null?sd.media_sono_30d+"h":"--"],["Stress 30d",sd.media_stress_30d??"--"]];
  $("kpis").innerHTML=kp.map(([l,v])=>`<div class="kpi"><div class="v">${v??"--"}</div><div class="l">${l}</div></div>`).join("");

  const Ball=_bucketsJS(GRANP);
  const LIM={dia:7,sem:5,mes:12,tri:8,ano:99,tudo:9999};
  const win=LIM[GRANP]||Ball.length, total=Ball.length;
  const maxOff=Math.max(0,Math.ceil(total/win)-1);
  if(OFFP>maxOff)OFFP=maxOff; if(OFFP<0)OFFP=0;
  const endIdx=total-OFFP*win, startIdx=Math.max(0,endIdx-win);
  const B=Ball.slice(startIdx,endIdx);
  // navegacao (zap)
  const navEl=document.getElementById("navP");
  if(navEl){ const some=win<total;
    navEl.style.display=some?"flex":"none";
    if(some){
      document.getElementById("lblP").textContent=B.length?(rotuloG(B[0].k,GRANP)+" - "+rotuloG(B[B.length-1].k,GRANP)):"";
      document.getElementById("prevP").disabled=(startIdx<=0);
      document.getElementById("nextP").disabled=(OFFP<=0);
    }
  }
  const linhas=[["Pedais",b=>b.cic_n],["Pedal h",b=>+b.cic_h.toFixed(1)],["Forca",b=>b.for_n],
    ["km",b=>Math.round(b.km)],["Carga",b=>Math.round(b.carga)],["VO2",b=>b.vo2],
    ["FC rep",b=>avgN(b.fcrep)],["Sono h",b=>avgN(b.sono)],["Stress",b=>avgN(b.stress)]];
  const cap={dia:"dia",sem:"semana",mes:"mes",tri:"trimestre",ano:"ano",tudo:"mes"}[GRANP];
  const capEl=document.getElementById("capPeriodo"); if(capEl) capEl.textContent="Cada coluna = 1 "+cap+" \u00b7 mostrando "+B.length+(Ball.length>B.length?(" de "+Ball.length):"");
  const lab=B.map(b=>rotuloG(b.k,GRANP));
  let th="<tr><th></th>"+lab.map(x=>`<th>${x}</th>`).join("")+"</tr>";
  let body=linhas.map(([t,g])=>`<tr><td class="rowlab">${t}</td>`+B.map(b=>`<td>${g(b)??"--"}</td>`).join("")+"</tr>").join("");
  $("tabela").innerHTML=`<table>${th}${body}</table>`;
  destroyCharts();
  charts.push(new Chart($("cCarga"),{type:"bar",data:{labels:lab,datasets:[{data:B.map(b=>Math.round(b.carga)),backgroundColor:"#38bdf8"}]},options:{plugins:{legend:{display:false}}}}));
  charts.push(new Chart($("cSaude"),{type:"line",data:{labels:lab,datasets:[
    {label:"Sono (h)",data:B.map(b=>avgN(b.sono)),borderColor:"#818cf8",spanGaps:true},
    {label:"Stress",data:B.map(b=>avgN(b.stress)),borderColor:"#fb7185",yAxisID:"y2",spanGaps:true}]},
    options:{scales:{y2:{position:"right",grid:{drawOnChartArea:false}}}}}));
}

async function renderCoach(){
  const box=$("coachBox");
  const hist=await getHistorico();
  const ultima=hist[hist.length-1];
  const temData=!!ANALISE;
  const dadosNovos = temData && SNAP_AT && (!ultima || new Date(SNAP_AT) > new Date(ultima.criado_em));
  if(localStorage.getItem(KEYLS) && temData && dadosNovos){
    box.innerHTML=`<div class="coach">Gerando avaliacao da semana...</div>`;
    try{ const t=await gerarAvaliacao(); box.innerHTML=`<div class="coach">${escapeHtml(t)}</div>`; }
    catch(e){ box.innerHTML=`<div class="coach">${ultima?escapeHtml(ultima.texto):"Nao consegui gerar: "+escapeHtml(String(e))}</div>`; }
  } else if(ultima){
    box.innerHTML=`<div class="coach">${escapeHtml(ultima.texto)}</div>`;
  } else {
    box.innerHTML=`<div class="coach dim">Configure a chave da IA em Ajustes para receber a avaliacao da semana.</div>`;
  }
}
function escapeHtml(s){return (s||"").replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));}

/* ---------- chat ---------- */
function addMsg(role,txt){const d=document.createElement("div");d.className="msg "+(role==="user"?"u":"a");d.textContent=txt;$("chat").appendChild(d);$("chat").scrollTop=$("chat").scrollHeight;return d;}
function addSep(diaISO){const p=diaISO.split("-");const d=document.createElement("div");d.className="sep";d.textContent=p[2]+"/"+p[1]+"/"+p[0];$("chat").appendChild(d);}
async function carregarConversa(){
  let q=sb.from("conversations").select("role,content,criado_em").eq("user_id",UID).order("criado_em",{ascending:true}).limit(80);
  const since=sinceVal(); if(since) q=q.gte("criado_em",since);
  const {data}=await q;
  $("chat").innerHTML=""; let lastDay="";
  (data||[]).forEach(m=>{ const day=(m.criado_em||"").slice(0,10); if(day&&day!==lastDay){addSep(day);lastDay=day;} addMsg(m.role,m.content); });
  if(!data||!data.length) addMsg("assistant","Opa! Sou seu treinador. Pergunte sobre sua semana, recuperacao ou o que treinar. Eu lembro do seu historico.");
}
async function enviarChat(texto){
  addMsg("user",texto); const pend=addMsg("assistant","...");
  try{
    let cq=sb.from("conversations").select("role,content").eq("user_id",UID).order("criado_em",{ascending:true}).limit(20);
    const _s=sinceVal(); if(_s) cq=cq.gte("criado_em",_s);
    const {data:conv}=await cq;
    const hist=await getHistorico();
    const msgs=[...(conv||[]).map(c=>({role:c.role,content:c.content})),{role:"user",content:texto}];
    const resp=await callClaude(contexto(hist),msgs,1200);
    pend.textContent=resp;
    await sb.from("conversations").insert([{user_id:UID,role:"user",content:texto},{user_id:UID,role:"assistant",content:resp}]);
  }catch(e){ pend.textContent="Erro: "+e.message; }
}

/* ---------- navegacao/sessao ---------- */
function showTab(t){
  ["painel","treinador","config"].forEach(x=>$("t-"+x).classList.toggle("hide",x!==t));
  document.querySelectorAll(".tabbar button").forEach(b=>b.classList.toggle("on",b.dataset.t===t));
}
async function carregarTudo(){
  const {data:snap}=await sb.from("snapshots").select("dados,atualizado_em").eq("user_id",UID).maybeSingle();
  ANALISE=snap?.dados||null; SNAP_AT=snap?.atualizado_em||null;
  renderPainel(); await renderCoach(); await carregarConversa();
}
async function entrar(session){
  UID=session.user.id; $("uid").textContent=UID;
  $("login").classList.add("hide"); $("app").classList.remove("hide");
  $("apikey").value=localStorage.getItem(KEYLS)||"";
  await carregarTudo();
}
function deslogado(){ $("app").classList.add("hide"); $("login").classList.remove("hide"); }

/* ---------- eventos ---------- */
$("entrar").onclick=async()=>{
  const email=$("email").value.trim(), senha=$("senha").value;
  if(!email||!senha){$("loginMsg").textContent="Preencha e-mail e senha.";return;}
  $("loginMsg").textContent="Entrando...";
  const {error}=await sb.auth.signInWithPassword({email,password:senha});
  if(error)$("loginMsg").textContent="Erro: "+error.message+" (se for a 1a vez, toque em Criar senha)";
};
$("criar").onclick=async()=>{
  const email=$("email").value.trim(), senha=$("senha").value;
  if(!email||senha.length<6){$("loginMsg").textContent="Use uma senha de 6+ caracteres.";return;}
  $("loginMsg").textContent="Criando conta...";
  const {data,error}=await sb.auth.signUp({email,password:senha});
  if(error){$("loginMsg").textContent="Erro: "+error.message;return;}
  if(data && data.session){ return; } // ja logou
  // sem sessao -> tenta entrar (caso confirmacao de email esteja off)
  const r=await sb.auth.signInWithPassword({email,password:senha});
  $("loginMsg").textContent=r.error?("Conta criada. Agora toque em Entrar."):"";
};
$("sair").onclick=async()=>{await sb.auth.signOut();deslogado();};
document.querySelector(".tabbar").onclick=e=>{const t=e.target.dataset.t;if(t)showTab(t);};
$("enviar").onclick=()=>{const t=$("q").value.trim();if(!t)return;$("q").value="";enviarChat(t);};
$("q").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();$("enviar").click();}});
$("salvarKey").onclick=()=>{localStorage.setItem(KEYLS,$("apikey").value.trim());$("apikey").type="password";alert("Chave salva neste aparelho.");renderCoach();};
$("gerarAval").onclick=async()=>{ $("avalMsg").textContent="Gerando..."; try{await gerarAvaliacao();await renderCoach();showTab("painel");$("avalMsg").textContent="Pronto!";}catch(e){$("avalMsg").textContent="Erro: "+e.message;} };

const nc=document.getElementById("novaConv"); if(nc) nc.addEventListener("click",()=>{localStorage.setItem(KEYSINCE,new Date().toISOString());carregarConversa();});
document.getElementById("prevP").addEventListener("click",()=>{OFFP++;renderPainel();});
document.getElementById("nextP").addEventListener("click",()=>{OFFP--;renderPainel();});
document.getElementById("seg").addEventListener("click",e=>{const g=e.target.dataset.g;if(!g)return;GRANP=g;OFFP=0;[...document.querySelectorAll("#seg button")].forEach(x=>x.classList.toggle("on",x.dataset.g===g));renderPainel();});

(async()=>{
  UID=UID_FIXO;
  document.getElementById("login").classList.add("hide");
  document.getElementById("app").classList.remove("hide");
  const sair=document.getElementById("sair"); if(sair) sair.style.display="none";
  const ak=document.getElementById("apikey"); if(ak) ak.value=localStorage.getItem(KEYLS)||"";
  const uidEl=document.getElementById("uid"); if(uidEl) uidEl.textContent=UID;
  await carregarTudo();
  if("serviceWorker" in navigator){ try{ await navigator.serviceWorker.register("sw.js"); }catch(e){} }
})();
