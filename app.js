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
Compare SEMPRE apenas semanas COMPLETAS; NUNCA tire conclusoes da semana em curso (parcial) -- ela distorce volume e carga.
ESTATISTICA ROBUSTA: os dados de saude vem como MEDIANA (nao media) justamente porque a mediana ignora dias atipicos isolados. Use as MEDIANAS como base do diagnostico. A secao EVENTOS ATIPICOS lista os dias que fugiram do padrao: trate cada um como EVENTO PONTUAL -- 1 linha cada, sem deixar um unico dia definir a leitura da semana, do mes ou do trimestre. Nunca chame de 'tendencia' algo explicado por 1-2 dias atipicos; tendencia exige padrao sustentado em varias semanas.
COMPARACOES EM 3 NIVEIS: alem de semana x semana, compare MES x MES e TRIMESTRE x TRIMESTRE usando as secoes MES A MES e TRIMESTRE A TRIMESTRE do contexto. Periodos marcados '(parcial)' estao em curso: cite-os so como observacao, nunca como base de conclusao.
TREINOS: NAO analise treino a treino. AGRUPE as sessoes parecidas em 1 linha so (ex.: '5 sessoes de forca estaveis: 60-70min, carga 7-14, FC media ~95') e detalhe individualmente, pela data, APENAS o que fugiu do padrao (recorde, carga muito acima/abaixo, modalidade nova) e os pedais.
ESTILO ENXUTO: a avaliacao semanal completa deve ter NO MAXIMO ~400 palavras (1 tela e meia de celular). Cada numero aparece UMA unica vez, na secao certa -- proibido repetir o mesmo dado em outra secao. Frases curtas, zero preambulo, zero tabelas. Feche com UMA frase de incentivo no fim do plano (sem secao propria).
A avaliacao semanal tem EXATAMENTE 4 secoes, nesta ordem:
1. Como foi a semana -- volume/carga vs semana anterior, treinos agrupados + destaques pela data (3-6 linhas).
2. Saude e recuperacao -- sono (score), stress, HRV, body battery pico, FC repouso, em MEDIANAS; eventos atipicos como eventos pontuais (4-7 linhas).
3. Evolucao -- SO o que mudou: perfil (FC repouso, VO2max, FTP, FC max) vs avaliacao anterior + mes x mes + trimestre x trimestre (3-6 linhas).
4. Plano da proxima semana -- 3 a 5 acoes concretas e verificaveis, em lista (1 linha cada).`;

const UID_FIXO="11dd4f4a-634a-48bf-a5a7-c12220c3b22d";
let UID = UID_FIXO, ANALISE = null, SNAP_AT = null;

function _bucketsJS(gran){
  const kf=keyFnG(gran), m=new Map();
  const E=k=>{ if(!m.has(k)) m.set(k,{k,carga:0,sono:[],sscore:[],stress:[],fcrep:[],bba:[],bbb:[],hrv:[],fcmax:[],passos:[],cal:[],cic_h:0,for_h:0,cic_n:0,for_n:0,km:0,vo2:null}); return m.get(k); };
  for(const r of (ANALISE.daily||[])){const b=E(kf(r.d)); b.carga+=r.carga||0;
    if(r.sono!=null)b.sono.push(r.sono); if(r.sono_score!=null)b.sscore.push(r.sono_score); if(r.stress!=null)b.stress.push(r.stress); if(r.fcrep!=null)b.fcrep.push(r.fcrep);
    if(r.bb_alta!=null)b.bba.push(r.bb_alta); if(r.bb_baixa!=null)b.bbb.push(r.bb_baixa); if(r.hrv!=null)b.hrv.push(r.hrv);
    if(r.passos!=null)b.passos.push(r.passos); if(r.cal!=null)b.cal.push(r.cal);}
  for(const x of (ANALISE.ativs||[])){const b=E(kf(x.d));
    if(x.hrmax)b.fcmax.push(x.hrmax);
    if(x.cat==="ciclismo"){b.cic_h+=x.h;b.cic_n++;b.km+=x.km||0;} else if(x.cat==="forca"){b.for_h+=x.h;b.for_n++;}}
  for(const v of (ANALISE.vo2_xy||[])){const k=kf(v.d); if(m.has(k))m.get(k).vo2=v.v;}
  return [...m.keys()].sort().map(k=>m.get(k));
}
const avgN=arr=>arr.length?Math.round(arr.reduce((x,y)=>x+y,0)/arr.length*10)/10:null;
const maxN=arr=>arr.length?Math.max.apply(null,arr):null;
// mediana: robusta a eventos isolados (1 dia atipico nao distorce o periodo)
const medN=arr=>{if(!arr.length)return null;const s=[...arr].sort((a,b)=>a-b);const m=Math.floor(s.length/2);const v=s.length%2?s[m]:(s[m-1]+s[m])/2;return Math.round(v*10)/10;};

function digest(a){
  if(!a) return "Sem dados ainda.";
  const p=a.perfil||{},r=a.resumo||{},sd=a.saude||{},L=[];
  L.push(`PERFIL: idade ${p.idade}, sexo ${p.sexo}, FC max ${p.fc_max}, FC repouso ${p.fc_repouso}, FTP ${p.ftp||"sem medidor de potencia"}`);
  L.push(`JANELA: ${a.dias} dias ate ${a.gerado_em} | ${r.n_atividades} atividades (${r.n_ciclismo} pedais, ${r.n_forca} forca) | ${r.horas_total}h | ACWR atual ${r.acwr_atual}`);
  const med=(m,fb)=>sd[m]!=null?sd[m]:sd[fb];
  L.push(`SAUDE 30d (MEDIANAS - robustas a dias atipicos): sono ${med("mediana_sono_30d","media_sono_30d")}h, stress ${med("mediana_stress_30d","media_stress_30d")}, FC repouso ${sd.mediana_fcrep_30d??"-"}, HRV ${sd.mediana_hrv_30d??"-"}ms, passos ${med("mediana_passos_30d","media_passos_30d")}, cal ativas ${med("mediana_cal_ativas_30d","media_cal_ativas_30d")}`);
  const z=a.zonas_fc||{}; const tot=Object.values(z).reduce((x,y)=>x+y,0)||1;
  if(Object.keys(z).length) L.push("TEMPO POR ZONA DE FC: "+Object.entries(z).map(([k,v])=>`${k} ${Math.round(100*v/tot)}%`).join(", "));
  // eventos atipicos detectados pela analise (dia fora do padrao = evento pontual)
  const ev=a.eventos_atipicos||[];
  if(ev.length){
    L.push("EVENTOS ATIPICOS (dias isolados fora do padrao dos ultimos 45d - trate como eventos pontuais, NAO como tendencia):");
    ev.slice(0,10).forEach(e=>L.push(`  ${e.data} (${e.dia_semana}): ${e.metrica} ${e.valor}${e.unidade||""} ${e.direcao} do normal (mediana ${e.mediana_janela}${e.unidade||""})`));
  }
  const hojeISO=a.gerado_em||new Date().toISOString().slice(0,10);
  // semana a semana (ultimas 12) - medianas nas metricas de saude
  try{
    const hojeWk=wkKeyG(hojeISO);
    const sem=_bucketsJS("sem").filter(b=>b.k!==hojeWk).slice(-12);
    L.push("SEMANA A SEMANA (apenas semanas COMPLETAS; a semana em curso foi omitida; saude em MEDIANA):");
    sem.forEach(b=>L.push(`  ${b.k}: carga ${Math.round(b.carga)}, pedal ${b.cic_h.toFixed(1)}h(${b.cic_n}), forca ${b.for_n}x, km ${Math.round(b.km)}, sono ${medN(b.sono)??"-"}h(score ${medN(b.sscore)??"-"}), stress ${medN(b.stress)??"-"}, FCrep ${medN(b.fcrep)??"-"}, bodyBattery pico ${medN(b.bba)??"-"} (vale ${medN(b.bbb)??"-"}), HRV ${medN(b.hrv)??"-"}, VO2 ${b.vo2??"-"}`));
  }catch(e){ console.error("digest semana-a-semana falhou:",e); }
  // mes a mes (ultimos 7; o mes em curso e marcado como parcial)
  try{
    const mesAtual=hojeISO.slice(0,7);
    const ms=_bucketsJS("mes").slice(-7);
    L.push("MES A MES (saude em MEDIANA; compare mes x mes anterior e mesmo mes de antes):");
    ms.forEach(b=>L.push(`  ${b.k}${b.k===mesAtual?" (parcial)":""}: carga ${Math.round(b.carga)}, pedal ${b.cic_h.toFixed(1)}h(${b.cic_n}), forca ${b.for_n}x, km ${Math.round(b.km)}, sono ${medN(b.sono)??"-"}h, stress ${medN(b.stress)??"-"}, FCrep ${medN(b.fcrep)??"-"}, HRV ${medN(b.hrv)??"-"}, VO2 ${b.vo2??"-"}`));
  }catch(e){ console.error("digest mes-a-mes falhou:",e); }
  // trimestre a trimestre (o trimestre em curso e marcado como parcial)
  try{
    const kfT=keyFnG("tri"); const triAtual=kfT(hojeISO);
    const ts=_bucketsJS("tri").slice(-6);
    L.push("TRIMESTRE A TRIMESTRE (saude em MEDIANA; visao de longo prazo):");
    ts.forEach(b=>L.push(`  ${b.k}${b.k===triAtual?" (parcial)":""}: carga ${Math.round(b.carga)}, pedal ${b.cic_h.toFixed(1)}h(${b.cic_n}), forca ${b.for_n}x, km ${Math.round(b.km)}, sono ${medN(b.sono)??"-"}h, stress ${medN(b.stress)??"-"}, FCrep ${medN(b.fcrep)??"-"}, HRV ${medN(b.hrv)??"-"}, VO2 ${b.vo2??"-"}`));
  }catch(e){ console.error("digest tri-a-tri falhou:",e); }
  // atividades recentes detalhadas (ultimas 15)
  const ats=(a.ativs||[]).slice().sort((x,y)=>(x.d<y.d?-1:(x.d>y.d?1:0))).slice(-20);
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

async function getHistorico(){ const {data}=await sb.from("coach_history").select("criado_em,texto").eq("user_id",UID).order("criado_em",{ascending:false}).limit(8); return (data||[]).reverse(); }
function contexto(hist){ const h=(hist||[]).map(x=>`--- ${(x.criado_em||"").slice(0,10)} ---\n${x.texto}`).join("\n")||"Sem aconselhamentos anteriores."; return `${SYSTEM}\n\n=== DADOS ATUAIS ===\n${digest(ANALISE)}\n\n=== ACONSELHAMENTOS ANTERIORES ===\n${h}`; }

async function gerarAvaliacao(){
  const hist=await getHistorico();
  const ctx=contexto(hist);
  const texto=await callClaude(ctx,[{role:"user",content:"Faca a AVALIACAO DESTA SEMANA (apenas semana COMPLETA), seguindo A RISCA as 4 secoes e o limite de ~400 palavras definidos nas instrucoes: 1) Como foi a semana (treinos AGRUPADOS + so os destaques pela data) 2) Saude e recuperacao (MEDIANAS; eventos atipicos = eventos pontuais, 1 linha cada) 3) Evolucao (so o que mudou: perfil vs avaliacao anterior, mes x mes, trimestre x trimestre) 4) Plano da proxima semana (3-5 acoes em lista). Cada numero aparece uma unica vez. De continuidade aos seus conselhos anteriores sem repeti-los."}],1100);
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
function temAlgum(arr){return arr.some(v=>v!=null && !(typeof v==="number"&&isNaN(v)));}
function addChartCard(container,titulo,cfg){
  const lbl=document.createElement("div"); lbl.className="seclbl";
  const s=document.createElement("span"); s.textContent=titulo; lbl.appendChild(s);
  const card=document.createElement("div"); card.className="card";
  const box=document.createElement("div"); box.className="chartbox";
  const cv=document.createElement("canvas"); box.appendChild(cv); card.appendChild(box);
  container.append(lbl,card);
  cfg.options=cfg.options||{}; cfg.options.responsive=true; cfg.options.maintainAspectRatio=false;
  charts.push(new Chart(cv,cfg));
}
function atualizarProntidao(){
  const hero=$("heroProntidao"); if(!hero) return;
  const d=(ANALISE&&ANALISE.daily)||[];
  const ss=[...d].reverse().find(r=>r.sono_score!=null);
  if(!ss){ hero.classList.add("hide"); return; }
  let score=ss.sono_score;
  const acwr=ANALISE.resumo&&ANALISE.resumo.acwr_atual;
  if(acwr!=null){ if(acwr>1.4) score-=12; else if(acwr<0.8) score+=4; }
  score=Math.round(Math.max(0,Math.min(100,score)));
  let nota,desc;
  if(score>=80){ nota="Pronto para intensidade"; desc="Boa recuperação — dia para um treino de qualidade."; }
  else if(score>=60){ nota="Treino moderado"; desc="Recuperação razoável; mantenha a intensidade controlada."; }
  else { nota="Priorize recuperação"; desc="Sinais de fadiga; prefira volume leve ou descanso."; }
  if(acwr!=null && acwr>1.4) desc="Carga aguda alta (ACWR "+Number(acwr).toFixed(2)+") — cuidado com a intensidade.";
  $("ringVal").textContent=score;
  const fill=$("ringFill"); if(fill) fill.setAttribute("stroke-dasharray", score+" 100");
  $("readyLabel").textContent=nota;
  $("readyDesc").textContent=desc+" (base: sleep score "+ss.sono_score+" de "+ss.d.slice(8,10)+"/"+ss.d.slice(5,7)+")";
  hero.classList.remove("hide");
}
function renderPainel(){
  if(!ANALISE){ $("painelVazio").textContent="Ainda nao recebi seus dados. Rode o app no PC (rodar.bat) para enviar."; return; }
  $("painelVazio").textContent="";
  const r=ANALISE.resumo||{}, sd=ANALISE.saude||{};
  const kp=[
    {l:"Atividades",v:r.n_atividades,u:"",sub:"último ano"},
    {l:"Pedais",v:r.n_ciclismo,u:"",sub:"ciclismo"},
    {l:"Força",v:r.n_forca,u:"",sub:"sessões"},
    {l:"ACWR",v:r.acwr_atual!=null?Number(r.acwr_atual).toFixed(2):"--",u:"",sub:"carga aguda/crônica"},
    {l:"Sono",v:(sd.mediana_sono_30d??sd.media_sono_30d)??"--",u:(sd.mediana_sono_30d??sd.media_sono_30d)!=null?"h":"",sub:"mediana 30 dias"},
    {l:"Stress",v:(sd.mediana_stress_30d??sd.media_stress_30d)??"--",u:"",sub:"mediana 30 dias"}];
  const kpiBox=$("kpis"); kpiBox.replaceChildren();
  for(const k of kp){
    const c=document.createElement("div"); c.className="kpi";
    const l=document.createElement("div"); l.className="kpi-l"; l.textContent=k.l;
    const row=document.createElement("div"); row.className="kpi-row";
    const v=document.createElement("span"); v.className="kpi-v"; v.textContent=(k.v??"--");
    const u=document.createElement("span"); u.className="kpi-u"; u.textContent=k.u||"";
    row.append(v,u);
    const sub=document.createElement("div"); sub.className="kpi-sub"; sub.textContent=k.sub||"";
    c.append(l,row,sub); kpiBox.appendChild(c);
  }
  atualizarProntidao();

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
  const tbl=document.createElement("table");
  const trh=document.createElement("tr"); trh.appendChild(document.createElement("th"));
  lab.forEach(x=>{const th=document.createElement("th");th.textContent=x;trh.appendChild(th);});
  tbl.appendChild(trh);
  linhas.forEach(([t,g])=>{
    const tr=document.createElement("tr");
    const td0=document.createElement("td"); td0.className="rowlab"; td0.textContent=t; tr.appendChild(td0);
    B.forEach(b=>{const td=document.createElement("td");const v=g(b);td.textContent=(v??"--");tr.appendChild(td);});
    tbl.appendChild(tr);
  });
  $("tabela").replaceChildren(tbl);
  destroyCharts();
  const ACC="#ff5e3a", AMBER="#e9c46a";
  const noX={grid:{display:false},border:{display:false},ticks:{display:false}};
  const softY={grid:{color:"rgba(255,255,255,.05)"},border:{display:false},ticks:{maxTicksLimit:4}};
  const legPt={legend:{display:true,labels:{boxWidth:8,boxHeight:8,usePointStyle:true,padding:14}}};
  charts.push(new Chart($("cCarga"),{type:"bar",data:{labels:lab,datasets:[{data:B.map(b=>Math.round(b.carga)),backgroundColor:ACC,borderRadius:6,borderSkipped:false,maxBarThickness:22}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{displayColors:false}},scales:{x:noX,y:{...softY,beginAtZero:true}}}}));
  charts.push(new Chart($("cSaude"),{type:"line",data:{labels:lab,datasets:[
    {label:"Sono (h)",data:B.map(b=>avgN(b.sono)),borderColor:ACC,backgroundColor:"transparent",borderWidth:2.6,tension:.4,pointRadius:0,spanGaps:true,yAxisID:"y"},
    {label:"Stress",data:B.map(b=>avgN(b.stress)),borderColor:AMBER,backgroundColor:"transparent",borderWidth:2,borderDash:[4,4],tension:.4,pointRadius:0,spanGaps:true,yAxisID:"y1"}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:legPt,scales:{x:noX,y:softY,y1:{position:"right",min:0,max:100,grid:{display:false},border:{display:false},ticks:{maxTicksLimit:4}}}}}));
  const cfc=$("cFC");
  if(cfc){ const ctx=cfc.getContext("2d"); const grad=ctx.createLinearGradient(0,0,0,178); grad.addColorStop(0,"rgba(255,94,58,.34)"); grad.addColorStop(1,"rgba(255,94,58,0)");
    charts.push(new Chart(cfc,{type:"line",data:{labels:lab,datasets:[
      {label:"FC repouso",data:B.map(b=>avgN(b.fcrep)),borderColor:ACC,backgroundColor:grad,borderWidth:2.6,fill:true,tension:.4,pointRadius:0,spanGaps:true},
      {label:"FC máx",data:B.map(b=>maxN(b.fcmax)),borderColor:AMBER,backgroundColor:"transparent",borderWidth:2,borderDash:[4,4],tension:.4,pointRadius:0,spanGaps:true}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:legPt,scales:{x:noX,y:softY}}}));
  }
  // ---- graficos extras (escondem-se quando nao ha dado no periodo) ----
  const GREEN="#34d399", PURPLE="#7c5cff", CYAN="#00b8d4", PINK="#ff2d55";
  const ln=(cor)=>({borderColor:cor,backgroundColor:"transparent",borderWidth:2.4,tension:.4,pointRadius:0,spanGaps:true});
  const mc=$("maisCharts");
  if(mc){ mc.replaceChildren();
    const cicH=B.map(b=>+b.cic_h.toFixed(1)), forH=B.map(b=>+b.for_h.toFixed(1));
    if(cicH.some(v=>v>0)||forH.some(v=>v>0)) addChartCard(mc,"Volume de treino (h)",{type:"bar",data:{labels:lab,datasets:[
      {label:"Ciclismo",data:cicH,backgroundColor:ACC,borderRadius:5,borderSkipped:false,maxBarThickness:22},
      {label:"Força",data:forH,backgroundColor:AMBER,borderRadius:5,borderSkipped:false,maxBarThickness:22}]},options:{plugins:legPt,scales:{x:{...noX,stacked:true},y:{...softY,stacked:true,beginAtZero:true}}}});
    const km=B.map(b=>Math.round(b.km));
    if(km.some(v=>v>0)) addChartCard(mc,"Distância pedalada (km)",{type:"bar",data:{labels:lab,datasets:[{data:km,backgroundColor:ACC,borderRadius:6,borderSkipped:false,maxBarThickness:22}]},options:{plugins:{legend:{display:false}},scales:{x:noX,y:{...softY,beginAtZero:true}}}});
    const vo2=B.map(b=>b.vo2);
    if(temAlgum(vo2)) addChartCard(mc,"VO2max",{type:"line",data:{labels:lab,datasets:[Object.assign({label:"VO2max",data:vo2},ln(CYAN))]},options:{plugins:{legend:{display:false}},scales:{x:noX,y:softY}}});
    const bba=B.map(b=>avgN(b.bba)), bbb=B.map(b=>avgN(b.bbb));
    if(temAlgum(bba)||temAlgum(bbb)) addChartCard(mc,"Body Battery (pico e vale)",{type:"line",data:{labels:lab,datasets:[
      Object.assign({label:"Pico",data:bba},ln(GREEN)),
      Object.assign({label:"Vale",data:bbb},ln(PINK))]},options:{plugins:legPt,scales:{x:noX,y:softY}}});
    const hrv=B.map(b=>avgN(b.hrv));
    if(temAlgum(hrv)) addChartCard(mc,"HRV noturna (ms)",{type:"line",data:{labels:lab,datasets:[Object.assign({label:"HRV",data:hrv},ln(PURPLE))]},options:{plugins:{legend:{display:false}},scales:{x:noX,y:softY}}});
    const passos=B.map(b=>avgN(b.passos));
    if(temAlgum(passos)) addChartCard(mc,"Passos/dia (média)",{type:"line",data:{labels:lab,datasets:[Object.assign({label:"Passos",data:passos},ln(GREEN))]},options:{plugins:{legend:{display:false}},scales:{x:noX,y:softY}}});
    const cal=B.map(b=>avgN(b.cal));
    if(temAlgum(cal)) addChartCard(mc,"Calorias ativas/dia (média)",{type:"line",data:{labels:lab,datasets:[Object.assign({label:"Cal",data:cal},ln(AMBER))]},options:{plugins:{legend:{display:false}},scales:{x:noX,y:softY}}});
  }
}

async function renderCoach(){
  const box=$("coachBox");
  const hist=await getHistorico();
  const ultima=hist[hist.length-1];
  const d=document.createElement("div");
  if(ultima){ d.className="coach"; d.textContent=ultima.texto; }
  else { d.className="coach dim"; d.textContent='Ainda nao ha avaliacao. Va em Ajustes e toque em "Gerar avaliacao da semana".'; }
  box.replaceChildren(d);
}

/* ---------- chat ---------- */
function addMsg(role,txt){const d=document.createElement("div");d.className="msg "+(role==="user"?"u":"a");d.textContent=txt;$("chat").appendChild(d);$("chat").scrollTop=$("chat").scrollHeight;return d;}
function addSep(diaISO){const p=diaISO.split("-");const d=document.createElement("div");d.className="sep";d.textContent=p[2]+"/"+p[1]+"/"+p[0];$("chat").appendChild(d);}
const SAUDACAO="Opa! Sou seu treinador. Pergunte sobre sua semana, recuperacao ou o que treinar. Eu lembro do seu historico.";
async function carregarDatas(){
  const sel=$("histData"); if(!sel) return;
  const {data}=await sb.from("conversations").select("criado_em").eq("user_id",UID).order("criado_em",{ascending:false}).limit(500);
  const dias=[...new Set((data||[]).map(m=>(m.criado_em||"").slice(0,10)).filter(Boolean))];
  sel.replaceChildren();
  const o0=document.createElement("option"); o0.value=""; o0.textContent="Ultima interacao"; sel.appendChild(o0);
  dias.forEach(d=>{ const p=d.split("-"); const o=document.createElement("option"); o.value=d; o.textContent="Historico · "+p[2]+"/"+p[1]+"/"+p[0]; sel.appendChild(o); });
}
async function carregarConversa(dia){
  const chat=$("chat"); chat.replaceChildren();
  if(dia){  // historico de um dia especifico
    const {data}=await sb.from("conversations").select("role,content,criado_em").eq("user_id",UID)
      .gte("criado_em",dia+"T00:00:00").lte("criado_em",dia+"T23:59:59.999")
      .order("criado_em",{ascending:true}).limit(300);
    addSep(dia);
    (data||[]).forEach(m=>addMsg(m.role,m.content));
    if(!data||!data.length) addMsg("assistant","(sem mensagens nesta data)");
    return;
  }
  // padrao: apenas a ultima interacao (ultimas 2 mensagens)
  const {data}=await sb.from("conversations").select("role,content").eq("user_id",UID)
    .order("criado_em",{ascending:false}).limit(2);
  const ult=(data||[]).reverse();
  if(!ult.length){ addMsg("assistant",SAUDACAO); return; }
  ult.forEach(m=>addMsg(m.role,m.content));
}
async function enviarChat(texto){
  const hd=$("histData"); if(hd && hd.value){ hd.value=""; $("chat").replaceChildren(); }
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
    carregarDatas();
  }catch(e){ pend.textContent="Erro: "+e.message; }
}

/* ---------- navegacao/sessao ---------- */
function showTab(t){
  ["painel","avaliacao","treinador","config"].forEach(x=>{const el=$("t-"+x); if(el) el.classList.toggle("hide",x!==t);});
  document.querySelectorAll(".tabbar button").forEach(b=>b.classList.toggle("on",b.dataset.t===t));
}
async function carregarTudo(){
  const {data:snap}=await sb.from("snapshots").select("dados,atualizado_em").eq("user_id",UID).maybeSingle();
  ANALISE=snap?.dados||null; SNAP_AT=snap?.atualizado_em||null;
  renderPainel(); await renderCoach(); await carregarDatas(); await carregarConversa();
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
async function rodarAval(msgId){ const m=$(msgId); if(m)m.textContent="Gerando avaliacao... (pode levar ~1 min)"; try{ await gerarAvaliacao(); await renderCoach(); showTab("avaliacao"); if(m)m.textContent="Pronto!"; }catch(e){ if(m)m.textContent="Erro: "+e.message; } }
$("gerarAval").onclick=()=>rodarAval("avalMsg");
const ga2=$("gerarAval2"); if(ga2) ga2.onclick=()=>rodarAval("avalMsg2");

const nc=document.getElementById("novaConv"); if(nc) nc.addEventListener("click",()=>{localStorage.setItem(KEYSINCE,new Date().toISOString());const hd=$("histData");if(hd)hd.value="";$("chat").replaceChildren();addMsg("assistant","Nova conversa iniciada. Sobre o que vamos falar?");});
const hdEl=document.getElementById("histData"); if(hdEl) hdEl.addEventListener("change",()=>carregarConversa(hdEl.value||null));
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
  if("serviceWorker" in navigator){ try{ await navigator.serviceWorker.register("sw.js"); }catch(e){ console.error("registro do service worker falhou:",e); } }
})();
