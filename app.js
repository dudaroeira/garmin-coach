/* Garmin Coach PWA - logica do app.
   Dados e memoria: Supabase (com login, privado). Chave da IA: so neste aparelho. */
const CFG = window.CFG;
const sb = supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
const $ = (id) => document.getElementById(id);
const KEYLS = "coach_api_key";

const SYSTEM = `Voce e um treinador pessoal experiente em ciclismo e treino de forca, com base cientifica (fisiologia, periodizacao, treino polarizado, forca para ciclistas, recuperacao, sono, gestao de carga). Acompanha UM atleta de forma proxima e continua.
Jeito: portugues do Brasil, caloroso, direto e motivador; especifico e acionavel; honesto; usa os DADOS fornecidos; LEMBRA do historico e dos seus conselhos anteriores fazendo continuidade; prioriza recuperacao/sono/prevencao de lesao.
Seguranca: nao e medico (diante de dor/sintomas, oriente buscar profissional); nunca recomende doping ou praticas de risco; se faltar dado, diga o que observar sem inventar.
Na avaliacao semanal use secoes curtas: Como foi a semana / O que evoluiu / Pontos de atencao / Plano para a proxima semana / Um empurraozinho.`;

let UID = null, ANALISE = null, SNAP_AT = null;

function digest(a){
  if(!a) return "Sem dados ainda.";
  const p=a.perfil||{},r=a.resumo||{},sd=a.saude||{},L=[];
  L.push(`PERFIL: idade ${p.idade}, sexo ${p.sexo}, FC max ${p.fc_max}, FC repouso ${p.fc_repouso}, FTP ${p.ftp||"n/d"}`);
  L.push(`PERIODO: ${a.dias} dias | ${r.n_atividades} atividades (${r.n_ciclismo} pedais, ${r.n_forca} forca) | ${r.horas_total}h | ACWR ${r.acwr_atual}`);
  L.push(`SAUDE 30d: sono ${sd.media_sono_30d}h, stress ${sd.media_stress_30d}, passos ${sd.media_passos_30d}, cal ativas ${sd.media_cal_ativas_30d}`);
  const z=a.zonas_fc||{}; const tot=Object.values(z).reduce((x,y)=>x+y,0)||1;
  if(Object.keys(z).length) L.push("ZONAS FC: "+Object.entries(z).map(([k,v])=>`${k} ${Math.round(100*v/tot)}%`).join(", "));
  (a.mensal||[]).forEach(m=>L.push(`  ${m.mes}: carga ${m.carga}, pedal ${m.ciclismo_h}h, forca ${m.forca_n}, VO2 ${m.vo2}, FCrep ${m.fc_repouso}, sono ${m.sono_h}h, stress ${m.stress}`));
  (a.plano||[]).slice(0,8).forEach(it=>L.push(`  [${it.nivel}] ${it.titulo}: ${it.texto}`));
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
  const texto=await callClaude(contexto(hist),[{role:"user",content:"Faca a AVALIACAO DESTA SEMANA seguindo as secoes, comparando com antes e dando continuidade aos seus conselhos anteriores (verificando o que foi seguido)."}],1600);
  await sb.from("coach_history").insert({user_id:UID,resumo:ANALISE?.resumo||{},texto});
  return texto;
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
  const M=ANALISE.mensal||[];
  const nm=["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  const rot=m=>{const p=m.split("-");return nm[(+p[1])-1]+"/"+p[0].slice(2);};
  const linhas=[["Pedais",x=>x.ciclismo_n],["Pedal h",x=>x.ciclismo_h],["Forca",x=>x.forca_n],["Carga",x=>x.carga],["VO2",x=>x.vo2],["FC rep",x=>x.fc_repouso],["Sono h",x=>x.sono_h],["Stress",x=>x.stress]];
  let th="<tr><th></th>"+M.map(m=>`<th>${rot(m.mes)}</th>`).join("")+"</tr>";
  let body=linhas.map(([lab,g])=>`<tr><td class="rowlab">${lab}</td>`+M.map(m=>`<td>${g(m)??"--"}</td>`).join("")+"</tr>").join("");
  $("tabela").innerHTML=`<table>${th}${body}</table>`;
  destroyCharts();
  const L=M.map(m=>rot(m.mes));
  charts.push(new Chart($("cCarga"),{type:"bar",data:{labels:L,datasets:[{data:M.map(m=>m.carga),backgroundColor:"#38bdf8"}]},options:{plugins:{legend:{display:false}}}}));
  charts.push(new Chart($("cSaude"),{type:"line",data:{labels:L,datasets:[
    {label:"Sono (h)",data:M.map(m=>m.sono_h),borderColor:"#818cf8"},
    {label:"Stress",data:M.map(m=>m.stress),borderColor:"#fb7185",yAxisID:"y2"}]},
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
async function carregarConversa(){
  const {data}=await sb.from("conversations").select("role,content").eq("user_id",UID).order("criado_em",{ascending:true}).limit(40);
  $("chat").innerHTML=""; (data||[]).forEach(m=>addMsg(m.role,m.content));
  if(!data||!data.length) addMsg("assistant","Opa! Sou seu treinador. Pergunte sobre sua semana, recuperacao ou o que treinar. Eu lembro do seu historico.");
}
async function enviarChat(texto){
  addMsg("user",texto); const pend=addMsg("assistant","...");
  try{
    const {data:conv}=await sb.from("conversations").select("role,content").eq("user_id",UID).order("criado_em",{ascending:true}).limit(20);
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
$("enviarLink").onclick=async()=>{
  const email=$("email").value.trim(); if(!email)return;
  $("loginMsg").textContent="Enviando...";
  const {error}=await sb.auth.signInWithOtp({email,options:{emailRedirectTo:location.href.split("#")[0]}});
  $("loginMsg").textContent=error?("Erro: "+error.message):"Link enviado! Verifique seu e-mail e abra o link neste aparelho.";
};
$("sair").onclick=async()=>{await sb.auth.signOut();deslogado();};
document.querySelector(".tabbar").onclick=e=>{const t=e.target.dataset.t;if(t)showTab(t);};
$("enviar").onclick=()=>{const t=$("q").value.trim();if(!t)return;$("q").value="";enviarChat(t);};
$("q").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();$("enviar").click();}});
$("salvarKey").onclick=()=>{localStorage.setItem(KEYLS,$("apikey").value.trim());$("apikey").type="password";alert("Chave salva neste aparelho.");renderCoach();};
$("gerarAval").onclick=async()=>{ $("avalMsg").textContent="Gerando..."; try{await gerarAvaliacao();await renderCoach();showTab("painel");$("avalMsg").textContent="Pronto!";}catch(e){$("avalMsg").textContent="Erro: "+e.message;} };

sb.auth.onAuthStateChange((_e,session)=>{ if(session) entrar(session); else deslogado(); });
(async()=>{ const {data:{session}}=await sb.auth.getSession(); if(session) entrar(session); else deslogado();
  if("serviceWorker" in navigator){ try{ await navigator.serviceWorker.register("sw.js"); }catch(e){} }
})();
