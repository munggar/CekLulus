const G={'A+':4,A:4,'A-':3.75,'B+':3.25,B:3,'B-':2.75,'C+':2.25,C:2,'C-':1.75,D:1,E:0},GR=Object.keys(G);
const $=s=>document.querySelector(s),f=(x,d=2)=>Number(x).toFixed(d).replace('.',',');
const mk=(n,a)=>({n,c:a.map(r=>({name:r[0],sks:r[1],g:r[2],t:r[3]}))});
const seed=()=>({cfg:{total:144,maxSem:14,minIpk:2},sim:{sks:20,ips:3.5,sp:false},plan:null,chat:[],sems:[
mk(1,[['Kalkulus',4,'A-','W'],['Pemrograman Dasar',3,'B+','W'],['Bahasa Inggris',2,'A','W']])]});
let st=seed();
let AUTH_TOKEN=localStorage.getItem('ceklulus_token')||sessionStorage.getItem('ceklulus_token')||'';
const api=async(url,options={})=>{
 const headers={...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})};
 if(AUTH_TOKEN)headers.Authorization=`Bearer ${AUTH_TOKEN}`;
 const response=await fetch(url,{...options,headers,body:options.body?JSON.stringify(options.body):undefined});
 const data=await response.json().catch(()=>({}));
 if(!response.ok){const error=new Error(data.error||'Permintaan ke server gagal.');error.status=response.status;throw error}
 return data;
};
let saveQueue=Promise.resolve(),saveWarningShown=false;
const save=()=>{
 if(!USER||USER.role==='admin')return saveQueue;
 const snapshot=JSON.stringify(st);
 saveQueue=saveQueue.then(()=>api('/api/data',{method:'PUT',body:{data:JSON.parse(snapshot)}}))
  .then(()=>{saveWarningShown=false;return true})
  .catch(error=>{console.error('Gagal menyimpan data CekLulus ke database.',error);if(!saveWarningShown){toast('Data gagal disimpan ke database: '+error.message);saveWarningShown=true}return false});
 return saveQueue;
};
const semesters=()=>st.sems.filter(s=>s&&Array.isArray(s.c)).sort((a,b)=>a.n-b.n);
const latestSem=()=>semesters().at(-1)?.n||0;
const semesterAt=n=>st.sems.find(s=>s?.n===n);
const latestIps=()=>{const s=semesterAt(latestSem());return s?sem(s).ips:3.5};
const DEFAULT_CFG={total:144,maxSem:14,minIpk:2};
let CFG={...DEFAULT_CFG};
const saveCfg=async()=>{const previous={...CFG};try{const data=await api('/api/settings',{method:'PUT',body:{settings:CFG}});CFG=data.settings;return true}catch(error){CFG=previous;console.error('Gagal menyimpan aturan studi.',error);toast('Aturan studi gagal disimpan: '+error.message);render();return false}};
let tab='chat',filter='all',q='',open=6,AI_PENDING=false;
let CURRICULUM=[],CURRICULUM_META=null,CURRICULUM_DRAFT=null,CURRICULUM_DRAFT_INFO=null;
// ---------- perhitungan ----------
const sem=s=>{const k=s.c.reduce((a,c)=>a+c.sks,0),p=s.c.reduce((a,c)=>a+c.sks*G[c.g],0);return{sks:k,pts:p,ips:k?p/k:0}};
const agg=(arr=st.sems)=>{let k=0,p=0;arr.forEach(s=>{const m=sem(s);k+=m.sks;p+=m.pts});return{sks:k,pts:p,ipk:k?p/k:0}};
const risky=()=>st.sems.flatMap(s=>s.c.filter(c=>G[c.g]<2).map(c=>({...c,n:s.n})));
const pred=i=>i>=3.5?'Pujian (Cum Laude)':i>=3?'Sangat Memuaskan':i>=2.5?'Memuaskan':'Cukup';
const cap=i=>i>=3?24:i>=2.5?21:18;
const term=n=>{const y=2023+Math.floor((n-1)/2);return(n%2?'Ganjil':'Genap')+' '+y+'/'+(y+1)};
const MON=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const endOf=n=>{const m=(n-8)*6+6;const d=new Date(2027,m,1);return MON[d.getMonth()]+' '+d.getFullYear()};
const rnd=()=>{let u=0,v=0;while(!u)u=Math.random();while(!v)v=Math.random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)};
function project(sks,ips,sp,gain=0,rSks=0){
 const history=semesters(),a=agg(history),N=latestSem()+1,add=sks+(sp?6:0)-rSks,ipk=(a.pts+gain+add*ips)/(a.sks+add),rem=Math.max(0,CFG.total-a.sks-add);
 const semLeft=rem<=0?N:N+Math.ceil(rem/cap(ips));
 const ipsH=history.map(s=>sem(s).ips),recent=ipsH.slice(-3),mean=recent.length?recent.reduce((x,y)=>x+y,0)/recent.length:3.5,sd=ipsH.length?Math.max(.15,Math.sqrt(ipsH.reduce((x,y)=>x+(y-mean)**2,0)/ipsH.length)):.35;
 let ok=0,okMax=0,T=2000;
 for(let i=0;i<T;i++){const a7=Math.min(4,Math.max(0,ips+rnd()*sd*.6-.05)),a8=Math.min(4,Math.max(0,mean+rnd()*sd));
  const fin=(a.pts+gain+add*a7)/(a.sks+add);
  if(fin>=CFG.minIpk&&(rem<=0||rem<=cap(a7)))ok++;
  const room=(CFG.maxSem-N)*cap(Math.min(a7,a8));if(fin>=CFG.minIpk&&rem<=room)okMax++}
 return{ipk,delta:ipk-a.ipk,rem,semLeft,onTime:semLeft<=8,when:endOf(semLeft),pOn:Math.round(ok/T*100),pMax:Math.round(okMax/T*100),acc:Math.min(96,70+history.length*4),done:a.sks+add}}
const asd=()=>{for(const s of st.sems)for(const c of s.c)if(G[c.g]<2&&/Algoritma/.test(c.name))return c;return null};
// ---------- util UI ----------
const ic=n=>`<span class="ms">${n}</span>`;
function toast(t){const e=$('#toast');e.textContent=t;e.classList.remove('hidden');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.add('hidden'),2200)}
function modal(h){$('#modal').innerHTML=`<div class="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onclick="if(event.target===this)closeM()"><div class="bg-white w-full max-w-2xl rounded-t-3xl sm:rounded-3xl p-4 sm:p-6 max-h-[88vh] overflow-y-auto">${h}</div></div>`}
const closeM=()=>$('#modal').innerHTML='';
const go=t=>{tab=t;render();scrollTo(0,0)};
const chip=(t,c)=>`<span class="text-[11px] font-bold px-2.5 py-1 rounded-full ${c}">${t}</span>`;
const gcol=g=>G[g]>=3.5?'bg-sec text-p':G[g]>=3?'bg-sc text-ov':G[g]>=2?'bg-sc text-ov':'bg-erc text-ero';
// ---------- layar ----------

async function loadCurriculum(){
  try{
    const payload=await api('/api/curriculum');
    CURRICULUM=Array.isArray(payload.courses)?payload.courses:[];
    CURRICULUM_META=payload.meta||null;
    if(USER)render();
  }catch(error){
    console.warn('Kurikulum belum dapat dimuat:',error.message);
    CURRICULUM=[];CURRICULUM_META=null;
  }
}
function normalizeCourseKey(value){
  return String(value||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase()
    .replace(/^[a-z]{0,5}[-.]?\\d{4,}\\s*/,'')
    .replace(/\\b\\d{5,}\\b/g,'')
    .replace(/[^a-z0-9]+/g,' ').trim().replace(/\\s+/g,' ');
}
function curriculumMatches(course){
  if(!CURRICULUM.length)return[];
  const code=String(course?.curriculumCode||course?.code||'').trim();
  if(code){
    const byCode=CURRICULUM.filter(item=>String(item.code||'').trim()===code);
    if(byCode.length)return byCode;
  }
  const key=normalizeCourseKey(course?.name);
  if(!key)return[];
  return CURRICULUM.filter(item=>normalizeCourseKey(item.name)===key);
}
function tagCourseWithCurriculum(course,semester){
  const matches=curriculumMatches(course);
  if(!matches.length)return{...course,curriculumStatus:CURRICULUM.length?'unmatched':'not-configured'};
  const selected=matches.find(item=>Number(item.semester)===Number(semester))||(matches.length===1?matches[0]:null);
  const selectedSemester=selected?Number(selected.semester):null;
  const status=!selected?'ambiguous':selectedSemester===Number(semester)?'matched':'semester-mismatch';
  return{
    ...course,
    curriculumCode:selected?.code||course.curriculumCode||'',
    curriculumSemester:selectedSemester,
    curriculumCategory:selected?.category||'',
    curriculumPrerequisite:selected?.prerequisite||'',
    curriculumNotes:selected?.notes||'',
    curriculumStatus:status,
    curriculumCandidateSemesters:[...new Set(matches.map(item=>Number(item.semester)))]
  };
}
function allowedSemesterFromCourse(course,matches,fallbackSemester){
  const note=String(matches.map(item=>item.notes||'').join(' '));
  const allowed=note.match(/(?:semester|sem)\\s*(\\d+(?:\\s*[/,]\\s*\\d+)*)/i);
  const values=allowed?allowed[1].split(/[/,]/).map(value=>Number(value.trim())).filter(Number.isInteger):[];
  if(values.includes(Number(fallbackSemester)))return Number(fallbackSemester);
  return null;
}
function assignKhsSemesters(groups,fallbackSemester,explicitSemester=false){
  if(!Array.isArray(groups))return[];
  let normalized=groups.map(group=>({n:Number(group.n)||fallbackSemester,c:(group.c||[]).map(course=>({...course})),semesterSource:explicitSemester?'document':'manual-review'}));
  if(explicitSemester||!CURRICULUM.length||normalized.length!==1)return normalized.map(group=>({...group,c:group.c.map(course=>tagCourseWithCurriculum(course,group.n))}));

  const source=normalized[0].c;
  const buckets=new Map(),unresolved=[];
  let recognized=0;
  for(const course of source){
    const matches=curriculumMatches(course);
    if(!matches.length){unresolved.push(course);continue}
    recognized++;
    const preferred=matches.find(item=>Number(item.semester)===Number(fallbackSemester));
    let selected=preferred;
    if(!selected&&matches.length===1)selected=matches[0];
    if(!selected){
      const allowedSemester=allowedSemesterFromCourse(course,matches,fallbackSemester);
      if(allowedSemester)selected=matches.find(item=>Number(item.semester)===allowedSemester)||null;
    }
    if(!selected){unresolved.push({...course,curriculumStatus:'ambiguous'});continue}
    const semester=Number(selected.semester)||Number(fallbackSemester);
    if(!buckets.has(semester))buckets.set(semester,[]);
    buckets.get(semester).push({...course});
  }

  const matchedCount=[...buckets.values()].reduce((sum,items)=>sum+items.length,0);
  const confidence=recognized?matchedCount/recognized:0;
  if(!buckets.size||confidence<0.5){
    return normalized.map(group=>({
      ...group,n:Number(fallbackSemester)||group.n,semesterSource:'manual-review',
      c:group.c.map(course=>tagCourseWithCurriculum(course,Number(fallbackSemester)||group.n))
    }));
  }

  const inferred=[...buckets.entries()].sort((x,y)=>x[0]-y[0]).map(([semester,courses])=>({
    n:semester,
    semesterSource:'curriculum-match',
    c:courses.map(course=>tagCourseWithCurriculum(course,semester))
  }));
  if(unresolved.length){
    const fallback=Number(fallbackSemester)||normalized[0].n;
    const target=inferred.find(group=>Number(group.n)===fallback);
    const needsReview=unresolved.map(course=>tagCourseWithCurriculum(course,fallback));
    if(target){target.c.push(...needsReview);target.semesterSource='manual-review';}
    else inferred.push({n:fallback,semesterSource:'manual-review',c:needsReview});
  }
  return inferred;
}
function academicTermForSemester(semester,angkatan){
  if(!angkatan||!Number.isFinite(Number(angkatan)))return null;
  const startYear=Number(angkatan)+Math.floor((Number(semester)-1)/2);
  const term=Number(semester)%2?'Ganjil':'Genap';
  return `Semester ${semester} · ${term} ${startYear}/${startYear+1}`;
}
function curriculumAnalysis(history=semesters(),angkatan=USER?.angkatan){
  if(!CURRICULUM.length)return null;
  const orderedHistory=[...history].sort((x,y)=>Number(x.n)-Number(y.n));
  const currentSemester=orderedHistory.reduce((max,item)=>Math.max(max,Number(item.n)||0),0);
  const courses=orderedHistory.flatMap(group=>(group.c||[]).map(course=>({...course,semester:Number(group.n)||0})));
  const bestByKey=new Map();
  for(const course of courses){
    const candidates=curriculumMatches(course);
    const key=String(course.curriculumCode||course.code||(candidates.length===1?candidates[0]?.code:normalizeCourseKey(course.name)));
    if(!key)continue;
    const grade=G[course.g]??-1;
    const prior=bestByKey.get(key);
    if(!prior||grade>(G[prior.g]??-1))bestByKey.set(key,course);
  }
  const required=CURRICULUM.filter(item=>/^wajib\\b/i.test(String(item.notes||''))||/^(praktik kerja|skripsi)$/i.test(String(item.name||'')));
  const completed=required.filter(item=>{
    const record=bestByKey.get(String(item.code||normalizeCourseKey(item.name)));
    return record&&(G[record.g]??-1)>=1;
  });
  const missing=required.filter(item=>{
    const record=bestByKey.get(String(item.code||normalizeCourseKey(item.name)));
    return !record||(G[record.g]??-1)<1;
  }).map(item=>{
    const record=bestByKey.get(String(item.code||normalizeCourseKey(item.name)));
    return{...item,status:record?'Perlu mengulang':'Belum diambil',grade:record?.g||null,
      suggestedSemester:Math.max(Number(item.semester)||1,Math.max(1,currentSemester+1))};
  });
  const atRisk=courses.filter(course=>(G[course.g]??-1)<2).map(course=>({name:course.name,grade:course.g,sks:course.sks,semester:course.semester}));
  const totals=agg(history);
  const creditRecords=new Map();
  for(const course of courses){
    if((G[course.g]??-1)<1)continue;
    const candidates=curriculumMatches(course);
    const key=String(course.curriculumCode||course.code||(candidates.length===1?candidates[0]?.code:normalizeCourseKey(course.name)));
    if(!key)continue;
    const prior=creditRecords.get(key);
    if(!prior||(G[course.g]??-1)>(G[prior.g]??-1))creditRecords.set(key,course);
  }
  const completedSks=[...creditRecords.values()].reduce((sum,course)=>sum+Number(course.sks||0),0);
  const recent=orderedHistory.slice(-2).map(item=>sem(item).sks).filter(Number.isFinite);
  const expectedLoad=recent.length?Math.max(12,Math.min(24,recent.reduce((x,y)=>x+y,0)/recent.length)):20;
  const remainingSks=Math.max(0,CFG.total-completedSks);
  const byCredits=currentSemester+Math.ceil(remainingSks/expectedLoad);
  const nextRequired=Math.max(0,...missing.map(item=>item.suggestedSemester));
  const estimatedSemester=Math.max(currentSemester||1,byCredits,nextRequired);
  const cohort=Number(angkatan)||null;
  const dCount=new Set(courses.filter(course=>course.g==='D').map(course=>String(course.curriculumCode||course.code||normalizeCourseKey(course.name)))).size;
  const practiceCourse=CURRICULUM.find(item=>/^praktik kerja$/i.test(item.name));
  const practice=bestByKey.get(String(practiceCourse?.code||''));
  const thesisConditions={
    sks75:completedSks>=Math.ceil(CFG.total*.75),
    ipk:totals.ipk>=2.75,
    maximumD:dCount<=1,
    practice:totals.sks>100&&!!practice&&(G[practice.g]??-1)>=1
  };
  const thesisReady=Object.values(thesisConditions).every(Boolean);
  const unknownPrerequisites=[...new Set(CURRICULUM
    .map(item=>String(item.prerequisite||'').trim())
    .filter(value=>value&&!/^tidak ada$/i.test(value)&&!/^telah mengambil/i.test(value)&&!/^\\d/.test(value))
    .filter(value=>{
      const parts=value.split(/,|\\bdan\\b|\\bor\\b/i).map(part=>normalizeCourseKey(part)).filter(Boolean);
      return parts.length>0&&parts.some(part=>!CURRICULUM.some(item=>normalizeCourseKey(item.name)===part));
    }))];
  return{
    totalSks:completedSks,attemptedSks:totals.sks,ipk:totals.ipk,currentSemester,remainingSks,expectedLoad,
    requiredCount:required.length,completedRequired:completed.length,missing,
    atRisk,estimatedSemester,estimatedTerm:academicTermForSemester(estimatedSemester,cohort),
    cohort,thesisConditions,thesisReady,unknownPrerequisites,
    progressPercent:required.length?Math.round(completed.length/required.length*100):0
  };
}

function vRingkasan(){
 const history=semesters(),a=agg(history),n=latestSem(),last=history.at(-1),prev=agg(history.slice(0,-1)),failed=last?last.c.filter(c=>G[c.g]<2):[],
  pl=st.plan||{sks:20,ips:3.5,sp:false},P=project(pl.sks,pl.ips,pl.sp),
  result=history.length===0?['Belum Ada KHS','bg-sc text-ov']:failed.length?['Perlu Perbaikan','bg-erc text-ero']:['Lulus','bg-pf text-p'],
  academic=curriculumAnalysis(history,USER?.angkatan);
 const ips=history.map(s=>sem(s).ips),ik=history.map((_,i)=>agg(history.slice(0,i+1)).ipk),X=i=>20+i*(260/Math.max(1,history.length-1)),Y=v=>110-(v-2.5)/1.5*100,line=a=>a.map((v,i)=>`${X(i)},${Y(v)}`).join(' ');
 const R=80,C=2*Math.PI*R;
 return`<p class="mt-3 text-[11px] font-bold tracking-wider text-se uppercase">${ic('school')} ${history.length?'Ringkasan Studi · Semester '+n:'Ringkasan Studi · Belum ada KHS'}</p>
 <h1 class="text-[32px] leading-[38px] font-extrabold tracking-tight text-p mt-1">${history.length?'Halo, '+NAME+'. Kamu makin dekat.':'Halo, '+NAME+'. Unggah KHS untuk mulai.'}</h1>
 <p class="text-sm text-ov mt-1.5">${history.length?'Progresmu terlihat '+(a.ipk-prev.ipk>=0?'stabil':'menurun')+'. Satu langkah strategis semester depan bisa menjaga jalur lulus tepat waktu.':'Unggah KHS semester mana pun untuk melihat hasil semester tersebut.'}</p>
 <div class="mt-5 rounded-3xl bg-pc text-white p-6 text-center shadow-xl"><div class="relative w-52 h-52 mx-auto grid place-items-center">
  <svg viewBox="0 0 200 200" class="absolute inset-0 -rotate-90"><circle cx="100" cy="100" r="${R}" stroke="rgba(255,255,255,.12)" stroke-width="14" fill="none"/><circle cx="100" cy="100" r="${R}" stroke="#b9eada" stroke-width="14" fill="none" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C*(1-a.ipk/4)}"/></svg>
  <div><div class="text-[10px] tracking-widest opacity-70">IPK KUMULATIF</div><div class="text-5xl font-extrabold">${f(a.ipk)}<span class="text-base font-normal opacity-60"> / 4,00</span></div><div class="text-sm">${pred(a.ipk)}</div></div></div>
  <div class="inline-block mt-3 bg-white/10 rounded-full px-4 py-1.5 text-sm font-semibold">${ic('trending_up')} ${a.ipk-prev.ipk>=0?'+':''}${f(a.ipk-prev.ipk)} semester ini</div></div>
 <button onclick="upModal()" class="w-full mt-4 bg-p text-white rounded-2xl py-4 font-bold">${ic('upload_file')} Tambah KHS</button>
 <div class="grid grid-cols-2 gap-3 mt-3">
  <div class="rounded-2xl bg-sec p-4"><div class="text-[10px] font-bold tracking-wider text-se">PROYEKSI SKENARIO SIMULASI</div><div class="text-3xl font-extrabold mt-2">${P.pOn}%</div><div class="h-1.5 rounded bg-white/60 mt-2"><div class="h-full rounded bg-p" style="width:${P.pOn}%"></div></div><div class="text-xs mt-2 text-se">Selesai di Semester ${P.semLeft}</div></div>
  <div class="rounded-2xl bg-sc p-4"><div class="text-[10px] font-bold tracking-wider text-ov">MAKS. BATAS</div><div class="text-3xl font-extrabold mt-2">${P.pMax}%</div><div class="text-xs mt-4 text-ov">Batas ${CFG.maxSem} semester ${P.pMax>90?'aman':'perlu dijaga'}</div></div>
  <div class="rounded-2xl ${result[1]} p-4"><div class="text-[10px] font-bold tracking-wider">STATUS KHS SEMESTER ${n||'-'}</div><div class="text-2xl font-extrabold mt-2">${result[0]}</div><div class="text-xs mt-2">${last?failed.length?failed.length+' mata kuliah di bawah C':'Semua '+last.c.length+' mata kuliah lulus (nilai ≥ C)':'Belum ada data KHS'}</div></div>
  <div class="rounded-2xl bg-sc p-4"><div class="text-[10px] font-bold tracking-wider text-ov">SKS TOTAL</div><div class="text-3xl font-extrabold mt-2">${a.sks}<span class="text-sm font-normal text-ov"> / ${CFG.total}</span></div><div class="text-xs mt-2 text-ov">Kurang ${Math.max(0,CFG.total-a.sks)} SKS lagi</div></div></div>
 <div class="mt-4 rounded-3xl border border-ol/60 bg-white p-5 shadow-sm">
  <div class="flex flex-wrap items-start justify-between gap-3"><div><div class="text-[10px] font-bold tracking-wider text-se">ANALISIS BERDASARKAN KURIKULUM</div><h2 class="mt-1 text-lg font-extrabold text-p">Peta jalan menuju kelulusan</h2><p class="mt-1 text-xs leading-5 text-ov">Estimasi mengacu pada mata kuliah wajib, SKS yang telah lulus, dan tahun angkatan.</p></div><span class="rounded-full ${academic?'bg-sec text-se':'bg-sc text-ov'} px-3 py-1.5 text-[10px] font-bold">${academic?'KURIKULUM AKTIF':'MENUNGGU KURIKULUM'}</span></div>
  ${academic?`<div class="mt-4 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
   <div class="rounded-2xl bg-[#f4f8f5] p-4"><div class="text-[10px] font-bold tracking-wider text-ov">PERKIRAAN SEMESTER LULUS</div><div class="mt-1 break-words text-xl font-extrabold text-p">${academic.estimatedTerm||'Semester '+academic.estimatedSemester}</div><div class="mt-1 text-[10px] text-ov">${academic.cohort?'Dari angkatan '+academic.cohort:'Tahun akademik menunggu tahun angkatan'}</div></div>
   <div class="rounded-2xl bg-[#f4f8f5] p-4"><div class="text-[10px] font-bold tracking-wider text-ov">SKS LULUS TERHITUNG</div><div class="mt-1 text-xl font-extrabold text-p">${academic.totalSks} / ${CFG.total}</div><div class="mt-1 text-[10px] text-ov">${academic.remainingSks} SKS tersisa (mata kuliah berulang tidak dihitung dua kali)</div></div>
  </div>
  <div class="mt-4"><div class="flex flex-wrap items-center justify-between gap-2 text-xs"><b class="text-p">Mata kuliah wajib teridentifikasi tuntas</b><b class="text-se">${academic.completedRequired} / ${academic.requiredCount}</b></div><div class="mt-2 h-2 overflow-hidden rounded-full bg-sc"><div class="h-full rounded-full bg-p" style="width:${academic.progressPercent}%"></div></div><p class="mt-2 text-[10px] leading-4 text-ov">${academic.progressPercent}% dari daftar wajib Excel ditemukan telah lulus pada KHS yang tersimpan. Ini merupakan pemeriksaan awal, bukan pengesahan akademik.</p></div>
  <div class="mt-4 grid grid-cols-2 gap-2"><div class="rounded-xl bg-erc p-3"><div class="text-[10px] font-bold text-ero">NILAI PERLU DITINJAU</div><b class="mt-1 block text-2xl text-ero">${academic.atRisk.length}</b></div><div class="rounded-xl bg-[#fff7e6] p-3"><div class="text-[10px] font-bold text-[#875b16]">WAJIB BELUM TUNTAS</div><b class="mt-1 block text-2xl text-[#875b16]">${academic.missing.length}</b></div></div>
  <button onclick="go('matkul')" class="mt-4 w-full rounded-xl bg-pc py-3 text-sm font-bold text-white">Tinjau mata kuliah dan prasyarat</button>`
  :'<p class="mt-4 rounded-xl bg-[#fff7e6] p-4 text-xs leading-5 text-[#875b16]">Kurikulum belum aktif. Minta administrator mengimpor Excel acuan Program Studi Sistem dan Teknologi Informasi agar estimasi kelulusan dan prasyarat mata kuliah dapat dihitung.</p>'}
  <p class="mt-3 text-[10px] leading-4 text-ov">Estimasi tahun akademik membutuhkan data angkatan. Ujian proposal, persetujuan administrasi, dan kebijakan kampus lain tetap perlu diverifikasi oleh pihak berwenang.</p>
 </div>
 <div class="bg-white rounded-3xl p-5 mt-4 shadow-sm"><div class="flex justify-between"><div><div class="font-bold text-lg">Tren Performa Akademik</div><div class="text-xs text-ov">Perbandingan IPS semesteran vs IPK</div></div><div class="text-[11px] font-bold">● IPK <span class="text-se">● IPS</span></div></div>
  <svg viewBox="0 0 300 130" class="w-full mt-3"><polyline points="${line(ips)}" fill="none" stroke="#9fd4c3" stroke-width="2.5" stroke-dasharray="5 4"/><polyline points="${line(ik)}" fill="none" stroke="#163e35" stroke-width="3"/>${ik.map((v,i)=>`<circle cx="${X(i)}" cy="${Y(v)}" r="3.5" fill="#163e35"/><text x="${X(i)}" y="127" font-size="9" font-weight="700" text-anchor="middle" fill="#414846">SEM ${history[i].n}</text>`).join('')}</svg></div>
 <div class="bg-sc rounded-3xl p-5 mt-4"><div class="flex items-center gap-3"><div class="w-11 h-11 rounded-full bg-sec grid place-items-center">${ic('lightbulb')}</div><div><div class="text-[10px] font-bold tracking-wider text-se">${st.plan?'RENCANAMU':'REKOMENDASI STRATEGIS'}</div><div class="font-bold text-lg">Target Semester ${n+1}</div></div></div>
  <p class="text-sm text-ov mt-3">Ambil ${st.plan?'':'minimal '}<b class="text-p">${pl.sks} SKS</b>${pl.sp?' (+6 SKS SP)':''} dengan target IPS <b class="text-p">${f(pl.ips)}</b> untuk mengamankan kelulusan ${P.ipk>=3?'predikat '+pred(P.ipk):'dengan IPK '+f(P.ipk)}.</p>
  <button onclick="go('simulasi')" class="mt-4 ml-auto block bg-pc text-white rounded-xl px-5 py-3 font-bold">Mulai Simulasi ${ic('arrow_forward')}</button></div>
 <div class="bg-sc rounded-2xl p-4 mt-4 flex items-center gap-3 text-sm"><div class="w-10 h-10 rounded-full bg-sec grid place-items-center shrink-0">${ic('smart_toy')}</div><div class="flex-1">"KHS Semester ${n} sudah diverifikasi. ${failed[0]?'Butuh konsultasi perbaikan nilai '+failed[0].name+'?':'Mau rencanakan semester depan?'}"</div><button onclick="ask('Tips perbaiki nilai D')" class="bg-sec text-p font-bold rounded-lg px-3 py-1.5">Tanya</button></div>`}
function vMatkul(){
 const n=latestSem(),r=risky(),all=semesters().flatMap(s=>s.c.map(c=>({...c,n:s.n})));
 let L=all.filter(c=>(filter==='all'||(filter==='now'&&c.n===n)||(filter==='fix'&&G[c.g]<2.5))&&(c.name.toLowerCase().includes(q.toLowerCase())));
 const grp=[...new Set(L.map(c=>c.n))].sort((a,b)=>b-a),tot=agg().sks,W=all.filter(c=>c.t==='W').reduce((a,c)=>a+c.sks,0),Pp=tot-W;
 const ch=(k,t,c)=>`<button onclick="filter='${k}';render()" class="shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${filter===k?'bg-p text-white':'bg-sc'}">${t} <span class="text-xs opacity-70">${c}</span></button>`;
 return`<div class="bg-white rounded-2xl px-4 py-3 flex items-center gap-2 shadow-sm mt-2">${ic('search')}<input id="q" value="${q}" oninput="q=this.value;render(true)" placeholder="Cari nama atau kode mata kuliah..." class="flex-1 outline-none text-sm bg-transparent"></div>
 <div class="flex gap-2 overflow-x-auto mt-3 pb-1">${ch('all','Semua',all.length)}${ch('now','Semester Ini',all.filter(c=>c.n===n).length)}${ch('fix','Perlu Perbaikan',all.filter(c=>G[c.g]<2.5).length)}</div>
 ${r.length?`<div class="bg-erc rounded-3xl p-5 mt-4"><div class="flex gap-3"><div class="w-11 h-11 rounded-full bg-ero text-white grid place-items-center shrink-0">${ic('warning')}</div><div><div class="font-bold text-lg">Perhatian Akademik</div><div class="text-xs text-ero">${r.length} mata kuliah berisiko menghambat kelulusan tepat waktu</div></div></div>
 ${r.map(c=>`<div class="bg-white rounded-2xl p-3 mt-3 text-sm"><div class="flex justify-between items-center"><b>${c.name}</b>${chip('Nilai '+c.g,'bg-erc text-ero')}</div><p class="text-ov mt-1.5">${G[c.g]<1.5?'Bisa menjadi prasyarat Skripsi/TA. Ambil SP atau ulangi di Semester '+(n+1)+'.':'Disarankan perbaikan untuk mengangkat IPK kumulatif.'} Naik ke B+ = <b>+${f((3.25-G[c.g])*c.sks/(agg().sks))}</b> IPK.</p></div>`).join('')}</div>`:''}
 ${grp.map(g=>`<div class="flex justify-between items-center mt-6 mb-2"><div class="font-bold text-lg">Semester ${g} ${g===n?chip('Terbaru','bg-sec text-p ml-1'):''}</div><div class="text-xs text-ov">${sem(semesterAt(g)).sks} SKS</div></div>
 ${L.filter(c=>c.n===g).map(c=>`<div class="bg-white rounded-2xl p-4 mb-2.5 shadow-sm flex items-center justify-between gap-2"><div class="min-w-0"><div class="font-bold truncate">${c.name}</div><div class="text-xs text-ov mt-1">${c.sks} SKS • ${c.t==='W'?'Wajib Prodi':'Pilihan'}</div></div><div class="text-right shrink-0"><div class="font-bold">${c.g} <span class="text-xs font-normal text-ov">(${f(G[c.g])})</span></div>${chip(G[c.g]<2?'Perlu Perbaikan':G[c.g]>=3.5?'Lulus':G[c.g]>=3?'Aman':'Cukup',gcol(c.g))}</div></div>`).join('')}`).join('')||'<p class="text-center text-ov mt-10">Tidak ada mata kuliah ditemukan.</p>'}
 <div class="bg-sc rounded-3xl p-5 mt-6"><div class="flex justify-between items-center"><div class="font-bold text-lg">${ic('leaderboard')} Rekapitulasi SKS Kelulusan</div>${chip('Target: '+CFG.total+' SKS','bg-p text-white')}</div>
 <div class="h-3 rounded-full bg-sec mt-4"><div class="h-full rounded-full bg-p" style="width:${Math.min(100,tot/CFG.total*100)}%"></div></div><div class="text-xs mt-2 text-ov">Progres: <b>${tot} / ${CFG.total} SKS</b> (${Math.round(tot/CFG.total*100)}%)</div>
 <div class="grid grid-cols-2 gap-3 mt-3"><div class="bg-white rounded-xl p-3"><div class="text-[10px] font-bold text-ov">SKS WAJIB</div><div class="text-2xl font-extrabold">${W}</div></div><div class="bg-white rounded-xl p-3"><div class="text-[10px] font-bold text-ov">SKS PILIHAN</div><div class="text-2xl font-extrabold text-se">${Pp}</div></div></div>
 <button onclick="prasyarat()" class="w-full mt-4 bg-pc text-white rounded-2xl py-4 font-bold">${ic('verified_user')} Cek Prasyarat Kelulusan</button></div>`}
function vSimulasi(){
 const s=st.sim,n=latestSem()+1,P=project(s.sks,s.ips,s.sp),a=agg(),sim=P.done-a.sks,left=Math.max(0,CFG.total-P.done),
  cards=[['AKSELERASI','bg-erc text-ero',7,'Butuh IPS rata-rata 3.75 di Sem '+n+' & ambil 24 SKS.',project(24,3.75,false).pOn],['STANDAR UTAMA','bg-white text-p',8,'Ambil 18–20 SKS Sem '+n+' (IPS 3.50) & skripsi fokus Sem '+(n+1)+'.',project(20,3.5,false).pOn]];
 return`<div class="mt-3"><span class="bg-sec text-se text-[11px] font-bold rounded-full px-3 py-1.5">${ic('insights')} ALGORITMA PREDIKSI KHS</span></div>
 <h1 class="mt-3 break-words text-2xl font-extrabold leading-tight text-p sm:text-[30px]">Simulasi Prediktor IPK & Kelulusan</h1><p class="text-sm text-ov mt-2">Atur rencana SKS dan target nilai semester mendatang untuk melihat estimasi waktu lulus dan IPK akhirmu.</p>
 <div class="flex justify-between mt-5 text-[11px] font-bold tracking-wider text-ov"><span>PILIHAN JALUR REKOMENDASI</span><button onclick="setS(${cards[1][2]===8?20:20},3.5,false)" class="text-se">${ic('touch_app')} Ketuk skenario</button></div>
 <div class="flex gap-3 overflow-x-auto mt-2 pb-1">${cards.map((c,i)=>`<button onclick="setS(${i?20:24},${i?3.5:3.75},false)" class="shrink-0 w-64 text-left rounded-2xl p-4 ${i?'bg-sec':'bg-sc'}"><span class="text-[10px] font-bold rounded-full px-2.5 py-1 ${c[1]}">${c[0]}</span><div class="text-2xl font-extrabold mt-3">${c[2]} Semester</div><div class="text-xs text-ov mt-1 h-8">${c[3]}</div><div class="bg-white/70 rounded-lg px-3 py-2 mt-3 flex justify-between text-xs font-bold"><span>PROBABILITAS</span><span>${c[4]}%</span></div></button>`).join('')}</div>
 <div class="bg-white rounded-3xl p-5 mt-4 shadow-sm"><div class="flex justify-between items-center"><div class="font-bold text-lg">${ic('tune')} Parameter Studi<div class="text-xs font-normal text-ov">Semester ${n} ${n%2?'Ganjil':'Genap'} 2026/2027</div></div><button onclick="setS(20,3.5,false)" class="text-se font-semibold text-sm">${ic('refresh')} Reset</button></div>
 <div class="flex justify-between items-center mt-5"><b class="text-sm">Beban SKS Semester ${n}</b><span class="bg-sc rounded-xl px-3 py-1.5 font-extrabold text-lg">${s.sks} <small class="text-xs">SKS</small></span></div>
 <input type="range" min="12" max="24" step="1" value="${s.sks}" oninput="st.sim.sks=+this.value;upd()"><div class="flex justify-between text-[11px] font-semibold text-ov"><span>12 (Min)</span><span>18 (Standar)</span><span>24 (Maks)</span></div>
 <div class="flex justify-between items-center mt-5"><b class="text-sm">Target Indeks Prestasi (IPS)</b><span class="bg-sc rounded-xl px-4 py-1.5 font-extrabold text-lg">${f(s.ips)}</span></div>
 <input type="range" min="2.5" max="4" step="0.05" value="${s.ips}" oninput="st.sim.ips=+this.value;upd()"><div class="flex justify-between text-[11px] font-semibold text-ov"><span>2.50 (Cukup)</span><span>3.25 (Memuaskan)</span><span>4.00 (Sempurna)</span></div>
 <label class="bg-sc rounded-2xl p-4 mt-5 flex items-center gap-3 cursor-pointer"><div class="w-10 h-10 rounded-xl bg-sec grid place-items-center">${ic('light_mode')}</div><div class="flex-1"><b class="text-sm">Ambil Semester Antara (SP)</b><div class="text-xs text-ov">Tambahan percepatan +6 SKS</div></div><input type="checkbox" ${s.sp?'checked':''} onchange="st.sim.sp=this.checked;upd()" class="w-6 h-6 accent-[#002820]"></label></div>
 <div class="bg-sc rounded-2xl p-4 mt-4"><div class="flex justify-between text-[11px] font-bold"><span>PROGRES KUMULATIF SKS</span>${chip(P.done+' / '+CFG.total+' SKS','bg-pc text-white')}</div>
 <div class="h-3 rounded-full bg-white mt-3 flex overflow-hidden"><i class="bg-p" style="width:${a.sks/CFG.total*100}%"></i><i class="bg-[#9fd4c3]" style="width:${sim/CFG.total*100}%"></i></div>
 <div class="flex justify-between text-[11px] mt-2 font-semibold"><span>● Lulus: ${a.sks}</span><span class="text-se">● Simulasi: +${sim}</span><span class="text-ov">● Sisa: ${left}</span></div></div>
 <div class="bg-white rounded-3xl p-5 mt-4 shadow-md border-t-4 border-[#9fd4c3]"><div class="flex justify-between items-center"><b class="text-sm text-se">${ic('task_alt')} HASIL PROYEKSI REAL-TIME</b>${chip('AKURASI '+P.acc+'%','bg-sec text-se')}</div>
 <div class="grid grid-cols-2 gap-3 mt-4"><div class="bg-sc rounded-2xl p-4"><div class="text-[10px] font-bold text-ov">PROYEKSI IPK AKHIR</div><div class="text-4xl font-extrabold mt-1">${f(P.ipk)} <small class="text-xs text-se">(${P.delta>=0?'+':''}${f(P.delta)})</small></div><div class="text-xs mt-1">${pred(P.ipk)}</div></div>
 <div class="bg-sec rounded-2xl p-4"><div class="text-[10px] font-bold text-se">WAKTU KELULUSAN</div><div class="text-xl font-extrabold mt-1">${P.when}</div><div class="text-xs font-bold mt-2">${ic('check_circle')} ${P.onTime?'Tepat Waktu':'Terlambat'} (Sem ${P.semLeft})</div></div></div>
 <div class="bg-sc rounded-2xl p-4 mt-3 text-sm flex gap-3"><span class="ms">lightbulb</span><p>Dengan mengambil ${s.sks} SKS di Sem ${n}${s.sp?' ditambah SP':''}, ${left>0?'Anda tinggal menyelesaikan '+left+' SKS di Semester '+(n+1)+(left>24?' dan seterusnya':'')+'. Peluang lulus tepat waktu '+P.pOn+'%.':'seluruh SKS kelulusan terpenuhi. Peluang lulus tepat waktu '+P.pOn+'%.'}</p></div>
 <button onclick="applyPlan()" class="w-full mt-4 bg-pc text-white rounded-2xl py-4 font-bold">${ic('event_available')} Terapkan Rencana Ini</button>
 <button onclick="ask('Kalau semester ${n} aku ambil ${s.sks} SKS dan ngulang Algoritma, IPK bisa naik ke berapa?')" class="w-full mt-2 bg-sc rounded-2xl py-4 font-bold">${ic('auto_awesome')} Konsultasikan ke Lulu AI</button></div>`}
const setS=(k,i,p)=>{st.sim={sks:k,ips:i,sp:p};save();render()};
function upd(){save();const y=scrollY;render();scrollTo(0,y)}
async function applyPlan(){const previous=st.plan;st.plan={...st.sim};if(!await save()){st.plan=previous;render();return}toast('Rencana diterapkan ke Ringkasan');go('ringkasan')}
function vChat(){
 if(!st.chat.length){
  const a=agg(),P=project(20,3.5,false),n=latestSem();
  const welcome=n
   ? `Halo ${NAME}! 👋 Aku Lulu, partner akademikmu. Dari KHS yang sudah kamu masukkan, IPK saat ini ${f(a.ipk)} dengan ${a.sks} SKS terselesaikan. Kita bisa membahas strategi semester berikutnya, mata kuliah yang perlu diperbaiki, sampai estimasi kelulusan.`
   : `Halo ${NAME}! 👋 Aku Lulu, partner akademikmu di CekLulus. Mulai dengan mengunggah KHS agar aku bisa membantu membaca progres akademik, menghitung IPK, menyusun target SKS, dan membuat rencana kelulusan yang lebih terarah.`;
  st.chat=[{r:'b',h:`${welcome}<div class="rounded-2xl bg-sc p-3 mt-3 text-xs"><b class="text-p">Yang bisa kita kerjakan bersama</b><div class="grid grid-cols-2 gap-2 mt-2"><span>✦ Analisis KHS & IPK</span><span>✦ Strategi perbaikan nilai</span><span>✦ Simulasi SKS semester depan</span><span>✦ Estimasi waktu kelulusan</span></div></div>`,t:tm()}];
 }
 const a=agg(),n=latestSem(),P=project(20,3.5,false),remaining=Math.max(0,CFG.total-a.sks),academic=curriculumAnalysis(semesters(),USER?.angkatan);
 const messages=st.chat.map(m=>m.r==='u'
  ? `<div class="flex flex-col items-end"><div class="max-w-[88%] rounded-2xl rounded-tr-md bg-p px-4 py-3 text-sm leading-6 text-white shadow-sm">${m.h}</div><small class="mt-1 pr-1 text-[11px] text-ov">${m.t}</small></div>`
  : `<div class="flex items-start gap-3"><div class="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sec text-p">${ic('auto_awesome')}</div><div class="min-w-0 max-w-[92%]"><div class="rounded-2xl rounded-tl-md border border-ol/50 bg-white p-4 text-sm leading-6 text-[#25332e] shadow-sm">${m.h}</div><small class="mt-1 block pl-1 text-[11px] text-ov">Lulu AI · ${m.t}</small></div></div>`).join('');
 return `
 <div class="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
  <section class="min-w-0 space-y-5">
   <div class="relative overflow-hidden rounded-[28px] bg-[#073d33] p-5 text-white shadow-lg sm:p-7">
    <div class="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-[#b9eada]/10 blur-3xl"></div>
    <div class="relative">
     <div class="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] font-extrabold tracking-[.16em] text-[#c9f3e5]"><span class="h-2 w-2 rounded-full bg-[#8de0bd]"></span LULU AI · ASISTEN AKADEMIK</div>
     <div class="mt-4 grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(220px,.9fr)] lg:items-end">
      <h1 class="min-w-0 break-words text-[clamp(1.8rem,4.2vw,2.65rem)] font-extrabold leading-[1.12] tracking-tight">Perjalanan menuju kelulusan dimulai dari percakapan.</h1>
      <div class="min-w-0 rounded-2xl border border-white/10 bg-white/[0.06] p-4"><p class="text-sm leading-6 text-white/80 sm:text-base">Tanyakan apa pun tentang KHS, IPK, SKS, mata kuliah, dan strategi studimu. Lulu membantu dengan mempertimbangkan data akademik yang tersimpan di akunmu.</p><p class="mt-3 text-[10px] font-bold tracking-wider text-[#b9eada]">ANALISIS AKADEMIK BERBASIS KHS & KURIKULUM</p></div>
     </div>
     <div class="mt-5 grid max-w-2xl grid-cols-1 gap-2 min-[420px]:grid-cols-3 sm:gap-3">
      <div class="min-w-0 rounded-2xl border border-white/10 bg-white/10 p-3"><div class="text-[10px] font-bold tracking-wider text-white/60">IPK SAAT INI</div><div class="mt-1 text-2xl font-extrabold sm:text-3xl">${f(a.ipk)}</div><div class="text-[10px] text-white/60">dari 4,00</div></div>
      <div class="min-w-0 rounded-2xl border border-white/10 bg-white/10 p-3"><div class="text-[10px] font-bold tracking-wider text-white/60">SKS SELESAI</div><div class="mt-1 text-2xl font-extrabold sm:text-3xl">${a.sks}</div><div class="text-[10px] text-white/60">dari ${CFG.total} SKS</div></div>
      <div class="min-w-0 rounded-2xl border border-white/10 bg-white/10 p-3"><div class="text-[10px] font-bold tracking-wider text-white/60">ANGKATAN / SEMESTER</div><div class="mt-1 break-words text-2xl font-extrabold sm:text-3xl">${USER?.angkatan||n||'—'}</div><div class="text-[10px] text-white/60">${USER?.angkatan?'tahun masuk':'semester terakhir tercatat'}</div></div>
     </div>
    </div>
   </div>

   <section class="overflow-hidden rounded-[28px] border border-ol/60 bg-white shadow-sm">
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-ol/50 px-4 py-4 sm:px-6">
     <div class="flex min-w-0 items-center gap-3">
      <div class="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-sec text-p">${ic('smart_toy')}</div>
      <div class="min-w-0"><div class="font-extrabold text-p">Ruang konsultasi Lulu</div><div class="mt-0.5 break-words text-xs text-ov">Konteks akademik: ${n?'Semester '+n+' · '+semesters().length+' semester tersimpan':'belum ada KHS tersimpan'} · ${CURRICULUM.length?'kurikulum aktif':'kurikulum belum diatur'}</div></div>
     </div>
     <div class="flex items-center gap-2 rounded-full bg-[#e8f7ef] px-3 py-1.5 text-[10px] font-bold text-[#176444]"><span class="h-2 w-2 rounded-full bg-[#21a66b]"></span> SIAP MEMBANTU</div>
    </div>
    <div id="msgs" aria-live="polite" class="max-h-[52vh] min-h-[300px] space-y-5 overflow-y-auto bg-[#f8fbf9] p-4 sm:p-6">${messages}
     ${AI_PENDING?'<div class="flex items-center gap-3"><div class="grid h-9 w-9 place-items-center rounded-xl bg-sec text-p">'+ic('auto_awesome')+'</div><div class="rounded-2xl rounded-tl-md border border-ol/50 bg-white px-4 py-3 text-sm text-ov shadow-sm"><span class="font-semibold text-p">Lulu sedang berpikir</span><span class="typing-dots ml-1">•••</span></div></div>':''}
    </div>
    <div class="border-t border-ol/50 bg-white p-4 sm:p-5">
     <div class="mb-3 flex flex-wrap gap-2">
      ${['Analisis IPK dan progresku','Bagaimana cara memperbaiki nilai?','Buat rencana SKS semester depan'].map((t,i)=>`<button onclick="ask('${t}')" class="rounded-full border border-ol/70 bg-white px-3 py-2 text-left text-xs font-semibold text-ov transition hover:border-[#8ac9b0] hover:bg-[#eef8f2] hover:text-p">${i===0?'✦ ':i===1?'↗ ':'▦ '}${t}</button>`).join('')}
     </div>
     <div class="flex items-end gap-2 rounded-[22px] border border-ol/70 bg-[#f7faf8] p-2 focus-within:border-[#579b7d] focus-within:ring-2 focus-within:ring-[#b9eada]/50">
      <button onclick="upModal()" title="Unggah KHS" aria-label="Unggah KHS" class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-p shadow-sm hover:bg-sec">${ic('attach_file')}</button>
      <textarea id="ci" rows="1" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();ask()}" placeholder="Tulis pertanyaan tentang perjalanan akademikmu..." class="max-h-32 min-h-10 flex-1 resize-y bg-transparent px-2 py-2.5 text-sm outline-none placeholder:text-[#87928c]" ${AI_PENDING?'disabled':''}></textarea>
      <button onclick="mic()" title="Gunakan suara" aria-label="Gunakan suara" class="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-ov hover:bg-white">${ic('mic')}</button>
      <button onclick="ask()" title="Kirim pesan" aria-label="Kirim pesan" class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-p text-white shadow-sm transition hover:bg-pc disabled:opacity-50" ${AI_PENDING?'disabled':''}>${ic('send')}</button>
     </div>
     <p class="mt-2 px-1 text-[10px] leading-4 text-ov">Lulu dapat membuat kesalahan. Gunakan informasi akademik resmi kampus untuk keputusan final. Tekan Enter untuk mengirim, Shift + Enter untuk baris baru.</p>
    </div>
   </section>
  </section>

  <aside class="space-y-4 lg:sticky lg:top-24">
   <section class="rounded-[24px] border border-ol/60 bg-white p-5 shadow-sm">
    <div class="flex items-center justify-between gap-2"><h2 class="font-extrabold text-p">Konteks akademikmu</h2><span class="rounded-full bg-sec px-2.5 py-1 text-[10px] font-bold text-se">PERSONAL</span></div>
    <p class="mt-1 text-xs leading-5 text-ov">Ringkasan yang dapat digunakan Lulu untuk memberi saran lebih relevan.</p>
    <div class="mt-4 space-y-2">
     <div class="flex items-center justify-between rounded-xl bg-[#f4f8f5] p-3"><span class="text-xs text-ov">Predikat IPK</span><b class="text-sm text-p">${a.sks?pred(a.ipk):'Belum tersedia'}</b></div>
     <div class="flex items-center justify-between gap-3 rounded-xl bg-[#f4f8f5] p-3"><span class="text-xs text-ov">Sisa SKS target</span><b class="shrink-0 text-sm text-p">${remaining} SKS</b></div>
     <div class="flex items-center justify-between gap-3 rounded-xl bg-[#f4f8f5] p-3"><span class="text-xs text-ov">Estimasi semester lulus</span><b class="shrink-0 text-right text-sm text-p">${academic?(academic.estimatedTerm||'Semester '+academic.estimatedSemester):'Menunggu kurikulum'}</b></div>
     <div class="flex items-center justify-between gap-3 rounded-xl bg-[#f4f8f5] p-3"><span class="text-xs text-ov">Mata kuliah wajib tuntas</span><b class="shrink-0 text-sm text-p">${academic?academic.completedRequired+'/'+academic.requiredCount:'—'}</b></div>
    </div>
    <p class="mt-3 text-[10px] leading-4 text-ov">${academic?'Estimasi dihitung dari kurikulum aktif, SKS, mata kuliah wajib yang belum tuntas, dan angkatan bila tersedia.':'Admin perlu mengimpor kurikulum Excel untuk mengaktifkan estimasi kelulusan berdasarkan daftar mata kuliah wajib.'} Estimasi bukan keputusan resmi kampus.</p>
    <button onclick="go('ringkasan')" class="mt-4 w-full rounded-xl border border-ol/70 py-3 text-sm font-bold text-p hover:bg-[#f4f8f5]">${ic('analytics')} Lihat ringkasan lengkap</button>
   </section>

   <section class="rounded-[24px] bg-[#e7f5ed] p-5">
    <div class="grid h-11 w-11 place-items-center rounded-2xl bg-white text-p">${ic('upload_file')}</div>
    <h2 class="mt-3 font-extrabold text-p">Mulai dari data KHS</h2>
    <p class="mt-1 text-xs leading-5 text-se">Unggah PDF KHS agar Lulu bisa memberi analisis yang sesuai dengan nilai dan mata kuliahmu.</p>
    <button onclick="upModal()" class="mt-4 w-full rounded-xl bg-p text-sm font-bold text-white py-3 hover:bg-pc">${ic('add')} Unggah KHS</button>
   </section>

   <section class="rounded-[24px] border border-ol/60 bg-white p-5 shadow-sm">
    <h2 class="font-extrabold text-p">Akses cepat</h2>
    <div class="mt-3 space-y-2">
     <button onclick="go('simulasi')" class="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-[#f4f8f5]"><span class="grid h-9 w-9 place-items-center rounded-xl bg-sec text-p">${ic('calculate')}</span><span><b class="block text-sm text-p">Simulasi kelulusan</b><small class="text-xs text-ov">Coba skenario IPS dan SKS</small></span></button>
     <button onclick="go('matkul')" class="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-[#f4f8f5]"><span class="grid h-9 w-9 place-items-center rounded-xl bg-sc text-p">${ic('menu_book')}</span><span><b class="block text-sm text-p">Data mata kuliah</b><small class="text-xs text-ov">Cari nilai dan mata kuliah berisiko</small></span></button>
     <button onclick="go('riwayat')" class="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-[#f4f8f5]"><span class="grid h-9 w-9 place-items-center rounded-xl bg-sc text-p">${ic('history')}</span><span><b class="block text-sm text-p">Riwayat akademik</b><small class="text-xs text-ov">Lihat data KHS tersimpan</small></span></button>
    </div>
   </section>
   <div class="rounded-2xl border border-[#d8e6de] bg-[#f4f8f5] p-4 text-xs leading-5 text-ov"><b class="text-p">Privasi percakapan</b><br>Lulu mengirim pertanyaan dan ringkasan akademik akunmu ke layanan AI untuk menghasilkan jawaban. Jangan masukkan kata sandi atau informasi sensitif.</div>
  </aside>
 </div>`;
}
const tm=()=>new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}).replace('.',':')+' WIB';
function mic(){const R=window.SpeechRecognition||window.webkitSpeechRecognition;if(!R)return toast('Suara tidak didukung browser ini');const r=new R();r.lang='id-ID';r.onresult=e=>{$('#ci').value=e.results[0][0].transcript};r.onerror=()=>toast('Mikrofon tidak bisa diakses');r.start()}

async function getAiAnswer(question){
  const currentSummary = {
    name: NAME,
    id: USER?.id || 'guest',
    role: USER?.role || 'student',
    angkatan: USER?.angkatan || null,
    cfg: { ...CFG },
    khs: { semesters: semesters().map(s => ({ semester: s.n, courses: s.c.map(c => ({ name: c.name, code: c.curriculumCode||c.code||'', sks: Number(c.sks) || 0, grade: c.g, type: c.t || 'W', curriculumStatus:c.curriculumStatus||'unknown', curriculumSemester:c.curriculumSemester||null })) })) },
    curriculum: CURRICULUM.map(course=>({code:course.code,name:course.name,semester:course.semester,sks:course.sks,category:course.category,prerequisite:course.prerequisite,notes:course.notes})),
    summary: {
      totalSks: agg().sks,
      ipk: agg().ipk,
      latestIps: latestIps(),
      risky: risky().slice(0, 10),
      graduationAnalysis: curriculumAnalysis(semesters(),USER?.angkatan)
    }
  };

  try {
    const response = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {}) },
      body: JSON.stringify({ message: question, student: currentSummary })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Backend AI mengembalikan kesalahan.');
    if (data && data.answer) return data.answer;
    throw new Error('Backend AI tidak mengembalikan jawaban.');
  } catch (error) {
    console.warn('AI backend unavailable, using local fallback:', error);
    return `AI Groq belum tersedia (${error.message}). Jawaban lokal sementara: ${fallbackReply(question)}`;
  }
}

async function ask(t){
  if(AI_PENDING)return;
  t=t??$('#ci')?.value;
  if(!t||!t.trim())return;
  const value=t.replace(/</g,'&lt;');
  st.chat.push({r:'u',h:value,t:tm()});
  save();
  tab='chat';
  AI_PENDING=true;
  render();
  try{
    const answer=await getAiAnswer(t);
    st.chat.push({r:'b',h:answer,t:tm()});
  }catch(error){
    console.error('Lulu AI gagal menjawab.',error);
    st.chat.push({r:'b',h:'Maaf, Lulu belum bisa memproses pertanyaan ini. Silakan coba kembali beberapa saat lagi.',t:tm()});
  }finally{
    AI_PENDING=false;
    save();
    render();
    const messages=$('#msgs');
    if(messages)messages.scrollTop=messages.scrollHeight;
  }
}

function fallbackReply(t){
 const l=t.toLowerCase(),a=agg(),n=latestSem(),ips=latestIps(),r=risky(),A=asd(),academic=curriculumAnalysis(semesters(),USER?.angkatan),m=l.match(/(\d+)\s*sks/),rem=academic?.remainingSks??Math.max(0,CFG.total-a.sks);
 if(/ulang|simulasi|kalau|jika/.test(l)&&m){const k=Math.min(30,+m[1]),ret=/ulang|algoritma/.test(l)&&A,gain=ret?A.sks*(3.25-G[A.g]):0,P=project(k,3.5,false,gain,ret?A.sks:0);
  return`<span class="text-[11px] font-bold bg-sec rounded px-2 py-1">SIMULASI KHS PREDIKTIF</span> <small>• Akurasi ${P.acc}%</small><p class="mt-3">Bisa, ${NAME}! 🎯 Skenario ${k} SKS${ret?' + mengulang '+A.name:''} dengan target IPS 3,50:</p>
  <div class="grid grid-cols-2 gap-2 my-3"><div class="bg-sc rounded-xl p-3"><div class="text-[10px] font-bold text-ov">PREDIKSI IPK</div><div class="text-3xl font-extrabold">${f(P.ipk)}</div></div><div class="bg-sc rounded-xl p-3"><div class="text-[10px] font-bold text-ov">LOMPATAN NILAI</div><div class="text-3xl font-extrabold text-se">+${f(P.delta)}</div><small>${ret?A.g+' → B+':'dibanding sekarang'}</small></div></div>
  ${ret?`<div class="bg-sc rounded-xl p-3">${ic('check_circle')} <b>${A.name}:</b> D (1,00) → B+ (3,25) menambah ${f(gain/a.sks)} poin IPK. Sisa ${k-A.sks} SKS perlu rata-rata minimal B+ (3,25) agar IPS 3,50.</div>`:''}
  ${k>=22?`<div class="bg-erc text-ero rounded-xl p-3 mt-2 text-xs">${ic('warning')} <b>Peringatan Beban Belajar:</b> ${k} SKS cukup intensif. Pastikan jadwal tidak bertabrakan dengan mata kuliah wajib lain.</div>`:''}
  <div class="mt-3 text-[11px] font-bold text-ov">AKSI CEPAT</div><div class="flex flex-wrap gap-2 mt-1"><button onclick="ask('Cek syarat skripsi')" class="bg-sec rounded-full px-3 py-1.5 text-xs font-semibold">Cek Syarat Skripsi</button><button onclick="ask('Hitung beban maksimal SKS')" class="bg-sec rounded-full px-3 py-1.5 text-xs font-semibold">Hitung Beban Maksimal</button></div>`}
 if(/sisa sks|sks sisa|berapa sks/.test(l))return`Kamu sudah menyelesaikan <b>${a.sks} SKS</b> dari ${CFG.total}. Sisa <b>${rem} SKS</b> — kira-kira ${Math.ceil(rem/cap(ips))} semester lagi dengan beban maksimal ${cap(ips)} SKS.`;
 if(/perbaiki|nilai d|remedial/.test(l))return r.length?`Mata kuliah yang paling berdampak:<ul class="list-disc ml-5 my-2">${r.map(c=>`<li><b>${c.name}</b> (${c.g}, ${c.sks} SKS, Sem ${c.n}) → B+ menaikkan IPK sekitar <b>+${f((3.25-G[c.g])*c.sks/a.sks)}</b></li>`).join('')}</ul>Ambil di semester reguler berikutnya atau SP, dan cek kebijakan nilai mengulang kampusmu.`:'Tidak ada nilai di bawah C. Kamu aman! 🎉';
 if(/skripsi|syarat|prasyarat/.test(l)){
  if(academic){
    const c=academic.thesisConditions;
    return `Pemeriksaan awal prasyarat skripsi dari kurikulum Excel:
    <div class="my-3 space-y-2">
     <div class="flex justify-between rounded-lg bg-sc p-2"><span>Minimal 75% SKS (${Math.ceil(CFG.total*.75)} SKS)</span><b>${c.sks75?'✅':'❌'}</b></div>
     <div class="flex justify-between rounded-lg bg-sc p-2"><span>IPK minimal 2,75 (sekarang ${f(academic.ipk)})</span><b>${c.ipk?'✅':'❌'}</b></div>
     <div class="flex justify-between rounded-lg bg-sc p-2"><span>Nilai D maksimal 1 mata kuliah</span><b>${c.maximumD?'✅':'❌'}</b></div>
     <div class="flex justify-between rounded-lg bg-sc p-2"><span>Praktik Kerja dan syarat >100 SKS</span><b>${c.practice?'✅':'❌'}</b></div>
    </div>
    ${Object.values(c).every(Boolean)?'Syarat terukur pada data KHS terlihat terpenuhi.':'Masih ada syarat terukur yang belum terpenuhi.'} Kelulusan tetap memerlukan verifikasi ujian proposal dan persetujuan kampus.`;
  }
  const ok=a.sks>=Math.ceil(CFG.total*.75)&&a.ipk>=2.75&&!(A&&G[A.g]<2);
  return `Kurikulum acuan belum tersedia. Saya hanya dapat memberi pemeriksaan sementara dari data umum: ${a.sks} SKS dan IPK ${f(a.ipk)}. Minta admin mengimpor kurikulum dan konfirmasi syarat skripsi ke program studi.`;
 }
 if(/maksimal|beban/.test(l)){return`Dengan IPS terakhir <b>${f(ips)}</b>, beban maksimal semester depan adalah <b>${cap(ips)} SKS</b> (≥3,00 → 24; 2,50–2,99 → 21; lainnya 18).`}
 if(/dosen/.test(l))return'Saya belum punya data dosen di kampusmu. Coba tanya DPA, atau lihat dosen yang sesuai peminatan topik skripsi. Saya bisa bantu menentukan topik dari nilai-nilai terkuatmu.';
 if(/ipk|peluang|lulus|prediksi/.test(l)){
  const P=project(20,3.5,false);
  return `IPK saat ini <b>${f(a.ipk)}</b> (${pred(a.ipk)}). ${academic?`Dari kurikulum dan KHS, estimasi penyelesaian sekitar <b>${academic.estimatedTerm||'Semester '+academic.estimatedSemester}</b>, dengan ${academic.remainingSks} SKS lulus masih perlu dipenuhi dan ${academic.missing.length} mata kuliah wajib belum tuntas.`:`Dengan skenario 20 SKS dan IPS 3,50 di semester depan, IPK simulasi menjadi <b>${f(P.ipk)}</b> dan prediksi waktu skenario ${P.when}.`} Tahun akademik hanya dapat dihitung bila tahun angkatan terisi.`;
 }
 return'Saya bisa bantu: <i>sisa SKS, tips perbaiki nilai D, cek syarat skripsi, beban maksimal SKS, atau simulasi</i> (contoh: “kalau semester depan aku ambil 22 SKS dan ngulang Algoritma, IPK jadi berapa?”).'
}
function vRiwayat(){
 const history=semesters(),a=agg(history),n=latestSem(),avg=history.length?history.reduce((x,s)=>x+sem(s).ips,0)/history.length:0;
 return`<div class="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div class="min-w-0"><div class="text-[10px] font-bold tracking-wider text-ov">ARSIP AKADEMIK</div><h1 class="mt-1 break-words text-2xl font-extrabold leading-tight text-p sm:text-[28px]">Riwayat Studi & Dokumen KHS</h1></div><button onclick="upModal()" class="w-full shrink-0 rounded-xl bg-p px-4 py-3 text-sm font-bold text-white sm:w-auto">${ic('upload_file')} Upload KHS</button></div>
 <p class="text-sm text-ov mt-2">Rekapitulasi transkrip per semester untuk audit kelulusan dan validasi prediktor IPK.</p>
 <div class="bg-sch rounded-3xl p-5 mt-4"><div class="flex justify-between items-center">${chip('● AUDIT PROGRES AKTIF','bg-sec text-se')}<b class="text-sm">Fase Akhir (${Math.round(a.sks/CFG.total*100)}%)</b></div>
 <div class="grid grid-cols-1 gap-3 mt-4 text-center min-[380px]:grid-cols-3"><div class="text-left"><div class="text-[10px] font-bold text-ov">SELESAI</div><div class="text-4xl font-extrabold">${n}</div><small>Semester</small></div><div class="text-left"><div class="text-[10px] font-bold text-ov">KREDIT LULUS</div><div class="text-4xl font-extrabold">${a.sks}</div><small>SKS Sah</small></div><div class="text-left"><div class="text-[10px] font-bold text-ov">RATA-RATA IPS</div><div class="text-4xl font-extrabold">${f(avg)}</div><small>Kumulatif</small></div></div></div>
 <div class="bg-sec/60 rounded-2xl p-4 mt-4 flex gap-3 items-center"><div class="w-11 h-11 rounded-xl bg-sec grid place-items-center">${ic('workspace_premium')}</div><div class="text-sm"><b>Kandidat Predikat ${pred(a.ipk)}</b><br>Pertahankan rata-rata IPS ≥ ${f(Math.max(3,a.ipk-.06))} di ${Math.max(0,8-n)} semester sisa.</div></div>
 <div class="flex justify-between mt-6 mb-2"><b class="text-lg">Daftar Semester</b><span class="text-[11px] font-bold text-se">TERBARU KE LAMA</span></div>
 ${[...history].reverse().map(s=>{const m=sem(s),bad=s.c.filter(c=>G[c.g]<2),o=open===s.n;
 return`<div class="bg-white rounded-3xl p-4 mb-3 shadow-sm"><button class="w-full flex items-center gap-3 text-left" onclick="open=${o?0:s.n};render()"><div class="w-11 h-11 rounded-xl grid place-items-center font-bold text-sm ${bad.length?'bg-erc text-ero':o?'bg-sec text-p':'bg-sc'}">S${s.n}</div><div class="flex-1"><b class="text-lg">Semester ${s.n}</b> <small class="text-ov">(${term(s.n)})</small><div class="text-sm"><b>IPS ${f(m.ips)}</b> • ${m.sks} SKS</div>${bad.length?chip('⚠ Ada nilai '+bad[0].g+' ('+bad[0].name+')','bg-erc text-ero'):chip(s.n===n?'✓ TERVERIFIKASI KHS RESMI':'✓ TERVERIFIKASI','bg-sec text-se')}</div>${ic(o?'expand_less':'expand_more')}</button>
 ${o?`<div class="mt-4 text-[10px] font-bold tracking-wider text-ov">RINCIAN MATA KULIAH & NILAI</div>${s.c.map(c=>`<div class="bg-sl rounded-xl p-3 mt-2 flex justify-between items-center"><div class="text-sm"><b>${c.name}</b><div class="text-xs text-ov">${c.sks} SKS • ${c.t==='W'?'Wajib':'Pilihan'}</div></div><span class="font-bold rounded-lg px-3 py-1.5 ${gcol(c.g)}">${c.g}</span></div>`).join('')}
 ${bad.length?`<div class="bg-erc text-ero rounded-xl p-3 mt-3 text-xs"><b>Catatan Perbaikan Studi</b><br>${bad.map(c=>c.name+' ('+c.sks+' SKS)').join(', ')} direkomendasikan diambil ulang di SP/semester berikutnya.</div>`:''}
 <div class="flex justify-end gap-2 mt-3"><button onclick="upModal(${s.n})" class="bg-sc rounded-xl px-4 py-2 text-sm font-semibold">${ic('edit')} Ubah</button></div>`:''}</div>`}).join('')}
 <div class="text-[10px] font-bold tracking-wider text-ov mt-6 mb-2">EKSPOR & KOLABORASI AKADEMIK</div>
 <button onclick="print()" class="w-full bg-p text-white rounded-2xl py-4 font-bold">${ic('download')} Unduh Transkrip Sementara (.PDF)</button>
 <button onclick="share()" class="w-full mt-2 bg-sch rounded-2xl py-4 font-bold">${ic('forward_to_inbox')} Bagikan Laporan Prediksi ke Dosen Wali</button>
 <p class="text-center text-xs text-ov mt-4">${ic('verified_user')} Data tersimpan di database CekLulus.</p>`}
function share(){const a=agg(),P=project(20,3.5,false),t=`Laporan CekLulus – ${NAME}\nIPK ${f(a.ipk)} | ${a.sks}/${CFG.total} SKS\nPeluang lulus tepat waktu: ${P.pOn}% (est. ${P.when})\nMata kuliah perlu perbaikan: ${risky().map(c=>c.name+' ('+c.g+')').join(', ')||'-'}`;
 if(navigator.share)navigator.share({title:'Laporan CekLulus',text:t}).catch(()=>{});else{try{navigator.clipboard.writeText(t);toast('Laporan disalin ke clipboard')}catch(e){toast('Tidak bisa menyalin')}}}
function prasyarat(){const a=agg(),A=asd(),ch=[['Total SKS ≥ '+CFG.total,a.sks>=CFG.total,a.sks+' / '+CFG.total],['IPK ≥ '+f(CFG.minIpk),a.ipk>=CFG.minIpk,f(a.ipk)],['Tidak ada nilai E',!st.sems.some(s=>s.c.some(c=>c.g==='E')),''],['Tidak ada nilai D/C- tersisa',risky().length===0,risky().length+' MK']];
 modal(`<b class="text-xl">Prasyarat Kelulusan</b>${ch.map(c=>`<div class="flex justify-between items-center bg-sc rounded-xl p-3 mt-2 text-sm"><span>${c[0]}</span><b class="${c[1]?'text-se':'text-er'}">${c[1]?'✓':'✗'} ${c[2]}</b></div>`).join('')}<button onclick="closeM()" class="w-full mt-4 bg-p text-white rounded-xl py-3 font-bold">Tutup</button>`)}
function cfgModal(){modal(`<b class="text-xl">Aturan Studi</b><p class="text-xs text-ov mb-3">Aturan ini berlaku untuk seluruh akun mahasiswa.</p>${[['total','Total SKS kelulusan',CFG.total],['maxSem','Batas masa studi (semester)',CFG.maxSem],['minIpk','IPK minimum lulus',CFG.minIpk]].map(x=>`<label class="block text-sm font-semibold mt-3">${x[1]}<input id="c_${x[0]}" type="number" step="any" value="${x[2]}" class="w-full bg-sc rounded-xl px-4 py-3 mt-1 font-normal"></label>`).join('')}
 <button onclick="(async()=>{CFG={total:+c_total.value||144,maxSem:+c_maxSem.value||14,minIpk:+c_minIpk.value||2};if(await saveCfg()){closeM();render();toast('Aturan studi diperbarui')}})()" class="w-full mt-4 bg-p text-white rounded-xl py-3 font-bold">Simpan Aturan</button>
 <button onclick="(async()=>{CFG={...DEFAULT_CFG};if(await saveCfg()){closeM();render();toast('Aturan default dipulihkan')}})()" class="w-full mt-2 bg-sc rounded-xl py-3 font-bold">Pulihkan Aturan Default</button>`)}
let draft=[],draftSemesters=null,draftFileName='',draftSemesterSource='manual',draftExplicitSemester=false;
function upModal(no){const n=no||latestSem()+1,ex=semesterAt(n);draft=ex?ex.c.map(c=>({...c})):[];draftSemesters=null;draftFileName='';draftSemesterSource='manual';draftExplicitSemester=false;drawUp(n)}
function drawUp(n){
  const multi=draftSemesters?.length>1;
  const groups=multi?draftSemesters:[];
  const singleGroup=multi?null:draftSemesters?.[0]||{n,c:draft};
  const courses=multi?groups.flatMap(group=>group.c||[]):singleGroup?.c||[];
  const matched=courses.filter(course=>course.curriculumStatus==='matched').length;
  const mismatched=courses.filter(course=>course.curriculumStatus==='semester-mismatch').length;
  const ambiguous=courses.filter(course=>course.curriculumStatus==='ambiguous').length;
  const unmatched=courses.filter(course=>!course.curriculumStatus||['unmatched','not-configured'].includes(course.curriculumStatus)).length;
  const courseCard=course=>{
    const status=course.curriculumStatus;
    const state=status==='matched'?['Cocok dengan kurikulum','bg-sec text-se']
      :status==='semester-mismatch'?['Semester berbeda dari Excel','bg-[#fff0d9] text-[#875b16]']
      :status==='ambiguous'?['Pencocokan ambigu','bg-[#fff0d9] text-[#875b16]']
      :['Tidak ditemukan di Excel','bg-erc text-ero'];
    return `<div class="rounded-xl bg-white p-3 text-sm">
      <div class="flex flex-wrap items-start justify-between gap-2"><b class="min-w-0 break-words">${escapeHTML(course.name)}</b><span class="shrink-0 rounded-lg px-2 py-1 font-bold ${gcol(course.g)}">${escapeHTML(course.g)}</span></div>
      <div class="mt-1 text-xs text-ov">${course.sks} SKS · ${course.curriculumCode||course.code?'Kode '+escapeHTML(course.curriculumCode||course.code):'Kode tidak terbaca'} · ${escapeHTML(course.curriculumCategory||'Kategori belum dipetakan')}</div>
      <div class="mt-2 inline-flex max-w-full rounded-full px-2.5 py-1 text-[10px] font-bold ${state[1]}">${state[0]}</div>
      ${course.curriculumSemester?`<div class="mt-1 text-[10px] text-ov">Semester acuan Excel: ${course.curriculumSemester}</div>`:''}
      ${course.curriculumPrerequisite&&!/^tidak ada$/i.test(course.curriculumPrerequisite)?`<div class="mt-2 break-words text-[11px] leading-4 text-ov">Prasyarat acuan: ${escapeHTML(course.curriculumPrerequisite)}</div>`:''}
    </div>`;
  };
  const semesterLabel=draftSemesterSource==='curriculum-match'
    ?'Semester hasil pencocokan Excel — mohon periksa kembali'
    :draftExplicitSemester?'Semester terdeteksi dari dokumen KHS':'Semester KHS — pilih atau koreksi jika diperlukan';
  modal(`<div class="flex flex-wrap items-start justify-between gap-3"><div class="min-w-0"><b class="text-xl">${multi?'Tambah beberapa semester':semesterAt(n)?'Ubah':'Tambah'} KHS</b><p class="mt-1 text-xs leading-5 text-ov">Data KHS dibaca, dicocokkan dengan kurikulum Excel, lalu divalidasi sebelum disimpan.</p></div><span class="shrink-0 rounded-full bg-sec px-3 py-1.5 text-[10px] font-bold text-se">TAHAP VERIFIKASI</span></div>
  ${CURRICULUM.length?`<div class="mt-3 rounded-xl bg-[#f4f8f5] p-3 text-xs text-se">Kurikulum aktif: ${CURRICULUM.length} mata kuliah · ${escapeHTML(CURRICULUM_META?.program||'Program studi')}</div>`:'<div class="mt-3 rounded-xl bg-[#fff0d9] p-3 text-xs text-[#875b16]">Kurikulum acuan belum tersedia. Hubungi admin untuk mengimpor file Excel.</div>'}
  ${multi?'<p class="mt-3 rounded-xl bg-[#f4f8f5] p-3 text-xs text-ov">Beberapa semester terbaca dari dokumen. Periksa pembagian semester dan hasil pencocokan di setiap kelompok.</p>':`<label class="mt-3 block text-sm font-semibold">${semesterLabel}<input id="u_n" type="number" min="1" max="14" value="${n}" class="mt-1 w-full rounded-xl border border-ol bg-sc px-4 py-3 font-normal"></label>`}
  <label class="mt-3 flex cursor-pointer items-center gap-2 rounded-xl bg-sc px-4 py-3 text-sm"><span class="shrink-0">${ic('attach_file')}</span><span id="u_f" class="min-w-0 flex-1 truncate">${escapeHTML(draftFileName||'Pilih KHS PDF atau gambar')}</span><input type="file" accept="application/pdf,.pdf,image/*" class="hidden" onchange="pv(this)"></label>
  <div id="u_p"></div>
  <div class="mt-3 rounded-2xl bg-sc p-3">
    <div class="flex flex-wrap items-center justify-between gap-2"><div class="text-[10px] font-bold tracking-wider text-ov">HASIL DETEKSI & VALIDASI</div><span class="text-[10px] font-bold text-ov">${courses.length} baris dibaca</span></div>
    ${CURRICULUM.length?`<div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
      <div class="rounded-xl bg-white p-3"><div class="text-[10px] text-ov">COCOK</div><b class="text-xl text-se">${matched}</b></div>
      <div class="rounded-xl bg-white p-3"><div class="text-[10px] text-ov">SEMESTER BEDA</div><b class="text-xl text-[#875b16]">${mismatched}</b></div>
      <div class="rounded-xl bg-white p-3"><div class="text-[10px] text-ov">AMBIGU</div><b class="text-xl text-[#875b16]">${ambiguous}</b></div>
      <div class="rounded-xl bg-white p-3"><div class="text-[10px] text-ov">TIDAK COCOK</div><b class="text-xl text-ero">${unmatched}</b></div>
    </div>`:''}
    ${multi?groups.map((group,index)=>`<section class="mt-4"><div class="mb-2 flex flex-wrap items-center justify-between gap-2"><label class="flex items-center gap-2 text-sm font-bold">Semester <input id="u_n_group_${index}" type="number" min="1" max="14" value="${group.n}" class="w-20 rounded-lg border border-ol bg-white px-2 py-1 font-normal"></label><span class="text-[10px] text-ov">${group.c.length} mata kuliah · ${group.semesterSource==='curriculum-match'?'hasil pencocokan Excel':'perlu diperiksa'}</span></div><div class="space-y-2">${group.c.map(courseCard).join('')}</div></section>`).join(''):courses.length?`<div class="mt-3 space-y-2">${courses.map(courseCard).join('')}</div>`:'<p class="mt-2 text-xs text-ov">Belum ada data terbaca. Pilih dokumen KHS untuk memulai.</p>'}
  </div>
  ${mismatched||ambiguous||unmatched?`<div class="mt-3 rounded-xl bg-[#fff7e6] p-3 text-xs leading-5 text-[#875b16]"><b>Perlu perhatian sebelum menyimpan.</b> Beberapa baris tidak cocok dengan acuan semester, ambigu, atau belum ada di Excel. Sistem mempertahankan data yang dibaca, tetapi tidak menganggapnya otomatis tervalidasi. Periksa kode/nama mata kuliah dan semester.</div>`:''}
  <button onclick="saveKHS()" ${courses.length?'':'disabled'} class="mt-4 w-full rounded-xl bg-p py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">Simpan KHS & Buat Analisis Akademik</button>
  <button onclick="closeM()" class="mt-2 w-full rounded-xl bg-white py-3 text-sm font-bold text-ov">Batal</button>`);
}
function normalizeGradeToken(v){const t=String(v||'').toUpperCase().replace(/\s+/g,'').replace(/PLUS/,'+').replace(/MINUS/,'-').replace(/\+/g,'+');return t.includes('A+')?'A+':t.includes('A-')?'A-':t.includes('B+')?'B+':t.includes('B-')?'B-':t.includes('C+')?'C+':t.includes('C-')?'C-':t.includes('A')?'A':t.includes('B')?'B':t.includes('C')?'C':t.includes('D')?'D':t.includes('E')?'E':null}
function normalizeKhsName(name){
  return String(name || '')
    .replace(/^[^A-Za-z0-9]+/, '')
    .replace(/^\s*\d{1,3}[.)]?\s*(?=[A-Za-z]\d{4,})/, '')
    .replace(/^\s*\d{1,3}[.)]?\s+/, '')
    .replace(/^[A-Za-z]{1,6}[-.]?\d{2,}/, ' ')
    .replace(/\b[A-Za-z]{1,6}[-.]?\d{2,}[A-Za-z]?\b/g, ' ')
    .replace(/\b\d{3,5}\b(?=\s+[A-Za-z])/g, ' ')
    .replace(/[\t\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b(?:semester|sks|ips|ipk|nilai|transkrip|khs|mata kuliah|matkul)\b/gi, ' ')
    .replace(/[:;|]+/g, ' ')
    .replace(/[^a-zA-Z0-9&/()\-.,\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[-–—]+$/, '')
    .trim();
}
function parseKhsText(rawText){
  const text = String(rawText || '')
    .replace(/\r/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/\|/g, ' ');
  if (!text.trim()) return [];

  const lines = text
    .split(/\n+|\t+/)
    .map(line => line.replace(/[;|]/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const matches = [];
  for (const line of lines) {
    if (!/[A-E](?:\+|-)?/i.test(line)) continue;

    let parsed = null;
    const p1 = line.match(/([A-Za-z0-9&/()\-., ]+?)\s+(\d{1,2})\s*(?:SKS)?\s*(A\+|A-|A|B\+|B-|B|C\+|C-|C|D|E)(?=$|\s)/i);
    if (p1) {
      parsed = { name: normalizeKhsName(p1[1]), sks: Number(p1[2]), g: normalizeGradeToken(p1[3]) };
    }
    if (!parsed) {
      const p2 = line.match(/([A-Za-z0-9&/()\-., ]+?)\s*(A\+|A-|A|B\+|B-|B|C\+|C-|C|D|E)(?=\s|$)\s*(\d{1,2})\s*(?:SKS)?/i);
      if (p2) {
        parsed = { name: normalizeKhsName(p2[1]), sks: Number(p2[3]), g: normalizeGradeToken(p2[2]) };
      }
    }
    if (!parsed) {
      const p3 = line.match(/(\d{1,2})\s*(?:SKS)?\s*([A-Za-z0-9&/()\-., ]+?)\s*(A\+|A-|A|B\+|B-|B|C\+|C-|C|D|E)(?=$|\s)/i);
      if (p3) {
        parsed = { name: normalizeKhsName(p3[2]), sks: Number(p3[1]), g: normalizeGradeToken(p3[3]) };
      }
    }
    if (!parsed) {
      const fallback = line.match(/([A-Za-z0-9&/()\-., ]+?)\s+(\d{1,2})\s*(?:SKS)?\s*[:\-]?\s*([A-E](?:\+|-)?)/i);
      if (fallback) {
        parsed = { name: normalizeKhsName(fallback[1]), sks: Number(fallback[2]), g: normalizeGradeToken(fallback[3]) };
      }
    }

    if (!parsed) continue;
    const { name, sks, g } = parsed;
    if (!name || !/[A-Za-z]/.test(name) || !g || !Number.isFinite(sks) || sks <= 0 || /^(?:semester|ips|ipk|nilai|sks|khs|transkrip)$/i.test(name)) continue;
    matches.push({ name, sks, g, t: 'W' });
  }

  const unique = [];
  const seen = new Set();
  for (const item of matches) {
    const key = `${item.name.toLowerCase()}-${item.sks}-${item.g}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }

  return unique;
}
async function extractPdfPageText(page){
  const content=await page.getTextContent(),rows=[];
  for(const item of content.items){
    const text=String(item.str||'').trim();if(!text)continue;
    const y=item.transform[5],x=item.transform[4];
    let row=rows.find(candidate=>Math.abs(candidate.y-y)<=4);
    if(!row){row={y,items:[]};rows.push(row)}
    row.items.push({x,text});
  }
  return rows.sort((a,b)=>b.y-a.y).map(row=>{
    row.items.sort((a,b)=>a.x-b.x);
    return row.items.map(item=>item.text).join(' ');
  }).join('\n');
}
async function extractKhsTableRows(page){
  const content=await page.getTextContent(),rows=[];
  for(const item of content.items){
    const text=String(item.str||'').trim();
    if(!text)continue;
    const x=item.transform[4],y=item.transform[5];
    let row=rows.find(candidate=>Math.abs(candidate.y-y)<=2);
    if(!row){row={y,items:[]};rows.push(row)}
    row.items.push({x,text});
  }
  const header=rows.find(row=>row.items.some(i=>/^Nama\s*MK$/i.test(i.text))&&row.items.some(i=>/^Sks$/i.test(i.text))&&row.items.some(i=>/^Nh$/i.test(i.text)));
  if(!header)return[];
  const headerX=label=>header.items.find(i=>new RegExp(`^${label}$`,'i').test(i.text))?.x;
  const nameX=headerX('Nama\\s*MK'),codeX=headerX('Kode'),sksX=headerX('Sks'),gradeX=headerX('Nh'),nameEndX=headerX('%Hadir')||headerX('Keaktifan')||sksX-20;
  if([nameX,sksX,gradeX].some(x=>!Number.isFinite(x)))return[];
  const found=[];
  for(const row of rows){
    if(row.y>=header.y)continue;
    const items=row.items.sort((a,b)=>a.x-b.x);
    const serial=items.find(i=>i.x<(codeX||nameX)-8&&/^\d{1,3}$/.test(i.text));
    const code=items.find(i=>i.x>=(codeX||nameX)-18&&i.x<nameX-8&&/^(?:[A-Za-z]{0,4}\d{4,}|\d{5,})$/.test(i.text));
    const name=items.filter(i=>i.x>=nameX-8&&i.x<nameEndX-5&&/[A-Za-z]/.test(i.text)).map(i=>i.text).join(' ');
    const sksItem=items.find(i=>i.x>=sksX-20&&i.x<gradeX-8&&/^\d{1,2}$/.test(i.text));
    const gradeItem=items.find(i=>i.x>=gradeX-12&&/^[A-E](?:\+|-)?$/i.test(i.text));
    const cleanName=normalizeKhsName(name);
    const sks=Number(sksItem?.text),g=normalizeGradeToken(gradeItem?.text);
    if(!serial||!code||!cleanName||!Number.isInteger(sks)||sks<1||sks>10||!g)continue;
    found.push({name:cleanName,code:code.text,curriculumCode:code.text,sks,g,t:'W'});
  }
  return mergeKhsDetections(found);
}
async function ocrPdfPage(page){
  const viewport=page.getViewport({scale:2}),canvas=document.createElement('canvas');
  canvas.width=viewport.width;canvas.height=viewport.height;
  const ctx=canvas.getContext('2d');
  await page.render({canvasContext:ctx,viewport}).promise;
  const result=await window.Tesseract.recognize(canvas,'eng+ind',{logger:()=>{}});
  return result.data.text;
}
function mergeKhsDetections(...groups){
  const merged=new Map();
  for(const group of groups){
    for(const item of group){
      const name=normalizeKhsName(item.name).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
      const sks=Number(item.sks),g=normalizeGradeToken(item.g);
      if(!name||!/[a-z]/.test(name)||!Number.isInteger(sks)||sks<1||!g)continue;
      const code=String(item.code||item.curriculumCode||'').trim();
      const key=code||`${name}-${sks}`;
      if(!merged.has(key))merged.set(key,{name:String(item.name).trim(),code,curriculumCode:code,sks,g,t:item.t||'W'});
    }
  }
  return [...merged.values()];
}
function parseKhsSemesterText(rawText,defaultSemester){
  let currentSemester=defaultSemester,hasSemesterHeadings=false;
  const groups=new Map();
  const lines=String(rawText||'').replace(/\r/g,'\n').replace(/\u00a0/g,' ').split(/\n+|\t+/);
  for(let line of lines){
    line=line.replace(/\s+/g,' ').trim();
    if(!line)continue;
    const heading=line.match(/^\s*(?:KHS\s+)?semester\s*(?:ke[- ]*)?[:#-]?\s*(1[0-4]|[1-9])\b/i);
    if(heading){
      currentSemester=Number(heading[1]);
      hasSemesterHeadings=true;
      line=line.replace(heading[0],' ').trim();
    }
    const courses=parseKhsText(line,currentSemester);
    if(!courses.length)continue;
    if(!groups.has(currentSemester))groups.set(currentSemester,[]);
    groups.get(currentSemester).push(...courses);
  }
  return{
    hasSemesterHeadings,
    semesters:[...groups.entries()].sort((a,b)=>a[0]-b[0]).map(([n,c])=>({n,c:mergeKhsDetections(c)}))
  };
}
function mergeKhsSemesterGroups(...sources){
  const groups=new Map();
  for(const source of sources){
    for(const semester of source){
      if(!groups.has(semester.n))groups.set(semester.n,[]);
      groups.get(semester.n).push(...semester.c);
    }
  }
  return [...groups.entries()].sort((a,b)=>a[0]-b[0])
    .map(([n,c])=>({n,c:mergeKhsDetections(c)}))
    .filter(semester=>semester.c.length);
}
async function detectKhsFile(file, semesterNumber = 1){
  if (!file) return {semesters:[]};
  try {
    if ((file.type || '').startsWith('image/')) {
      if(!window.Tesseract)throw new Error('OCR tidak tersedia untuk membaca gambar.');
      const { data } = await window.Tesseract.recognize(file, 'eng+ind', { logger: () => {} });
      const parsed=parseKhsSemesterText(data.text,semesterNumber);
      return {semesters:parsed.semesters.length?parsed.semesters:[{n:semesterNumber,c:parseKhsText(data.text)}],explicitSemester:parsed.hasSemesterHeadings};
    }
    if ((file.type || '').includes('pdf') || (file.name || '').toLowerCase().endsWith('.pdf')) {
      let backendMatches=[];
      try {
        const formData = new FormData();
        formData.append('file', file);
        const response = await fetch('/api/khs/parse', { method: 'POST', body: formData, headers: AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {} });
        if (response.ok) {
          const payload = await response.json();
          if (payload && Array.isArray(payload.detected)) backendMatches=payload.detected;
        }
      } catch (backendError) {
        console.warn('Backend KHS parser unavailable; using browser PDF parsing.', backendError);
      }

      if (!window.pdfjsLib) throw new Error('PDF.js gagal dimuat. Periksa koneksi internet lalu muat ulang aplikasi.');
      const pdfData = new Uint8Array(await file.arrayBuffer());
      const pdf = await window.pdfjsLib.getDocument({ data: pdfData }).promise;
      const structuredSemesters=[];
      const textPages=[],ocrPages=[];
      let currentSemester=semesterNumber,hasSemesterHeadings=false;
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const text=await extractPdfPageText(page);
        textPages.push(text);
        const heading=text.match(/(?:^|\n)\s*(?:KHS\s+)?semester\s*(?:ke[- ]*)?[:#-]?\s*(1[0-4]|[1-9])\b/im);
        if(heading){currentSemester=Number(heading[1]);hasSemesterHeadings=true;}
        const tableRows=await extractKhsTableRows(page);
        if(tableRows.length)structuredSemesters.push({n:currentSemester,c:tableRows});
        if(!tableRows.length&&window.Tesseract){
          ocrPages.push(await ocrPdfPage(page));
        }
      }
      if(structuredSemesters.length)return{semesters:mergeKhsSemesterGroups(structuredSemesters),explicitSemester:hasSemesterHeadings};
      const textResult=parseKhsSemesterText(textPages.join('\n'),semesterNumber);
      const ocrResult=parseKhsSemesterText(ocrPages.join('\n'),semesterNumber);
      let semesters=mergeKhsSemesterGroups(textResult.semesters,ocrResult.semesters);
      if(!textResult.hasSemesterHeadings&&!ocrResult.hasSemesterHeadings){
        semesters=mergeKhsSemesterGroups(semesters,[{n:semesterNumber,c:backendMatches}]);
      }else if(semesters.length===1){
        semesters=mergeKhsSemesterGroups(semesters,[{n:semesters[0].n,c:backendMatches}]);
      }
      return {semesters,explicitSemester:explicitSemester||hasSemesterHeadings};
    }
    if ((file.type || '').startsWith('text/') || (file.name || '').toLowerCase().endsWith('.txt')) {
      const parsed=parseKhsSemesterText(await file.text(),semesterNumber);
      return {semesters:parsed.semesters.length?parsed.semesters:[{n:semesterNumber,c:[]}],explicitSemester:parsed.hasSemesterHeadings};
    }
  } catch (error) {
    console.error(error);
    toast(error.message||'Gagal membaca PDF KHS.');
  }
  return {semesters:[]};
}
async function detectTextKHS(){
  const value = $('#u_raw')?.value || '';
  if (!value.trim()) {
    toast('Masukkan teks KHS atau upload file terlebih dahulu');
    return;
  }
  const detected = parseKhsText(value, +($('#u_n')?.value || 1));
  if (!detected.length) {
    toast('Format teks tidak terbaca. Coba gunakan contoh: Mata Kuliah 3 A-');
    return;
  }
  draft = detected;
  draftSemesters=null;
  drawUp(+($('#u_n')?.value || 1));
  toast('Data KHS berhasil dideteksi otomatis');
}
function pv(input){
  const file=input.files?.[0];if(!file)return;
  const semester=Number($('#u_n')?.value||latestSem()+1);
  const isPdf=(file.type||'').includes('pdf')||file.name.toLowerCase().endsWith('.pdf');
  const isImage=(file.type||'').startsWith('image/');
  if(!isPdf&&!isImage){toast('Pilih KHS PDF atau gambar JPG/PNG.');return}
  draftFileName=file.name;
  const label=$('#u_f');if(label)label.textContent=file.name;
  const preview=$('#u_p');if(preview)preview.innerHTML='<p class="mt-2 text-xs text-ov">Membaca dokumen, mengidentifikasi semester, lalu mencocokkan mata kuliah dengan kurikulum...</p>';
  detectKhsFile(file,semester).then(result=>{
    const count=(result.semesters||[]).reduce((total,group)=>total+(group.c||[]).length,0);
    if(!count){
      if(preview)preview.innerHTML='<p class="mt-2 rounded-xl bg-erc p-3 text-xs text-ero">Tidak ditemukan data mata kuliah yang bisa diverifikasi. Pastikan file jelas dan pilih semester secara manual jika dokumen tidak mencantumkan nomor semester.</p>';
      toast('Tidak ditemukan data mata kuliah di dokumen.');return;
    }
    const assigned=assignKhsSemesters(result.semesters,semester,Boolean(result.explicitSemester));
    const inferred=assigned.length===1&&assigned[0].semesterSource==='curriculum-match';
    draftExplicitSemester=Boolean(result.explicitSemester);
    draftSemesterSource=inferred?'curriculum-match':result.explicitSemester?'document':'manual-review';
    draftSemesters=assigned;
    draft=assigned.length===1?assigned[0].c:[];
    drawUp(assigned.length===1?assigned[0].n:semester);
    toast(`${count} mata kuliah dibaca dan ${inferred?'dicocokkan dengan semester kurikulum':'dikelompokkan untuk diverifikasi'}`);
  }).catch(error=>{
    console.error('Gagal membaca KHS.',error);
    if(preview)preview.innerHTML='<p class="mt-2 text-xs text-ero">Gagal membaca dokumen KHS.</p>';
    toast('Gagal membaca KHS. Coba file lain.');
  });
}
async function saveKHS(){
  const selectedSemester=Number($('#u_n')?.value);
  let groups=draftSemesters?.length?draftSemesters:[{n:selectedSemester,c:draft}];
  if(groups.length===1){
    if(!Number.isInteger(selectedSemester)||selectedSemester<1||selectedSemester>14)return toast('Semester harus antara 1 sampai 14.');
    groups=[{...groups[0],n:selectedSemester,c:(groups[0].c||[]).map(course=>tagCourseWithCurriculum(course,selectedSemester))}];
  }else{
    groups=groups.map((group,index)=>{
      const selected=Number(document.getElementById('u_n_group_'+index)?.value||group.n);
      return {...group,n:selected,c:(group.c||[]).map(course=>tagCourseWithCurriculum(course,selected))};
    });
  }
  if(!groups.length||groups.some(group=>!Number.isInteger(Number(group.n))||group.n<1||group.n>14||!group.c?.length||group.c.some(course=>!String(course.name||'').trim()||!Number.isInteger(Number(course.sks))||Number(course.sks)<1||!(course.g in G)))){
    return toast('Pastikan semester, nama mata kuliah, SKS, dan nilai valid sebelum menyimpan.');
  }
  const previous=st;
  st={...st,sems:[...st.sems]};
  for(const group of groups){
    const index=st.sems.findIndex(item=>Number(item.n)===Number(group.n));
    const courses=group.c.map(course=>({...course,sks:Number(course.sks)}));
    if(index<0)st.sems.push({n:Number(group.n),c:courses});
    else st.sems[index]={n:Number(group.n),c:courses};
  }
  st.sems.sort((x,y)=>x.n-y.n);st.plan=null;
  if(!await save()){st=previous;return}
  const analysis=curriculumAnalysis(semesters(),USER?.angkatan);
  const savedCourses=groups.reduce((sum,group)=>sum+group.c.length,0);
  const mapped=groups.reduce((sum,group)=>sum+group.c.filter(course=>course.curriculumStatus==='matched').length,0);
  const review=groups.reduce((sum,group)=>sum+group.c.filter(course=>['semester-mismatch','ambiguous','unmatched'].includes(course.curriculumStatus)).length,0);
  const message=analysis
    ? `KHS berhasil disimpan dan dianalisis. ${savedCourses} mata kuliah diproses; ${mapped} cocok dengan kurikulum dan ${review} perlu ditinjau. IPK ${f(analysis.ipk)}, total ${analysis.totalSks} SKS. ${analysis.estimatedTerm?'Dengan angkatan '+USER?.angkatan+', estimasi lulus: '+analysis.estimatedTerm+'.':'Estimasi sisa studi sekitar semester '+analysis.estimatedSemester+'. Isi tahun angkatan untuk melihat tahun akademik.'} ${analysis.missing.length} mata kuliah wajib belum tuntas teridentifikasi dan ${analysis.atRisk.length} nilai berada di bawah C.`
    : `KHS berhasil disimpan. IPK ${f(agg().ipk)}, total ${agg().sks} SKS. Admin belum mengaktifkan kurikulum Excel, jadi analisis prasyarat dan estimasi berdasarkan mata kuliah wajib belum tersedia.`;
  st.chat.push({r:'b',h:escapeHTML(message),t:tm()});
  if(!await save())toast('KHS tersimpan, tetapi ringkasan analisis belum berhasil disimpan.');
  closeM();go('chat');toast('KHS disimpan. Lulu menyiapkan analisis akademikmu.');
}
// ---------- render ----------
const TABS=[['chat','auto_awesome','LULU AI'],['ringkasan','dashboard','RINGKASAN'],['matkul','menu_book','MATA KULIAH'],['simulasi','calculate','SIMULASI'],['riwayat','history_edu','RIWAYAT']];
function escapeHTML(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
let ADMIN_STUDENTS=[];
function adminStudents(){return ADMIN_STUDENTS.map(u=>({...u,stats:agg(u.data?.sems||[])}))}
function adminToken(id){return btoa(encodeURIComponent(String(id)))}
function adminOpenStudent(token){
 let id;try{id=decodeURIComponent(atob(token))}catch(error){return}
 const user=ADMIN_STUDENTS.find(item=>item.id===id);
 if(!user)return toast('Akun mahasiswa tidak ditemukan');
 const history=user.data?.sems||[];
 const analysis=curriculumAnalysis(history,user.angkatan);
 const stats=agg(history);
 const risks=history.flatMap(group=>(group.c||[]).filter(course=>(G[course.g]??-1)<2).map(course=>({...course,semester:group.n})));
 const missing=analysis?.missing||[];
 modal(`<div class="flex items-start justify-between gap-3"><div class="min-w-0"><div class="text-[10px] font-bold tracking-wider text-se">ANALISIS AKADEMIK MAHASISWA</div><b class="mt-1 block break-words text-xl text-p">${escapeHTML(user.name)}</b><div class="mt-1 break-all text-xs text-ov">${escapeHTML(user.id)} · ${escapeHTML(user.prodi||'Program studi belum diisi')}</div><div class="mt-1 text-xs text-ov">${user.angkatan?'Angkatan '+user.angkatan:'Tahun angkatan belum diisi'}</div></div><button onclick="closeM()" aria-label="Tutup" class="shrink-0 rounded-lg bg-sc p-2">${ic('close')}</button></div>
 <div class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
  <div class="rounded-xl bg-sc p-3"><div class="text-[10px] text-ov">IPK</div><b class="text-2xl text-p">${f(stats.ipk)}</b></div>
  <div class="rounded-xl bg-sc p-3"><div class="text-[10px] text-ov">TOTAL SKS</div><b class="text-2xl text-p">${stats.sks}</b></div>
  <div class="rounded-xl bg-sc p-3"><div class="text-[10px] text-ov">SEMESTER TERAKHIR</div><b class="text-2xl text-p">${history.reduce((max,item)=>Math.max(max,Number(item.n)||0),0)||'—'}</b></div>
  <div class="rounded-xl bg-sec p-3"><div class="text-[10px] text-se">ESTIMASI SEMESTER LULUS</div><b class="text-xl text-p">${analysis?.estimatedSemester||'—'}</b></div>
 </div>
 ${analysis?`<section class="mt-4 rounded-2xl border border-ol/60 p-4"><div class="flex flex-wrap items-center justify-between gap-2"><b class="text-sm text-p">Prediksi kelulusan</b><span class="rounded-full bg-sec px-2.5 py-1 text-[10px] font-bold text-se">ESTIMASI</span></div><div class="mt-2 text-2xl font-extrabold text-p">${analysis.estimatedTerm||'Semester '+analysis.estimatedSemester}</div><p class="mt-1 text-xs leading-5 text-ov">Berdasarkan target ${CFG.total} SKS, beban rata-rata ${f(analysis.expectedLoad,1)} SKS per semester, dan mata kuliah wajib yang masih belum tuntas. Ini bukan tanggal kelulusan resmi.</p><div class="mt-3 h-2 overflow-hidden rounded-full bg-sc"><div class="h-full rounded-full bg-p" style="width:${analysis.progressPercent}%"></div></div><div class="mt-1 text-xs text-ov">${analysis.completedRequired} dari ${analysis.requiredCount} mata kuliah wajib teridentifikasi tuntas (${analysis.progressPercent}%)</div></section>`:''}
 ${analysis?.thesisConditions?`<section class="mt-3 rounded-2xl bg-[#f4f8f5] p-4"><b class="text-sm text-p">Pemeriksaan prasyarat skripsi dari Excel</b><div class="mt-3 space-y-2">${[['Minimal 75% SKS',analysis.thesisConditions.sks75],['IPK minimal 2,75',analysis.thesisConditions.ipk],['Nilai D maksimal 1 mata kuliah',analysis.thesisConditions.maximumD],['Praktik Kerja telah diambil',analysis.thesisConditions.practice]].map(item=>`<div class="flex items-center justify-between gap-3 text-xs"><span>${item[0]}</span><b class="${item[1]?'text-se':'text-ero'}">${item[1]?'Terpenuhi':'Belum terpenuhi'}</b></div>`).join('')}</div><p class="mt-3 text-[10px] leading-4 text-ov">Lulus ujian proposal tetap perlu diverifikasi admin karena tidak dapat dibuktikan hanya dari daftar nilai KHS.</p></section>`:''}
 ${missing.length?`<section class="mt-3 rounded-2xl border border-ol/60 p-4"><b class="text-sm text-p">Mata kuliah wajib belum tuntas</b><div class="mt-2 space-y-2">${missing.slice(0,10).map(item=>`<div class="flex items-start justify-between gap-3 rounded-xl bg-sc p-3 text-xs"><div class="min-w-0"><b class="block break-words">${escapeHTML(item.name)}</b><span class="text-ov">${escapeHTML(item.code)} · Semester acuan ${item.semester} · ${item.sks} SKS</span></div><span class="shrink-0 font-bold text-ero">${item.status}</span></div>`).join('')}${missing.length>10?`<p class="text-xs text-ov">Dan ${missing.length-10} mata kuliah wajib lainnya.</p>`:''}</div></section>`:'<p class="mt-3 rounded-xl bg-sec p-3 text-xs text-se">Seluruh mata kuliah wajib yang tercantum dalam kurikulum sudah teridentifikasi tuntas berdasarkan data KHS.</p>'}
 ${risks.length?`<section class="mt-3 rounded-2xl bg-erc p-4"><b class="text-sm text-ero">Nilai yang perlu ditinjau (${risks.length})</b><div class="mt-2 space-y-1 text-xs text-ero">${risks.slice(0,8).map(course=>`<div class="flex justify-between gap-2"><span class="break-words">${escapeHTML(course.name)} · Semester ${course.semester}</span><b class="shrink-0">${escapeHTML(course.g)}</b></div>`).join('')}</div></section>`:''}
 <div class="mt-5 flex items-center justify-between gap-3"><b class="text-sm text-p">Riwayat KHS</b><span class="text-[10px] text-ov">${history.length} semester tersimpan</span></div>
 ${history.length?[...history].sort((x,y)=>y.n-x.n).map(group=>{const result=sem(group);return`<section class="mt-2 rounded-xl bg-sc p-3"><div class="flex flex-wrap items-center justify-between gap-2"><b class="text-sm text-p">Semester ${group.n}</b><span class="text-xs text-ov">IPS ${f(result.ips)} · ${result.sks} SKS</span></div>${group.c.map(course=>`<div class="mt-2 flex items-start justify-between gap-3 border-t border-ol/50 pt-2 text-xs"><span class="min-w-0 break-words">${escapeHTML(course.name)} <small class="text-ov">${course.sks} SKS</small></span><b class="shrink-0 rounded-lg px-2 py-1 ${gcol(course.g)}">${escapeHTML(course.g)}</b></div>`).join('')}</section>`}).join(''):'<p class="mt-2 rounded-xl bg-sc p-4 text-sm text-ov">Mahasiswa belum mengunggah KHS.</p>'}
 <button onclick="closeM()" class="mt-4 w-full rounded-xl bg-p py-3 font-bold text-white">Tutup analisis</button>`);
}
function curriculumDiagnostics(courses=CURRICULUM){
 const codes={};courses.forEach(item=>{const code=String(item.code||'').trim();if(code)codes[code]=(codes[code]||0)+1});
 const duplicateCodes=Object.entries(codes).filter(([,count])=>count>1).map(([code])=>code);
 const names=new Set(courses.map(item=>normalizeCourseKey(item.name)));
 const unresolved=[...new Set(courses.map(item=>String(item.prerequisite||'').trim()).filter(value=>{
  if(!value||/^tidak ada$/i.test(value)||/^telah mengambil/i.test(value)||/^\\d/.test(value))return false;
  const parts=value.split(/,|\\bdan\\b|\\bor\\b/i).map(normalizeCourseKey).filter(Boolean);
  return parts.some(part=>!names.has(part));
 }))];
 return{duplicateCodes,unresolved};
}
function normalizeExcelHeader(value){
 return String(value||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
}
async function previewCurriculumExcel(input){
 const file=input?.files?.[0];if(!file)return;
 if(!window.XLSX){toast('Pembaca Excel belum termuat. Muat ulang halaman lalu coba lagi.');return}
 if(!/\\.(xlsx|xls)$/i.test(file.name)){toast('Pilih file Excel .xlsx atau .xls');return}
 try{
  const buffer=await file.arrayBuffer();
  const workbook=window.XLSX.read(buffer,{type:'array',cellDates:false});
  const sheetName=workbook.SheetNames[0];
  if(!sheetName)throw new Error('Workbook tidak memiliki sheet.');
  const sheet=workbook.Sheets[sheetName];
  const rows=window.XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:false});
  const headerIndex=rows.findIndex(row=>{
    const cells=row.map(normalizeExcelHeader);
    return cells.includes('semester')&&cells.some(value=>value==='kode mk'||value==='kode mata kuliah')&&cells.some(value=>value==='nama mk'||value==='nama mata kuliah')&&cells.includes('sks');
  });
  if(headerIndex<0)throw new Error('Header wajib tidak ditemukan. Diperlukan kolom semester, kode_mk, nama_mk, dan sks.');
  const headers=rows[headerIndex].map(normalizeExcelHeader);
  const findIndex=names=>headers.findIndex(value=>names.includes(value));
  const columns={
    semester:findIndex(['semester']),
    code:findIndex(['kode mk','kode mata kuliah']),
    name:findIndex(['nama mk','nama mata kuliah']),
    category:findIndex(['kategori','category']),
    sks:findIndex(['sks']),
    prerequisite:findIndex(['mata kuliah prasyarat','prasyarat','mata kuliah prasyarat pengambilan']),
    notes:findIndex(['keterangan catatan','keterangan','catatan','keterangan catatan tambahan'])
  };
  const courses=[],rowErrors=[];
  for(let r=headerIndex+1;r<rows.length;r++){
    const row=rows[r]||[];
    const name=String(row[columns.name]||'').trim();
    const code=String(row[columns.code]||'').trim();
    if(!name&&!code)continue;
    const semesterText=String(row[columns.semester]||'').trim();
    const semMatch=semesterText.match(/(1[0-4]|[1-9])/);
    const semester=Number(semMatch?.[1]||semesterText);
    const sks=Number(String(row[columns.sks]||'').replace(',','.'));
    if(!name||!Number.isInteger(semester)||semester<1||semester>14||!Number.isInteger(sks)||sks<1||sks>12){
      rowErrors.push(r+1);continue;
    }
    courses.push({
      semester,code,name,
      category:columns.category>=0?String(row[columns.category]||'').trim():'',
      sks,
      prerequisite:columns.prerequisite>=0?String(row[columns.prerequisite]||'').trim():'',
      notes:columns.notes>=0?String(row[columns.notes]||'').trim():''
    });
  }
  if(!courses.length)throw new Error('Tidak ada baris mata kuliah valid yang dapat diimpor.');
  const diagnostics=curriculumDiagnostics(courses);
  const contextRows=rows.slice(0,headerIndex).flat().map(value=>String(value||'').trim()).filter(Boolean);
  const program=contextRows.find(value=>/program studi/i.test(value))||'Program Studi belum diketahui';
  const institution=contextRows.find(value=>/universitas|uhamka/i.test(value))||'';
  CURRICULUM_DRAFT=courses;
  CURRICULUM_DRAFT_INFO={sourceFile:file.name,program,institution,sheet:sheetName,rowErrors,diagnostics};
  const preview=document.getElementById('curriculum-preview');
  if(preview)preview.innerHTML=`<div class="rounded-2xl border border-[#d8e6de] bg-[#f6faf7] p-4">
   <div class="flex flex-wrap items-center justify-between gap-2"><b class="text-sm text-p">Pratinjau impor berhasil dibaca</b><span class="rounded-full bg-sec px-2 py-1 text-[10px] font-bold text-se">${courses.length} MATA KULIAH</span></div>
   <p class="mt-1 break-words text-xs text-ov">${escapeHTML(file.name)} · Sheet: ${escapeHTML(sheetName)}</p>
   <div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3"><div class="rounded-xl bg-white p-3"><div class="text-[10px] text-ov">SEMESTER</div><b class="text-xl">${new Set(courses.map(course=>course.semester)).size}</b></div><div class="rounded-xl bg-white p-3"><div class="text-[10px] text-ov">TOTAL SKS DATA</div><b class="text-xl">${courses.reduce((sum,course)=>sum+course.sks,0)}</b></div><div class="rounded-xl bg-white p-3"><div class="text-[10px] text-ov">KODE GANDA</div><b class="text-xl">${diagnostics.duplicateCodes.length}</b></div></div>
   ${diagnostics.duplicateCodes.length?`<p class="mt-3 rounded-xl bg-[#fff7e6] p-3 text-xs text-[#875b16]"><b>Perlu ditinjau:</b> kode berulang ${diagnostics.duplicateCodes.map(escapeHTML).join(', ')}. Baris tidak dihapus; sistem tetap mempertahankan data sumber.</p>`:''}
   ${diagnostics.unresolved.length?`<p class="mt-2 rounded-xl bg-[#fff7e6] p-3 text-xs text-[#875b16]"><b>Prasyarat yang tidak cocok dengan nama mata kuliah di sheet:</b> ${diagnostics.unresolved.slice(0,6).map(escapeHTML).join('; ')}${diagnostics.unresolved.length>6?' dan lainnya':''}. Periksa kembali referensi ini sebelum dijadikan aturan final.</p>`:''}
   ${rowErrors.length?`<p class="mt-2 rounded-xl bg-erc p-3 text-xs text-ero">Baris dilewati karena format tidak valid: ${rowErrors.slice(0,12).join(', ')}${rowErrors.length>12?'…':''}.</p>`:''}
   <div class="mt-3 overflow-x-auto"><table class="w-full min-w-[520px] text-left text-xs"><thead><tr class="border-b border-ol text-ov"><th class="p-2">Semester</th><th class="p-2">Kode</th><th class="p-2">Mata Kuliah</th><th class="p-2">SKS</th><th class="p-2">Kategori</th></tr></thead><tbody>${courses.slice(0,6).map(course=>`<tr class="border-b border-ol/50"><td class="p-2">${course.semester}</td><td class="p-2">${escapeHTML(course.code)}</td><td class="p-2">${escapeHTML(course.name)}</td><td class="p-2">${course.sks}</td><td class="p-2">${escapeHTML(course.category)}</td></tr>`).join('')}</tbody></table></div>
  </div>`;
  const saveButton=document.getElementById('curriculum-import-button');
  if(saveButton)saveButton.disabled=rowErrors.length>0;
  toast('File Excel berhasil dibaca. Periksa peringatan sebelum menyimpan.');
 }catch(error){
  CURRICULUM_DRAFT=null;CURRICULUM_DRAFT_INFO=null;
  const preview=document.getElementById('curriculum-preview');
  if(preview)preview.innerHTML=`<p class="rounded-xl bg-erc p-3 text-sm text-ero">${escapeHTML(error.message)}</p>`;
  const saveButton=document.getElementById('curriculum-import-button');if(saveButton)saveButton.disabled=true;
 }
}
function importCurriculum(){
 if(!CURRICULUM_DRAFT?.length)return toast('Pilih dan baca file Excel terlebih dahulu.');
 modal(`<div class="flex items-start gap-3"><div class="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#fff0d9] text-[#875b16]">${ic('upload_file')}</div><div><b class="text-lg">Ganti kurikulum aktif?</b><p class="mt-2 text-sm text-ov">Data kurikulum saat ini akan digantikan oleh ${CURRICULUM_DRAFT.length} mata kuliah dari file ${escapeHTML(CURRICULUM_DRAFT_INFO.sourceFile)}. Data KHS mahasiswa tidak dihapus.</p></div></div>
 <div class="mt-5 grid grid-cols-2 gap-2"><button onclick="closeM()" class="rounded-xl bg-sc py-3 font-bold">Batal</button><button onclick="commitCurriculumImport()" class="rounded-xl bg-p py-3 font-bold text-white">Ya, impor data</button></div>`);
}
async function commitCurriculumImport(){
 try{
  const payload=await api('/api/admin/curriculum',{method:'POST',body:{
   courses:CURRICULUM_DRAFT,
   sourceFile:CURRICULUM_DRAFT_INFO.sourceFile,
   program:CURRICULUM_DRAFT_INFO.program,
   institution:CURRICULUM_DRAFT_INFO.institution,
   sheet:CURRICULUM_DRAFT_INFO.sheet
  }});
  closeM();CURRICULUM_DRAFT=null;CURRICULUM_DRAFT_INFO=null;
  await loadCurriculum();
  const result=await api('/api/admin/students');ADMIN_STUDENTS=result.students||[];
  render();toast(`Kurikulum disimpan: ${payload.meta.courseCount} mata kuliah`);
 }catch(error){toast('Impor gagal: '+error.message)}
}
async function saveStudentCohort(token){
 let id;try{id=decodeURIComponent(atob(token))}catch(error){return toast('Akun mahasiswa tidak valid.')}
 const input=document.getElementById('cohort_'+token);
 const angkatan=Number(input?.value);
 if(!Number.isInteger(angkatan)||angkatan<2000||angkatan>new Date().getFullYear())return toast('Masukkan tahun angkatan yang valid.');
 try{
  await api('/api/admin/students/'+encodeURIComponent(id)+'/angkatan',{method:'PUT',body:{angkatan}});
  const result=await api('/api/admin/students');ADMIN_STUDENTS=result.students||[];
  render();toast('Tahun angkatan berhasil disimpan.');
 }catch(error){toast('Gagal menyimpan angkatan: '+error.message)}
}
function vAdmin(){
 const list=adminStudents();
 const meta=CURRICULUM_META;
 const diagnostics=curriculumDiagnostics(CURRICULUM);
 const uploaded=!!(meta&&CURRICULUM.length);
 return `<div class="space-y-5 pb-6">
  <section class="rounded-3xl bg-pc p-5 text-white sm:p-6">
   <div class="text-[10px] font-bold tracking-[.18em] text-sec">PANEL ADMINISTRATOR</div>
   <h1 class="mt-2 text-3xl font-extrabold">Pusat data akademik</h1>
   <p class="mt-2 max-w-2xl text-sm leading-6 text-white/75">Kelola kurikulum acuan, periksa data KHS, dan pantau estimasi kelulusan mahasiswa berdasarkan riwayat akademik yang tersimpan.</p>
   <div class="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
    <div class="rounded-2xl bg-white/10 p-4"><div class="text-[10px] font-bold text-white/70">AKUN MAHASISWA</div><div class="mt-1 text-3xl font-extrabold">${list.length}</div></div>
    <div class="rounded-2xl bg-white/10 p-4"><div class="text-[10px] font-bold text-white/70">SUDAH ADA KHS</div><div class="mt-1 text-3xl font-extrabold">${list.filter(s=>s.data?.sems?.length).length}</div></div>
    <div class="col-span-2 rounded-2xl bg-white/10 p-4 sm:col-span-1"><div class="text-[10px] font-bold text-white/70">KURIKULUM AKTIF</div><div class="mt-1 text-3xl font-extrabold">${CURRICULUM.length||0}</div></div>
   </div>
  </section>

  <section class="rounded-3xl border border-ol/60 bg-white p-5 shadow-sm sm:p-6">
   <div class="flex flex-wrap items-start justify-between gap-3">
    <div class="min-w-0"><div class="text-[10px] font-bold tracking-wider text-se">MASTER DATA PROGRAM STUDI</div><h2 class="mt-1 text-xl font-extrabold text-p">Kurikulum & prasyarat mata kuliah</h2><p class="mt-1 text-sm leading-5 text-ov">File Excel menjadi acuan pencocokan nama mata kuliah, semester rekomendasi, SKS, dan prasyarat saat mahasiswa mengunggah KHS.</p></div>
    <span class="rounded-full ${uploaded?'bg-sec text-se':'bg-sc text-ov'} px-3 py-1.5 text-[10px] font-bold">${uploaded?'KURIKULUM AKTIF':'BELUM DIIMPOR'}</span>
   </div>
   ${meta?`<div class="mt-4 rounded-2xl bg-[#f4f8f5] p-4"><b class="block break-words text-sm text-p">${escapeHTML(meta.sourceFile||'File kurikulum')}</b><div class="mt-1 text-xs leading-5 text-ov">${escapeHTML(meta.program||'')} · ${escapeHTML(meta.sheet||'')} · ${CURRICULUM.length} mata kuliah · ${new Set(CURRICULUM.map(item=>item.semester)).size} semester</div><div class="mt-1 text-[10px] text-ov">Terakhir diperbarui: ${meta.importedAt?new Date(meta.importedAt).toLocaleString('id-ID'):'Tidak tercatat'}</div></div>`:''}
   ${diagnostics.duplicateCodes.length?`<p class="mt-3 rounded-xl bg-[#fff7e6] p-3 text-xs leading-5 text-[#875b16]"><b>Peringatan data sumber:</b> kode mata kuliah ganda: ${diagnostics.duplicateCodes.map(escapeHTML).join(', ')}. Data dipertahankan sesuai file Excel.</p>`:''}
   ${diagnostics.unresolved.length?`<p class="mt-2 rounded-xl bg-[#fff7e6] p-3 text-xs leading-5 text-[#875b16]"><b>Prasyarat untuk ditinjau:</b> ${diagnostics.unresolved.slice(0,5).map(escapeHTML).join('; ')}${diagnostics.unresolved.length>5?' dan lainnya':''}. Sistem tidak akan menebak mata kuliah pengganti.</p>`:''}
   <input id="curriculum_excel" type="file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" class="hidden" onchange="previewCurriculumExcel(this)">
   <div class="mt-4 flex flex-col gap-2 sm:flex-row"><button onclick="document.getElementById('curriculum_excel').click()" class="rounded-xl bg-p px-4 py-3 text-sm font-bold text-white">${ic('upload_file')} Pilih file Excel</button><button onclick="cfgModal()" class="rounded-xl bg-sc px-4 py-3 text-sm font-bold text-p">${ic('rule')} Aturan Studi</button></div>
   <div id="curriculum-preview" class="mt-4"></div>
   <button id="curriculum-import-button" onclick="importCurriculum()" disabled class="mt-3 w-full rounded-xl bg-pc py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">Tinjau & simpan kurikulum dari Excel</button>
  </section>

  <section>
   <div class="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h2 class="text-xl font-extrabold text-p">Monitoring mahasiswa</h2><p class="mt-1 text-xs text-ov">Estimasi kelulusan dihitung dari KHS, kurikulum aktif, beban SKS, dan tahun angkatan.</p></div><span class="rounded-full bg-sc px-3 py-1.5 text-xs font-bold text-ov">${list.length} akun</span></div>
   ${list.length?list.map(student=>{
    const history=student.data?.sems||[];
    const analysis=curriculumAnalysis(history,student.angkatan);
    const token=adminToken(student.id);
    const stats=student.stats;
    const latest=history.reduce((max,item)=>Math.max(max,Number(item.n)||0),0);
    return `<article class="mb-3 rounded-2xl border border-ol/60 bg-white p-4 shadow-sm sm:p-5">
     <div class="flex flex-wrap items-start justify-between gap-3"><div class="min-w-0"><b class="block break-words text-base text-p">${escapeHTML(student.name)}</b><div class="mt-1 break-all text-xs text-ov">${escapeHTML(student.id)}${student.prodi?' · '+escapeHTML(student.prodi):''}</div></div><span class="rounded-full ${history.length?'bg-sec text-se':'bg-sc text-ov'} px-2.5 py-1 text-[10px] font-bold">${history.length?'KHS tersimpan':'Belum ada KHS'}</span></div>
     <div class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"><div class="rounded-xl bg-[#f4f8f5] p-3"><div class="text-[10px] text-ov">SEMESTER AKTIF</div><b class="text-xl text-p">${latest||'—'}</b></div><div class="rounded-xl bg-[#f4f8f5] p-3"><div class="text-[10px] text-ov">TOTAL SKS</div><b class="text-xl text-p">${stats.sks}</b></div><div class="rounded-xl bg-[#f4f8f5] p-3"><div class="text-[10px] text-ov">IPK</div><b class="text-xl text-p">${f(stats.ipk)}</b></div><div class="rounded-xl bg-[#f4f8f5] p-3"><div class="text-[10px] text-ov">ESTIMASI LULUS</div><b class="text-base text-p">${analysis?(analysis.estimatedTerm||'Semester '+analysis.estimatedSemester):'Impor kurikulum'}</b></div></div>
     <div class="mt-3 rounded-xl border border-ol/60 p-3"><div class="flex flex-wrap items-center justify-between gap-2"><b class="text-xs text-p">Tahun angkatan</b><span class="text-[10px] text-ov">${student.angkatan?'Dasar estimasi tahun kalender':'Belum diisi'}</span></div><div class="mt-2 flex flex-wrap gap-2"><input id="cohort_${token}" type="number" min="2000" max="${new Date().getFullYear()}" value="${student.angkatan||''}" placeholder="Contoh: 2023" class="min-w-0 flex-1 rounded-lg border border-ol bg-white px-3 py-2 text-sm"><button onclick="saveStudentCohort('${token}')" class="rounded-lg bg-sc px-4 py-2 text-xs font-bold text-p">Simpan angkatan</button></div></div>
     ${analysis?`<div class="mt-3 flex flex-wrap items-center gap-2 text-xs"><span class="rounded-full bg-sec px-2.5 py-1 font-bold text-se">Kurikulum: ${analysis.completedRequired}/${analysis.requiredCount} wajib terpenuhi</span><span class="rounded-full ${analysis.missing.length?'bg-[#fff7e6] text-[#875b16]':'bg-sec text-se'} px-2.5 py-1 font-bold">${analysis.missing.length} wajib belum tuntas</span><span class="rounded-full ${analysis.atRisk.length?'bg-erc text-ero':'bg-sc text-ov'} px-2.5 py-1 font-bold">${analysis.atRisk.length} nilai berisiko</span></div>`:''}
     <button onclick="adminOpenStudent('${token}')" class="mt-3 w-full rounded-xl bg-p text-sm font-bold text-white py-3">${ic('analytics')} Buka analisis akademik lengkap</button>
    </article>`;
   }).join(''):'<p class="rounded-2xl bg-white p-5 text-sm text-ov">Belum ada akun mahasiswa terdaftar.</p>'}
  </section>
  <p class="pb-4 text-center text-[11px] leading-5 text-ov">Prediksi merupakan estimasi berbasis kurikulum dan riwayat KHS, bukan keputusan kelulusan resmi kampus.</p>
 </div>`;
}
function render(keep){const localFileWarning=location.protocol==='file:'?'<div class="bg-erc text-ero rounded-2xl p-3 mt-3 text-xs"><b>Penyimpanan browser tidak stabil.</b> Jangan buka index.html langsung. Jalankan <code>npm --prefix server start</code>, lalu buka <code>http://localhost:3001</code> dengan browser yang sama setiap kali.</div>':'';if(USER?.role==='admin'){$('#nav').innerHTML='';$('#app').innerHTML=localFileWarning+'<div class="max-w-2xl mx-auto">'+vAdmin()+'</div>';return}
 $('#nav').innerHTML=TABS.map(t=>`<button onclick="go('${t[0]}')" class="flex min-w-0 flex-col items-center gap-0.5 px-2 py-1.5 text-[10px] font-bold tracking-wide ${tab===t[0]?'text-p':'text-ov'}"><span class="ms ${tab===t[0]?'fill':''}">${t[1]}</span>${t[2]}</button>`).join('');
 const content={ringkasan:vRingkasan,matkul:vMatkul,simulasi:vSimulasi,chat:vChat,riwayat:vRiwayat}[tab]();
 $('#app').innerHTML=localFileWarning+(tab==='chat'?content:'<div class="max-w-4xl mx-auto">'+content+'</div>');
 if(keep){const e=$('#q');if(e){e.focus();e.setSelectionRange(q.length,q.length)}}}
// ---------- autentikasi dan data tersimpan di backend ----------
let USER=null,NAME='Alya',mode='login',authErr='',role='student';
const first=n=>(n||'').trim().split(/\s+/)[0]||'Mahasiswa';
const sha=async t=>{try{const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('ceklulus:'+t));return[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}catch(e){return btoa(unescape(encodeURIComponent(t)))}};
function shell(on){['hd','app'].forEach(i=>$('#'+i).classList.toggle('hidden',!on));$('nav').classList.toggle('hidden',!on||USER?.role==='admin');$('#auth').classList.toggle('hidden',on)}
function selectRole(next){role=next;mode='login';authErr='';render()}
function vAuth(){const reg=mode==='register',inp=(id,ic_,ph,t='text',x='')=>`<label class="flex items-center gap-3 bg-white rounded-2xl px-4 py-3.5 shadow-sm border border-ol/60 focus-within:border-p">${ic(ic_)}<input id="${id}" type="${t}" placeholder="${ph}" ${x} class="flex-1 outline-none text-sm bg-transparent min-w-0">${t==='password'?`<button type="button" onclick="const e=$('#${id}');e.type=e.type==='password'?'text':'password';this.firstChild.textContent=e.type==='password'?'visibility':'visibility_off'"><span class="ms">visibility</span></button>`:''}</label>`;
 return`<div class="relative overflow-hidden min-h-screen"><i class="blob w-64 h-64 bg-sec -top-16 -right-20 opacity-80"></i><i class="blob w-56 h-56 bg-pf -bottom-10 -left-16 opacity-70"></i>
 <div class="relative max-w-md mx-auto px-6 pt-14 pb-10">
 <div class="w-16 h-16 rounded-2xl bg-pc text-white grid place-items-center shadow-xl">${ic('school').replace('ms"','ms fill" style="font-size:34px"')}</div>
 <div class="mt-4 text-[11px] font-bold tracking-wider text-se">PREDIKTOR KHS & STUDI</div>
 <h1 class="text-[34px] leading-10 font-extrabold tracking-tight text-p mt-1">${reg?'Buat akun CekLulus':'Selamat datang kembali.'}</h1>
 <p class="text-sm text-ov mt-2">${reg?'Daftar untuk menyimpan KHS dan rencana studimu dengan aman.':'Masuk untuk melihat peluang lulusmu dan rencana semester depan.'}</p>
 <div class="bg-sc rounded-2xl p-1 grid grid-cols-2 mt-6 text-sm font-bold"><button onclick="selectRole('student')" class="rounded-xl py-2.5 ${role==='student'?'bg-white shadow text-p':'text-ov'}">Mahasiswa</button><button onclick="selectRole('admin')" class="rounded-xl py-2.5 ${role==='admin'?'bg-white shadow text-p':'text-ov'}">Admin</button></div>
 ${role==='student'?`<div class="bg-sc rounded-2xl p-1 grid grid-cols-2 mt-4 text-sm font-bold"><button onclick="mode='login';authErr='';render()" class="rounded-xl py-2.5 ${!reg?'bg-white shadow text-p':'text-ov'}">Masuk</button><button onclick="mode='register';authErr='';render()" class="rounded-xl py-2.5 ${reg?'bg-white shadow text-p':'text-ov'}">Daftar</button></div>`:''}
 <div class="space-y-3 mt-5">${reg?inp('a_name','person','Nama lengkap'):''}${inp('a_id','badge',role==='admin'?'ID admin':reg?'NIM':'NIM atau email','text','autocomplete="username"')}${reg?inp('a_prodi','apartment','Program studi (opsional)'):''}${reg?inp('a_angkatan','calendar_month','Tahun angkatan (opsional, mis. 2023)','number',`min="2000" max="${new Date().getFullYear()}" inputmode="numeric"`):''}${inp('a_pw','lock','Kata sandi','password','autocomplete="'+(reg?'new':'current')+'-password"')}${reg?inp('a_pw2','lock_reset','Ulangi kata sandi','password'):''}</div>
 ${authErr?`<div class="bg-erc text-ero rounded-xl px-4 py-3 text-sm mt-3">${ic('error')} ${authErr}</div>`:''}
 ${!reg?`<div class="flex justify-between items-center mt-4 text-sm"><label class="flex items-center gap-2"><input id="a_rem" type="checkbox" checked class="w-4 h-4 accent-[#002820]">Ingat sesi di perangkat ini</label><button onclick="forgot()" class="font-semibold text-se">Lupa sandi?</button></div>`:''}
 <button onclick="doAuth()" class="w-full mt-5 bg-p text-white rounded-2xl py-4 font-bold shadow-lg">${reg?'Daftar & Mulai':'Masuk'} ${ic('arrow_forward')}</button>
 ${role==='student'?`<div class="flex items-center gap-3 my-5 text-xs text-ov"><i class="flex-1 h-px bg-ol"></i>ATAU<i class="flex-1 h-px bg-ol"></i></div><button onclick="guest()" class="w-full bg-sc rounded-2xl py-4 font-bold">${ic('no_accounts')} Coba tanpa akun (data contoh)</button>`:''}
 <p class="text-center text-xs text-ov mt-6">${ic('verified_user').replace('class="ms"','class="ms" style="font-size:16px"')} Data akun dan akademik tersimpan aman di PostgreSQL.</p></div></div>`}
async function migrateLegacyAccount(id,password){
 let oldUsers=[];
 try{oldUsers=JSON.parse(localStorage.getItem('ceklulus_users')||'[]')}catch(error){console.error('Data akun lama tidak dapat dibaca.',error);return null}
 const oldUser=oldUsers.find(user=>String(user.id).toLowerCase()===id.toLowerCase());
 if(!oldUser||oldUser.h!==await sha(password))return null;
 const key='ceklulus_data_'+encodeURIComponent(String(oldUser.id));
 let oldState;
 try{oldState=JSON.parse(localStorage.getItem(key)||localStorage.getItem('ceklulus')||'null')}catch(error){throw new Error('Data lama di browser tidak dapat dibaca: '+error.message)}
 const response=await api('/api/auth/register',{method:'POST',body:{id:oldUser.id,name:oldUser.name,prodi:oldUser.prodi||'',password}});
 if(oldState&&Array.isArray(oldState.sems)){
  await api('/api/data',{method:'PUT',body:{data:{...oldState,sems:oldState.sems}}});
   response.data=oldState;
 }
 localStorage.removeItem(key);
 localStorage.removeItem('ceklulus');
 localStorage.setItem('ceklulus_users',JSON.stringify(oldUsers.filter(user=>user.id!==oldUser.id)));
 return response;
}
function setUser(response,remember=true){
 AUTH_TOKEN=response.token;
 try{
  localStorage.removeItem('ceklulus_token');sessionStorage.removeItem('ceklulus_token');
  (remember?localStorage:sessionStorage).setItem('ceklulus_token',AUTH_TOKEN);
 }catch(error){console.error('Gagal menyimpan kredensial sesi.',error);toast('Sesi tidak dapat disimpan di browser.')}
 USER={...response.user,role:response.user.role||'student'};
 st=response.data||{...seed(),sems:[]};
 CFG={...DEFAULT_CFG,...response.settings};
 NAME=first(USER.name);tab='chat';shell(true);
 $('#av').textContent=NAME[0].toUpperCase();
 if(USER.role==='admin')api('/api/admin/students').then(result=>{ADMIN_STUDENTS=result.students;render()}).catch(error=>{console.error('Gagal memuat daftar mahasiswa.',error);toast('Data mahasiswa gagal dimuat: '+error.message)});
 boot();
 loadCurriculum();
}
async function doAuth(){
 const g=i=>($('#'+i)?.value||'').trim(),id=g('a_id'),password=$('#a_pw').value;
 authErr='';
 if(!id||!password){authErr='Isi NIM/email dan kata sandi.';return render()}
 try{
  if(mode==='register'&&role==='student'){
   const name=g('a_name'),password2=$('#a_pw2').value,angkatan=g('a_angkatan');
   if(name.length<2)authErr='Nama lengkap minimal 2 karakter.';
   else if(password.length<8)authErr='Kata sandi minimal 8 karakter.';
   else if(password!==password2)authErr='Kata sandi tidak sama.';
   else if(angkatan&&(!Number.isInteger(+angkatan)||+angkatan<2000||+angkatan>new Date().getFullYear()))authErr='Tahun angkatan tidak valid.';
   if(authErr)return render();
   return setUser(await api('/api/auth/register',{method:'POST',body:{id,name,prodi:g('a_prodi'),angkatan:angkatan||null,password}}),true);
  }
  try{return setUser(await api('/api/auth/login',{method:'POST',body:{id,password}}),$('#a_rem')?.checked!==false)}
  catch(error){
   if(error.status===401&&role==='student'){
    const migrated=await migrateLegacyAccount(id,password);
    if(migrated)return setUser(migrated,true);
   }
   throw error;
  }
 }catch(error){authErr=error.message;render()}
}
async function guest(){try{setUser(await api('/api/auth/guest',{method:'POST',body:{}}),true)}catch(error){toast('Mode tamu gagal dibuat: '+error.message)}}
function forgot(){modal(`<b class="text-xl">Lupa kata sandi</b><p class="text-sm text-ov mt-2">Akun dan data akademik tersimpan di database. Hubungi administrator aplikasi untuk meminta pengaturan ulang kata sandi.</p><button onclick="closeM()" class="w-full mt-4 bg-p text-white rounded-xl py-3 font-bold">Tutup</button>`)}
function profile(){modal(`<div class="flex items-center gap-3"><div class="w-14 h-14 rounded-full bg-sec text-p text-2xl font-bold grid place-items-center">${escapeHTML(NAME[0])}</div><div><b class="text-lg">${escapeHTML(USER.name)}</b><div class="text-xs text-ov">${USER.role==='admin'?'Role: Admin':'Role: Mahasiswa'}${USER.guest?' · Mode tamu':' · '+escapeHTML(USER.id||'')}${USER.prodi?'<br>'+escapeHTML(USER.prodi):''}${USER.angkatan?'<br>Angkatan: '+escapeHTML(USER.angkatan):''}</div></div></div><button onclick="logout()" class="w-full mt-5 bg-p text-white rounded-xl py-3 font-bold">${ic('logout')} Keluar</button><button onclick="closeM()" class="w-full mt-2 bg-sc rounded-xl py-3 font-bold">Tutup</button>`)}
function logout(){try{localStorage.removeItem('ceklulus_token');sessionStorage.removeItem('ceklulus_token')}catch(error){console.error('Gagal membersihkan kredensial sesi.',error)}AUTH_TOKEN='';USER=null;CURRICULUM=[];CURRICULUM_META=null;role='student';mode='login';st=seed();closeM();boot()}
function boot(){if(!USER){shell(false);$('#auth').innerHTML=vAuth();return}role=USER.role;NAME=first(USER.name);shell(true);$('#av').textContent=NAME[0].toUpperCase();render()}
async function restoreSession(){
 if(!AUTH_TOKEN)return boot();
 try{setUser(await api('/api/auth/me'),Boolean(localStorage.getItem('ceklulus_token')))}
 catch(error){
  console.error('Gagal memulihkan sesi.',error);
  if(error.status===401){localStorage.removeItem('ceklulus_token');sessionStorage.removeItem('ceklulus_token');AUTH_TOKEN=''}
  authErr=error.status===401?'Sesi berakhir. Silakan masuk kembali.':'Database tidak dapat dihubungi: '+error.message;
  boot();
 }
}
render=(r=>function(k){if(!USER){$('#auth').innerHTML=vAuth();return}return r(k)})(render);
restoreSession();
