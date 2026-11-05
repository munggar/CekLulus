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
let tab='ringkasan',filter='all',q='',open=6;
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
function modal(h){$('#modal').innerHTML=`<div class="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center" onclick="if(event.target===this)closeM()"><div class="bg-white w-full max-w-xl rounded-t-3xl sm:rounded-3xl p-5 max-h-[88vh] overflow-y-auto">${h}</div></div>`}
const closeM=()=>$('#modal').innerHTML='';
const go=t=>{tab=t;render();scrollTo(0,0)};
const chip=(t,c)=>`<span class="text-[11px] font-bold px-2.5 py-1 rounded-full ${c}">${t}</span>`;
const gcol=g=>G[g]>=3.5?'bg-sec text-p':G[g]>=3?'bg-sc text-ov':G[g]>=2?'bg-sc text-ov':'bg-erc text-ero';
// ---------- layar ----------
function vRingkasan(){
 const history=semesters(),a=agg(history),n=latestSem(),last=history.at(-1),prev=agg(history.slice(0,-1)),failed=last?last.c.filter(c=>G[c.g]<2):[],
  pl=st.plan||{sks:20,ips:3.5,sp:false},P=project(pl.sks,pl.ips,pl.sp),
  result=history.length===0?['Belum Ada KHS','bg-sc text-ov']:failed.length?['Perlu Perbaikan','bg-erc text-ero']:['Lulus','bg-pf text-p'];
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
  <div class="rounded-2xl bg-sec p-4"><div class="text-[10px] font-bold tracking-wider text-se">TEPAT WAKTU</div><div class="text-3xl font-extrabold mt-2">${P.pOn}%</div><div class="h-1.5 rounded bg-white/60 mt-2"><div class="h-full rounded bg-p" style="width:${P.pOn}%"></div></div><div class="text-xs mt-2 text-se">Selesai di Semester ${P.semLeft}</div></div>
  <div class="rounded-2xl bg-sc p-4"><div class="text-[10px] font-bold tracking-wider text-ov">MAKS. BATAS</div><div class="text-3xl font-extrabold mt-2">${P.pMax}%</div><div class="text-xs mt-4 text-ov">Batas ${CFG.maxSem} semester ${P.pMax>90?'aman':'perlu dijaga'}</div></div>
  <div class="rounded-2xl ${result[1]} p-4"><div class="text-[10px] font-bold tracking-wider">STATUS KHS SEMESTER ${n||'-'}</div><div class="text-2xl font-extrabold mt-2">${result[0]}</div><div class="text-xs mt-2">${last?failed.length?failed.length+' mata kuliah di bawah C':'Semua '+last.c.length+' mata kuliah lulus (nilai ≥ C)':'Belum ada data KHS'}</div></div>
  <div class="rounded-2xl bg-sc p-4"><div class="text-[10px] font-bold tracking-wider text-ov">SKS TOTAL</div><div class="text-3xl font-extrabold mt-2">${a.sks}<span class="text-sm font-normal text-ov"> / ${CFG.total}</span></div><div class="text-xs mt-2 text-ov">Kurang ${Math.max(0,CFG.total-a.sks)} SKS lagi</div></div></div>
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
 <h1 class="text-[30px] leading-9 font-extrabold text-p mt-3">Simulasi Prediktor IPK & Kelulusan</h1><p class="text-sm text-ov mt-2">Atur rencana SKS dan target nilai semester mendatang untuk melihat estimasi waktu lulus dan IPK akhirmu.</p>
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
 if(!st.chat.length){const a=agg(),P=project(20,3.5,false),n=latestSem(),welcome=n?`Berdasarkan KHS Semester ${n} yang diunggah, IPK kamu sekarang <b>${f(a.ipk)}</b>. Peluang lulus tepat waktu di semester ${P.semLeft} mencapai <b class="text-se">${P.pOn}%</b>.`:'Unggah KHS semester mana pun untuk mulai melihat IPS, IPK, dan prediksi kelulusan.';st.chat=[{r:'b',h:`Halo ${NAME}! 👋 ${welcome}<div class="bg-sc rounded-xl px-3 py-2 my-2 text-xs">${ic('verified')} ${n?'KHS Terverifikasi • '+a.sks+' SKS Diselesaikan':'Belum ada KHS diunggah'}</div>Ada yang ingin kamu diskusikan tentang KRS semester depan atau mata kuliah berisiko?`,t:tm()}]}
 return`<div class="bg-sl rounded-3xl p-4 mt-2 flex items-center gap-3"><div class="w-14 h-14 rounded-full bg-sec grid place-items-center text-2xl">👩‍🏫</div><div class="flex-1"><b class="text-lg">Lulu AI Advisor</b> ${chip('● AKTIF','bg-sec text-se')}<div class="text-xs text-ov">Menganalisis KHS semester ${semesters().map(s=>s.n).join(', ')} milik ${NAME}</div></div></div>
 <div id="msgs" class="mt-4 space-y-4">${st.chat.map(m=>m.r==='u'?`<div class="flex flex-col items-end"><div class="bg-p text-white rounded-2xl rounded-tr-md px-4 py-3 text-sm max-w-[85%]">${m.h}</div><small class="text-[11px] text-ov mt-1">${m.t}</small></div>`:`<div class="flex gap-2"><div class="w-9 h-9 rounded-full bg-sec grid place-items-center shrink-0">${ic('smart_toy')}</div><div class="min-w-0"><div class="bg-white rounded-2xl rounded-tl-md p-4 text-sm shadow-sm">${m.h}</div><small class="text-[11px] text-ov mt-1 block">${m.t}</small></div></div>`).join('')}</div>
 <div class="flex gap-2 overflow-x-auto mt-5 pb-1">${['Berapa SKS sisa?','Tips perbaiki nilai D','Cek syarat skripsi','Hitung beban maksimal SKS','Rekomendasikan dosen pengampu'].map(t=>`<button onclick="ask('${t}')" class="shrink-0 bg-sc rounded-full px-4 py-2 text-sm font-semibold">${t}</button>`).join('')}</div>
 <div class="fixed left-0 right-0 bottom-[76px] px-5 z-30"><div class="max-w-xl mx-auto bg-white rounded-full shadow-lg px-3 py-2 flex items-center gap-2"><button onclick="upModal()" class="w-10 h-10 rounded-full bg-sc grid place-items-center">${ic('upload_file')}</button><input id="ci" onkeydown="if(event.key==='Enter')ask()" placeholder="Ketik pertanyaan akademik ke Lulu..." class="flex-1 outline-none text-sm min-w-0"><button onclick="mic()">${ic('mic')}</button><button onclick="ask()" class="w-11 h-11 rounded-full bg-p text-white grid place-items-center">${ic('send')}</button></div></div><div class="h-16"></div>`}
const tm=()=>new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}).replace('.',':')+' WIB';
function mic(){const R=window.SpeechRecognition||window.webkitSpeechRecognition;if(!R)return toast('Suara tidak didukung browser ini');const r=new R();r.lang='id-ID';r.onresult=e=>{$('#ci').value=e.results[0][0].transcript};r.onerror=()=>toast('Mikrofon tidak bisa diakses');r.start()}

async function getAiAnswer(question){
  const currentSummary = {
    name: NAME,
    id: USER?.id || 'guest',
    role: USER?.role || 'student',
    cfg: { ...CFG },
    khs: { semesters: semesters().map(s => ({ semester: s.n, courses: s.c.map(c => ({ name: c.name, sks: Number(c.sks) || 0, grade: c.g, type: c.t || 'W' })) })) },
    summary: {
      totalSks: agg().sks,
      ipk: agg().ipk,
      latestIps: latestIps(),
      risky: risky().slice(0, 10)
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
  t=t??$('#ci')?.value;
  if(!t||!t.trim())return;
  const value=t.replace(/</g,'&lt;');
  st.chat.push({r:'u',h:value,t:tm()});
  save();
  tab='chat';
  render();
  const answer = await getAiAnswer(t);
  st.chat.push({r:'b',h:answer,t:tm()});
  save();
  render();
  setTimeout(()=>scrollTo(0,document.body.scrollHeight),50);
}

function fallbackReply(t){
 const l=t.toLowerCase(),a=agg(),n=latestSem(),ips=latestIps(),r=risky(),A=asd(),m=l.match(/(\d+)\s*sks/),rem=Math.max(0,CFG.total-a.sks);
 if(/ulang|simulasi|kalau|jika/.test(l)&&m){const k=Math.min(30,+m[1]),ret=/ulang|algoritma/.test(l)&&A,gain=ret?A.sks*(3.25-G[A.g]):0,P=project(k,3.5,false,gain,ret?A.sks:0);
  return`<span class="text-[11px] font-bold bg-sec rounded px-2 py-1">SIMULASI KHS PREDIKTIF</span> <small>• Akurasi ${P.acc}%</small><p class="mt-3">Bisa, ${NAME}! 🎯 Skenario ${k} SKS${ret?' + mengulang '+A.name:''} dengan target IPS 3,50:</p>
  <div class="grid grid-cols-2 gap-2 my-3"><div class="bg-sc rounded-xl p-3"><div class="text-[10px] font-bold text-ov">PREDIKSI IPK</div><div class="text-3xl font-extrabold">${f(P.ipk)}</div></div><div class="bg-sc rounded-xl p-3"><div class="text-[10px] font-bold text-ov">LOMPATAN NILAI</div><div class="text-3xl font-extrabold text-se">+${f(P.delta)}</div><small>${ret?A.g+' → B+':'dibanding sekarang'}</small></div></div>
  ${ret?`<div class="bg-sc rounded-xl p-3">${ic('check_circle')} <b>${A.name}:</b> D (1,00) → B+ (3,25) menambah ${f(gain/a.sks)} poin IPK. Sisa ${k-A.sks} SKS perlu rata-rata minimal B+ (3,25) agar IPS 3,50.</div>`:''}
  ${k>=22?`<div class="bg-erc text-ero rounded-xl p-3 mt-2 text-xs">${ic('warning')} <b>Peringatan Beban Belajar:</b> ${k} SKS cukup intensif. Pastikan jadwal tidak bertabrakan dengan mata kuliah wajib lain.</div>`:''}
  <div class="mt-3 text-[11px] font-bold text-ov">AKSI CEPAT</div><div class="flex flex-wrap gap-2 mt-1"><button onclick="ask('Cek syarat skripsi')" class="bg-sec rounded-full px-3 py-1.5 text-xs font-semibold">Cek Syarat Skripsi</button><button onclick="ask('Hitung beban maksimal SKS')" class="bg-sec rounded-full px-3 py-1.5 text-xs font-semibold">Hitung Beban Maksimal</button></div>`}
 if(/sisa sks|sks sisa|berapa sks/.test(l))return`Kamu sudah menyelesaikan <b>${a.sks} SKS</b> dari ${CFG.total}. Sisa <b>${rem} SKS</b> — kira-kira ${Math.ceil(rem/cap(ips))} semester lagi dengan beban maksimal ${cap(ips)} SKS.`;
 if(/perbaiki|nilai d|remedial/.test(l))return r.length?`Mata kuliah yang paling berdampak:<ul class="list-disc ml-5 my-2">${r.map(c=>`<li><b>${c.name}</b> (${c.g}, ${c.sks} SKS, Sem ${c.n}) → B+ menaikkan IPK sekitar <b>+${f((3.25-G[c.g])*c.sks/a.sks)}</b></li>`).join('')}</ul>Ambil di semester reguler berikutnya atau SP, dan cek kebijakan nilai mengulang kampusmu.`:'Tidak ada nilai di bawah C. Kamu aman! 🎉';
 if(/skripsi|syarat|prasyarat/.test(l)){const ok=a.sks>=110&&!(A&&G[A.g]<2);return`Cek syarat skripsi: SKS ≥ 110 ${a.sks>=110?'✅':'❌'} (${a.sks}); IPK ≥ ${CFG.minIpk} ${a.ipk>=CFG.minIpk?'✅':'❌'}; tanpa nilai D pada mata kuliah prasyarat ${A&&G[A.g]<2?'❌ ('+A.name+')':'✅'}. ${ok?'Kamu memenuhi syarat.':'Perbaiki dulu nilai prasyarat tersebut.'} <i class="text-xs">(Aturan kelulusan ditetapkan Admin.)</i>`}
 if(/maksimal|beban/.test(l)){return`Dengan IPS terakhir <b>${f(ips)}</b>, beban maksimal semester depan adalah <b>${cap(ips)} SKS</b> (≥3,00 → 24; 2,50–2,99 → 21; lainnya 18).`}
 if(/dosen/.test(l))return'Saya belum punya data dosen di kampusmu. Coba tanya DPA, atau lihat dosen yang sesuai peminatan topik skripsi. Saya bisa bantu menentukan topik dari nilai-nilai terkuatmu.';
 if(/ipk|peluang|lulus|prediksi/.test(l)){const P=project(20,3.5,false);return`IPK-mu <b>${f(a.ipk)}</b> (${pred(a.ipk)}). Dengan 20 SKS & IPS 3,50 di semester depan, proyeksi IPK akhir <b>${f(P.ipk)}</b>, lulus <b>${P.when}</b>. Peluang tepat waktu <b class="text-se">${P.pOn}%</b>, batas maksimal ${P.pMax}%.`}
 return'Saya bisa bantu: <i>sisa SKS, tips perbaiki nilai D, cek syarat skripsi, beban maksimal SKS, atau simulasi</i> (contoh: “kalau semester depan aku ambil 22 SKS dan ngulang Algoritma, IPK jadi berapa?”).'
}
function vRiwayat(){
 const history=semesters(),a=agg(history),n=latestSem(),avg=history.length?history.reduce((x,s)=>x+sem(s).ips,0)/history.length:0;
 return`<div class="flex justify-between items-start mt-3 gap-3"><div><div class="text-[10px] font-bold tracking-wider text-ov">ARSIP AKADEMIK</div><h1 class="text-[28px] leading-8 font-extrabold text-p mt-1">Riwayat Studi & Dokumen KHS</h1></div><button onclick="upModal()" class="bg-p text-white rounded-xl px-4 py-3 font-bold text-sm shrink-0">${ic('upload_file')} Upload KHS</button></div>
 <p class="text-sm text-ov mt-2">Rekapitulasi transkrip per semester untuk audit kelulusan dan validasi prediktor IPK.</p>
 <div class="bg-sch rounded-3xl p-5 mt-4"><div class="flex justify-between items-center">${chip('● AUDIT PROGRES AKTIF','bg-sec text-se')}<b class="text-sm">Fase Akhir (${Math.round(a.sks/CFG.total*100)}%)</b></div>
 <div class="grid grid-cols-3 mt-4 text-center"><div class="text-left"><div class="text-[10px] font-bold text-ov">SELESAI</div><div class="text-4xl font-extrabold">${n}</div><small>Semester</small></div><div class="text-left"><div class="text-[10px] font-bold text-ov">KREDIT LULUS</div><div class="text-4xl font-extrabold">${a.sks}</div><small>SKS Sah</small></div><div class="text-left"><div class="text-[10px] font-bold text-ov">RATA-RATA IPS</div><div class="text-4xl font-extrabold">${f(avg)}</div><small>Kumulatif</small></div></div></div>
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
let draft=[],draftSemesters=null,draftFileName='';
function upModal(no){const n=no||latestSem()+1,ex=semesterAt(n);draft=ex?ex.c.map(c=>({...c})):[];draftSemesters=null;draftFileName='';drawUp(n)}
function drawUp(n){
  const multi=draftSemesters?.length>1;
  const groups=multi?draftSemesters:[];
  modal(`<b class="text-xl">${multi?'Tambah beberapa semester':semesterAt(n)?'Ubah':'Tambah'} KHS</b>
  <p class="text-xs text-ov mt-1">Upload file KHS PDF saja. Sistem akan membaca data mata kuliah dan nilai secara otomatis.</p>
  ${multi?'<p class="text-xs text-se mt-2">Beberapa semester terdeteksi. Periksa pembagian di bawah; sistem akan menyimpannya ke semester masing-masing.</p>':''}
  ${multi?'':`<label class="block mt-3 text-sm font-semibold">Semester<input id="u_n" type="number" min="1" max="14" value="${n}" class="w-full bg-sc rounded-xl px-4 py-3 mt-1 font-normal"></label>`}
  <label class="mt-3 flex items-center gap-2 bg-sc rounded-xl px-4 py-3 text-sm cursor-pointer">${ic('attach_file')}<span id="u_f" class="truncate">${draftFileName||'Pilih KHS PDF'}</span><input type="file" accept="application/pdf,.pdf" class="hidden" onchange="pv(this)"></label>
  <div id="u_p"></div>
  <div class="mt-3 bg-sc rounded-2xl p-3">
    <div class="text-[10px] font-bold tracking-wider text-ov">HASIL DETEKSI KHS</div>
    ${multi?groups.map(group=>`<section class="mt-3"><b class="text-sm">Semester ${group.n} · ${group.c.length} mata kuliah</b><div class="mt-2 space-y-2">${group.c.map(c=>`<div class="bg-white rounded-xl p-3 text-sm"><div class="flex justify-between items-center"><b>${c.name}</b><span class="font-bold ${gcol(c.g)} rounded-lg px-2 py-1">${c.g}</span></div><div class="text-xs text-ov mt-1">${c.sks} SKS • ${c.t==='W'?'Wajib':'Pilihan'}</div></div>`).join('')}</div></section>`).join(''):draft.length?`<div class="mt-3 space-y-2">${draft.map(c=>`<div class="bg-white rounded-xl p-3 text-sm"><div class="flex justify-between items-center"><b>${c.name}</b><span class="font-bold ${gcol(c.g)} rounded-lg px-2 py-1">${c.g}</span></div><div class="text-xs text-ov mt-1">${c.sks} SKS • ${c.t==='W'?'Wajib':'Pilihan'}</div></div>`).join('')}</div>`:'<p class="text-xs text-ov mt-2">Belum ada data yang terbaca. Upload file PDF KHS untuk memulai.</p>'}
  </div>
  <button onclick="saveKHS()" class="w-full mt-4 bg-p text-white rounded-xl py-3 font-bold">Simpan & Hitung Ulang</button>`)
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
    found.push({name:cleanName,sks,g,t:'W'});
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
      const key=`${name}-${sks}`;
      if(!merged.has(key))merged.set(key,{name:String(item.name).trim(),sks,g,t:item.t||'W'});
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
      return {semesters:[{n:semesterNumber,c:parseKhsText(data.text,semesterNumber)}]};
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
      let currentSemester=semesterNumber;
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const text=await extractPdfPageText(page);
        textPages.push(text);
        const heading=text.match(/(?:^|\n)\s*(?:KHS\s+)?semester\s*(?:ke[- ]*)?[:#-]?\s*(1[0-4]|[1-9])\b/im);
        if(heading)currentSemester=Number(heading[1]);
        const tableRows=await extractKhsTableRows(page);
        if(tableRows.length)structuredSemesters.push({n:currentSemester,c:tableRows});
        if(!tableRows.length&&window.Tesseract){
          ocrPages.push(await ocrPdfPage(page));
        }
      }
      if(structuredSemesters.length)return{semesters:mergeKhsSemesterGroups(structuredSemesters)};
      const textResult=parseKhsSemesterText(textPages.join('\n'),semesterNumber);
      const ocrResult=parseKhsSemesterText(ocrPages.join('\n'),semesterNumber);
      let semesters=mergeKhsSemesterGroups(textResult.semesters,ocrResult.semesters);
      if(!textResult.hasSemesterHeadings&&!ocrResult.hasSemesterHeadings){
        semesters=mergeKhsSemesterGroups(semesters,[{n:semesterNumber,c:backendMatches}]);
      }else if(semesters.length===1){
        semesters=mergeKhsSemesterGroups(semesters,[{n:semesters[0].n,c:backendMatches}]);
      }
      return {semesters};
    }
    if ((file.type || '').startsWith('text/') || (file.name || '').toLowerCase().endsWith('.txt')) {
      const text = await file.text();
      return {semesters:[{n:semesterNumber,c:parseKhsText(text,semesterNumber)}]};
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
function pv(i){const fl=i.files[0];if(!fl)return;
  const n=+($('#u_n')?.value||latestSem()+1);
  if(!(fl.type||'').includes('pdf')&&!fl.name.toLowerCase().endsWith('.pdf')){toast('Pilih file KHS berformat PDF.');return}
  draftFileName=fl.name;$('#u_f').textContent=fl.name;$('#u_p').innerHTML='<p class="text-xs text-ov mt-2">Membaca semua halaman PDF...</p>';
  detectKhsFile(fl,n).then(result=>{
    const groups=result.semesters||[];
    const count=groups.reduce((total,group)=>total+group.c.length,0);
    if(!count){$('#u_p').innerHTML='<p class="text-xs text-ero mt-2">Tidak ada baris mata kuliah yang terbaca. Pastikan PDF berisi teks atau scan yang jelas.</p>';toast('Tidak ditemukan data mata kuliah di PDF.');return}
    draftSemesters=groups;draft=groups.length===1?groups[0].c:[];
    drawUp(groups.length===1?groups[0].n:n);
    toast(`${count} mata kuliah terbaca dari ${groups.length} semester`);
  });
}
async function saveKHS(){
  const n=+$('#u_n')?.value;
  const groups=draftSemesters?.length?draftSemesters:[{n,c:draft}];
  if(!groups.length||groups.some(group=>!Number.isInteger(group.n)||group.n<1||group.n>14||!group.c.length||group.c.some(c=>!c.name.trim()||!Number.isInteger(+c.sks)||+c.sks<1))){
    return toast('Pastikan data mata kuliah valid dan nomor semester antara 1 sampai 14');
  }
  if(!draftSemesters?.length&&(!Number.isInteger(n)||n<1||n>14))return toast('Semester harus antara 1 sampai 14');
  const previous=st;
  st={...st,sems:[...st.sems]};
  for(const group of groups){
    const index=st.sems.findIndex(s=>s.n===group.n);
    const courses=group.c.map(c=>({...c,sks:+c.sks}));
    if(index<0)st.sems.push({n:group.n,c:courses});else st.sems[index]={n:group.n,c:courses};
  }
  st.sems.sort((a,b)=>a.n-b.n);st.plan=null;
  if(!await save()){st=previous;return}
  closeM();open=groups.at(-1).n;go('riwayat');toast(`${groups.length} semester KHS disimpan`)
}
// ---------- render ----------
const TABS=[['ringkasan','dashboard','RINGKASAN'],['matkul','menu_book','MATKUL'],['simulasi','calculate','SIMULASI'],['chat','auto_awesome','TANYA AI'],['riwayat','history_edu','RIWAYAT']];
function escapeHTML(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
let ADMIN_STUDENTS=[];
function adminStudents(){return ADMIN_STUDENTS.map(u=>({...u,stats:agg(u.data?.sems||[])}))}
function adminToken(id){return btoa(encodeURIComponent(String(id)))}
function adminOpenStudent(token){let id;try{id=decodeURIComponent(atob(token))}catch(e){return}
 const user=ADMIN_STUDENTS.find(u=>u.id===id);if(!user)return toast('Akun mahasiswa tidak ditemukan');
 const semesters=user.data?.sems||[];
 modal(`<div class="flex justify-between items-start gap-3"><div><div class="text-[10px] font-bold tracking-wider text-se">DATA MAHASISWA</div><b class="text-xl">${escapeHTML(user.name)}</b><div class="text-xs text-ov mt-1">${escapeHTML(user.id)}${user.prodi?' · '+escapeHTML(user.prodi):''}</div></div><button onclick="closeM()" aria-label="Tutup">${ic('close')}</button></div>
 ${semesters.length?`<div class="mt-4 space-y-3">${[...semesters].reverse().map(s=>{const m=sem(s);return`<section class="bg-sc rounded-xl p-3"><div class="flex justify-between"><b>Semester ${s.n}</b><span class="text-sm">IPS ${f(m.ips)} · ${m.sks} SKS</span></div>${s.c.map(c=>`<div class="flex justify-between gap-3 text-sm mt-2"><span>${escapeHTML(c.name)} <small class="text-ov">${c.sks} SKS</small></span><b>${escapeHTML(c.g)}</b></div>`).join('')}</section>`}).join('')}</div>`:'<p class="bg-sc rounded-xl p-4 mt-4 text-sm text-ov">Mahasiswa ini belum mengunggah KHS.</p>'}
 <button onclick="closeM()" class="w-full mt-4 bg-p text-white rounded-xl py-3 font-bold">Tutup</button>`)
}
function vAdmin(){const list=adminStudents();return`<p class="mt-3 text-[11px] font-bold tracking-wider text-se uppercase">Panel Administrasi</p>
 <h1 class="text-[30px] leading-9 font-extrabold text-p mt-1">Data Mahasiswa</h1>
 <p class="text-sm text-ov mt-2">Lihat akun dan data KHS mahasiswa yang tersimpan di database.</p>
 <button onclick="cfgModal()" class="w-full mt-4 bg-sc rounded-xl py-3 font-bold">${ic('rule')} Aturan Studi</button>
 <div class="grid grid-cols-2 gap-3 mt-5"><div class="bg-pc text-white rounded-2xl p-4"><div class="text-[10px] font-bold tracking-wider opacity-75">AKUN MAHASISWA</div><div class="text-3xl font-extrabold mt-2">${list.length}</div></div><div class="bg-sec rounded-2xl p-4"><div class="text-[10px] font-bold tracking-wider text-se">SUDAH UPLOAD KHS</div><div class="text-3xl font-extrabold mt-2">${list.filter(s=>s.data?.sems?.length).length}</div></div></div>
 <div class="flex justify-between items-center mt-6 mb-2"><b class="text-lg">Daftar Mahasiswa</b><span class="text-xs text-ov">${list.length} akun</span></div>
 ${list.length?list.map(s=>`<article class="bg-white rounded-2xl p-4 mb-3 shadow-sm"><div class="flex items-start justify-between gap-3"><div class="min-w-0"><b class="block truncate">${escapeHTML(s.name)}</b><div class="text-xs text-ov mt-1">${escapeHTML(s.id)}${s.prodi?' · '+escapeHTML(s.prodi):''}</div></div><span class="shrink-0 text-[11px] font-bold rounded-full px-2.5 py-1 ${s.data?.sems?.length?'bg-sec text-se':'bg-sc text-ov'}">${s.data?.sems?.length?'KHS ada':'Belum ada KHS'}</span></div>
 <div class="grid grid-cols-3 gap-2 mt-4 text-center"><div class="bg-sc rounded-lg p-2"><div class="text-[10px] text-ov">SEMESTER</div><b>${s.data?.sems?.length||0}</b></div><div class="bg-sc rounded-lg p-2"><div class="text-[10px] text-ov">SKS</div><b>${s.stats.sks}</b></div><div class="bg-sc rounded-lg p-2"><div class="text-[10px] text-ov">IPK</div><b>${f(s.stats.ipk)}</b></div></div>
 <button onclick="adminOpenStudent('${adminToken(s.id)}')" class="w-full mt-3 bg-p text-white rounded-xl py-2.5 text-sm font-bold">${ic('visibility')} Lihat detail KHS</button></article>`).join(''):'<p class="bg-white rounded-2xl p-5 text-sm text-ov">Belum ada akun mahasiswa. Mahasiswa dapat membuat akun dari pilihan Mahasiswa pada layar masuk.</p>'}
 <p class="text-center text-xs text-ov mt-5">Data mahasiswa tersimpan di PostgreSQL.</p>`}
function render(keep){const localFileWarning=location.protocol==='file:'?'<div class="bg-erc text-ero rounded-2xl p-3 mt-3 text-xs"><b>Penyimpanan browser tidak stabil.</b> Jangan buka index.html langsung. Jalankan <code>npm --prefix server start</code>, lalu buka <code>http://localhost:3001</code> dengan browser yang sama setiap kali.</div>':'';if(USER?.role==='admin'){$('#nav').innerHTML='';$('#app').innerHTML=localFileWarning+vAdmin();return}
 $('#nav').innerHTML=TABS.map(t=>`<button onclick="go('${t[0]}')" class="flex flex-col items-center gap-0.5 px-2 py-1 text-[10px] font-bold ${tab===t[0]?'text-p':'text-ov'}"><span class="ms ${tab===t[0]?'fill':''}">${t[1]}</span>${t[2]}</button>`).join('');
 $('#app').innerHTML=localFileWarning+{ringkasan:vRingkasan,matkul:vMatkul,simulasi:vSimulasi,chat:vChat,riwayat:vRiwayat}[tab]();
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
 <div class="space-y-3 mt-5">${reg?inp('a_name','person','Nama lengkap'):''}${inp('a_id','badge',role==='admin'?'ID admin':reg?'NIM':'NIM atau email','text','autocomplete="username"')}${reg?inp('a_prodi','apartment','Program studi (opsional)'):''}${inp('a_pw','lock','Kata sandi','password','autocomplete="'+(reg?'new':'current')+'-password"')}${reg?inp('a_pw2','lock_reset','Ulangi kata sandi','password'):''}</div>
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
 NAME=first(USER.name);tab='ringkasan';shell(true);
 $('#av').textContent=NAME[0].toUpperCase();
 if(USER.role==='admin')api('/api/admin/students').then(result=>{ADMIN_STUDENTS=result.students;render()}).catch(error=>{console.error('Gagal memuat daftar mahasiswa.',error);toast('Data mahasiswa gagal dimuat: '+error.message)});
 boot();
}
async function doAuth(){
 const g=i=>($('#'+i)?.value||'').trim(),id=g('a_id'),password=$('#a_pw').value;
 authErr='';
 if(!id||!password){authErr='Isi NIM/email dan kata sandi.';return render()}
 try{
  if(mode==='register'&&role==='student'){
   const name=g('a_name'),password2=$('#a_pw2').value;
   if(name.length<2)authErr='Nama lengkap minimal 2 karakter.';
   else if(password.length<8)authErr='Kata sandi minimal 8 karakter.';
   else if(password!==password2)authErr='Kata sandi tidak sama.';
   if(authErr)return render();
   return setUser(await api('/api/auth/register',{method:'POST',body:{id,name,prodi:g('a_prodi'),password}}),true);
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
function profile(){modal(`<div class="flex items-center gap-3"><div class="w-14 h-14 rounded-full bg-sec text-p text-2xl font-bold grid place-items-center">${escapeHTML(NAME[0])}</div><div><b class="text-lg">${escapeHTML(USER.name)}</b><div class="text-xs text-ov">${USER.role==='admin'?'Role: Admin':'Role: Mahasiswa'}${USER.guest?' · Mode tamu':' · '+escapeHTML(USER.id||'')}${USER.prodi?'<br>'+escapeHTML(USER.prodi):''}</div></div></div><button onclick="logout()" class="w-full mt-5 bg-p text-white rounded-xl py-3 font-bold">${ic('logout')} Keluar</button><button onclick="closeM()" class="w-full mt-2 bg-sc rounded-xl py-3 font-bold">Tutup</button>`)}
function logout(){try{localStorage.removeItem('ceklulus_token');sessionStorage.removeItem('ceklulus_token')}catch(error){console.error('Gagal membersihkan kredensial sesi.',error)}AUTH_TOKEN='';USER=null;role='student';mode='login';st=seed();closeM();boot()}
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
