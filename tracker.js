// FC Online Tracker v3 — Ghi mức rớt về (drop level)
(function(){"use strict";

// OFFICIAL rates: key = cấp ĐANG CÓ (source level)
// Tab "+6" = đập +6→+7 → tỷ lệ thành công = 15%
const OFFICIAL={5:0.26, 6:0.15, 7:0.07, 8:0.03};
const COLORS={5:'#10b981',6:'#f59e0b',7:'#ef4444',8:'#ec4899'};
const DROP_COLORS={1:'#ef4444',2:'#f59e0b',3:'#a78bfa',4:'#06b6d4',5:'#10b981'};

// PAT: key = cấp ĐANG CÓ (source level)
// PAT[5] = dữ liệu "Đập 6" (đập +5 lên +6, endPats kết thúc bằng 6)
// PAT[6] = dữ liệu "Đập 7" (đập +6 lên +7, endPats kết thúc bằng 7)
// PAT[7] = dữ liệu "Đập 8" (đập +7 lên +8, endPats kết thúc bằng 8)
const PAT={
  5:{avgLen:4.8,hotT:3,veryHotT:7,shortWin:0.59,immWin:0.28,
     endPats:{'326':35,'216':34,'226':31,'16':34,'126':24,'316':19,'136':16,'236':18},
     posAvg:{0:3.9,1:3.8,2:4.1,3:4.3,4:5.0},
     dataLabel:'Đập 6 (362 dây)', dataCount:362},
  6:{avgLen:7.5,hotT:6,veryHotT:11,shortWin:0.39,immWin:0.17,
     endPats:{'337':37,'327':22,'237':25,'227':27,'347':20,'247':16,'437':18},
     posAvg:{0:6.5,1:4.8,2:5.3,3:8.7,4:5.3},
     dataLabel:'Đập 7 (329 dây)', dataCount:329},
  7:{avgLen:16.8,hotT:15,veryHotT:28,shortWin:0.14,immWin:0.05,
     endPats:{'448':7,'438':5,'458':6,'538':4,'548':5},
     posAvg:{0:13.6,1:13.8,2:9.2,3:22.5},
     dataLabel:'Đập 8 (40 dây)', dataCount:40},
  8:{avgLen:25,hotT:20,veryHotT:40,shortWin:0.05,immWin:0.02,
     endPats:{},posAvg:{0:20},
     dataLabel:'Đập 9 (ước tính)', dataCount:0}
};
const BASE_PAT=JSON.parse(JSON.stringify(PAT));

// STATE: seq[i] = số (rớt về) hoặc 'W' (thắng)
// completedLens = [9,5,2,0] = số lần mồi của từng dây đã hoàn thành
// predictions = [{turn,recommended,result}] = lịch sử khuyến nghị
let data={};
[5,6,7,8].forEach(l=>{data[l]={
  seq:[],wins:0,fails:0,consecFail:0,dayBreaks:[],dropHistory:[],completedLens:[],
  predictions:[], // {turn, rec:'go'|'wait', result:'W'|'F'|null}
  missedCalls:0,  // bao nhiêu lần khuyên "đập" mà thua
  goodCalls:0,    // bao nhiêu lần khuyên "đập" mà thắng
};});
let curLvl=6, totalTurns=0, totalWins=0, sessionStart=Date.now(), isNewDay=false;
let learnedRecords = window.FC_DATASET ? window.FC_DATASET.loadLearned() : [];
function allLearningRecords(){
  let seed = (window.FC_DATASET && window.FC_DATASET.seedRecords) ? window.FC_DATASET.seedRecords : [];
  return seed.concat(learnedRecords);
}
function learnedByLevel(lvl){ return allLearningRecords().filter(r=>r.level===lvl); }
function refreshPatFromLearning(){
  [5,6,7,8].forEach(lvl=>{
    PAT[lvl]=JSON.parse(JSON.stringify(BASE_PAT[lvl]));
  });
  [5,6,7].forEach(lvl=>{
    let recs=learnedByLevel(lvl);
    if(recs.length===0) return;
    let lens=recs.map(r=>r.drops.length);
    let avg=lens.reduce((a,b)=>a+b,0)/lens.length;
    PAT[lvl].avgLen=(BASE_PAT[lvl].avgLen*BASE_PAT[lvl].dataCount + avg*recs.length)/(BASE_PAT[lvl].dataCount+recs.length);
    PAT[lvl].dataLabel=`${lvl===5?'Đập 6':lvl===6?'Đập 7':'Đập 8'} (${BASE_PAT[lvl].dataCount + recs.length} dây + học)`;
    recs.forEach(r=>{
      let key=r.drops.slice(-2).join('')+String(r.target);
      PAT[lvl].endPats[key]=(PAT[lvl].endPats[key]||0)+1;
      let key3=r.drops.slice(-3).join('')+String(r.target);
      if(key3.length>=3) PAT[lvl].endPats[key3]=(PAT[lvl].endPats[key3]||0)+1;
    });
  });
}
refreshPatFromLearning();

function $(id){return document.getElementById(id);}
function pct(n,d=1){return(n*100).toFixed(d)+'%';}
function cl(v,a,b){return Math.max(a,Math.min(b,v));}
// === UTILITY FUNCTIONS ===

// Bậc thang lùi: so sánh độ dài các dây
function detectLadder(completedLens){
  let recent=completedLens.slice(-4);
  if(recent.length<2) return null;
  let diffs=[];
  for(let i=1;i<recent.length;i++) diffs.push(recent[i]-recent[i-1]);
  let allDown=diffs.every(d=>d<0);
  let mostlyDown=diffs.filter(d=>d<0).length>=Math.ceil(diffs.length*0.7);
  if(allDown) return{type:'down',desc:`Bậc thang LÙI (${recent.join('→')} mồi) 📉`};
  if(mostlyDown) return{type:'down_partial',desc:`Xu hướng GIẢM (${recent.join('→')} mồi) 📉`};
  let allUp=diffs.every(d=>d>0);
  if(allUp) return{type:'up',desc:`Bậc thang TĂNG (${recent.join('→')} mồi) 📈`};
  return{type:'mixed',desc:`Không rõ (${recent.join('→')} mồi)`};
}

// Khớp mẫu cuối chuỗi với database endPats
function matchEndPattern(lvl){
  let d=data[lvl], p=PAT[lvl];
  let curSeq=getCurrentSeqDrops(lvl);
  if(curSeq.length<2) return null;
  let target=String(lvl+1);
  let matches=[];
  for(let len=2;len<=Math.min(4,curSeq.length);len++){
    let tail=curSeq.slice(-len).join('')+target;
    let tailKey=tail.slice(-3);
    let tailKey2=tail.slice(-2);
    if(p.endPats[tailKey]) matches.push({pat:tailKey,count:p.endPats[tailKey],remaining:0});
    if(p.endPats[tailKey2]&&!matches.find(m=>m.pat===tailKey2)) matches.push({pat:tailKey2,count:p.endPats[tailKey2],remaining:0});
  }
  if(matches.length===0) return null;
  matches.sort((a,b)=>b.count-a.count);
  return matches.slice(0,3);
}

// Lấy drops trong dây hiện tại (từ sau win cuối)
function getCurrentSeqDrops(lvl){
  let d=data[lvl];
  let drops=[];
  for(let i=d.seq.length-1;i>=0;i--){
    if(d.seq[i]==='W') break;
    drops.unshift(d.seq[i]);
  }
  return drops;
}

// === 5 TÍN HIỆU ĐỘC LẬP ===

// TÍN HIỆU 1: Thua liên tiếp vs ngưỡng (có adaptive)
function sig_consecFail(lvl){
  let d=data[lvl], p=PAT[lvl];
  // Adaptive: mỗi lần khuyên "đập" sai → tăng ngưỡng thêm 1
  let adaptiveHot = p.hotT + d.missedCalls;
  let adaptiveVeryHot = p.veryHotT + d.missedCalls;
  if(d.consecFail >= adaptiveVeryHot) return {on:true, strength:3, detail:`Thua ${d.consecFail}/${adaptiveVeryHot} (CỰC NÓNG)`};
  if(d.consecFail >= adaptiveHot) return {on:true, strength:2, detail:`Thua ${d.consecFail}/${adaptiveHot} (nóng)`};
  if(d.consecFail >= Math.floor(adaptiveHot*0.7)) return {on:true, strength:1, detail:`Thua ${d.consecFail}/${adaptiveHot} (ấm)`};
  return {on:false, strength:0, detail:`Thua ${d.consecFail}/${adaptiveHot} (lạnh)`};
}

// TÍN HIỆU 2: Bậc thang lùi (độ dài dây giảm)
function sig_ladder(lvl){
  let d=data[lvl];
  let ladder=detectLadder(d.completedLens);
  if(!ladder) return {on:false, strength:0, detail:'Chưa đủ dây'};
  if(ladder.type==='down') return {on:true, strength:3, detail:ladder.desc};
  if(ladder.type==='down_partial') return {on:true, strength:2, detail:ladder.desc};
  if(ladder.type==='up') return {on:false, strength:-1, detail:ladder.desc};
  return {on:false, strength:0, detail:ladder.desc};
}

// TÍN HIỆU 3: Khớp mẫu kết thúc
function sig_endPattern(lvl){
  let pm=matchEndPattern(lvl);
  if(!pm) return {on:false, strength:0, detail:'Chưa khớp mẫu'};
  let best=pm[0];
  if(best.remaining===0 && best.count>=20) return {on:true, strength:3, detail:`Khớp "${best.pat}" (${best.count}x trong DB)`};
  if(best.remaining===0) return {on:true, strength:2, detail:`Khớp "${best.pat}" (${best.count}x)`};
  return {on:false, strength:1, detail:`Gần khớp "${best.pat}" (còn ~${best.remaining})`};
}

// TÍN HIỆU 4: Nợ xác suất (tỷ lệ thực << kỳ vọng)
function sig_debt(lvl){
  let d=data[lvl], off=OFFICIAL[lvl];
  let n=d.seq.length;
  if(n<5) return {on:false, strength:0, detail:'Chưa đủ dữ liệu'};
  let actualRate=d.wins/n;
  let deficit=(off-actualRate)/off; // % thấp hơn kỳ vọng
  if(deficit>=0.5) return {on:true, strength:3, detail:`Nợ nặng: thực ${pct(actualRate)} << chuẩn ${pct(off)}`};
  if(deficit>=0.25) return {on:true, strength:2, detail:`Nợ: thực ${pct(actualRate)} < chuẩn ${pct(off)}`};
  if(deficit>=0.1) return {on:true, strength:1, detail:`Hơi nợ: ${pct(actualRate)} vs ${pct(off)}`};
  return {on:false, strength:0, detail:`Cân bằng: ${pct(actualRate)} ≈ ${pct(off)}`};
}

// TÍN HIỆU 5: Xu hướng drop value (rớt về thấp dần → gần thắng)
function sig_dropTrend(lvl){
  let drops=getCurrentSeqDrops(lvl);
  if(drops.length<3) return {on:false, strength:0, detail:'Chưa đủ drop'};
  let last3=drops.slice(-3);
  let avg3=last3.reduce((a,b)=>a+b,0)/3;
  let first3=drops.slice(0,Math.min(3,drops.length));
  let avgFirst=first3.reduce((a,b)=>a+b,0)/first3.length;
  if(drops.length>=4 && avg3<avgFirst && avg3<=2) return {on:true, strength:3, detail:`Drop giảm: ${avgFirst.toFixed(1)}→${avg3.toFixed(1)} (gần thắng)`};
  if(avg3<avgFirst) return {on:true, strength:1, detail:`Drop giảm nhẹ: ${avg3.toFixed(1)}`};
  if(avg3>avgFirst) return {on:false, strength:-1, detail:`Drop TĂNG: ${avg3.toFixed(1)} (xui)`};
  return {on:false, strength:0, detail:`Drop ổn: ${avg3.toFixed(1)}`};
}

// === PHASE DETECTION ===
function getPhase(lvl){
  let d=data[lvl], p=PAT[lvl];
  let drops=getCurrentSeqDrops(lvl);
  // Phase 1: Quan sát — 3 turn đầu mỗi dây
  let minObserve = Math.max(3, Math.floor(p.hotT * 0.4));
  if(drops.length < minObserve) return 'observe';
  // Phase 2: Phân tích — đủ data nhưng chưa đạt ngưỡng
  let adaptiveHot = p.hotT + d.missedCalls;
  if(d.consecFail < adaptiveHot) return 'analyze';
  // Phase 3: Sẵn sàng — qua ngưỡng
  return 'ready';
}

// === RECOMMENDATION ENGINE ===
function calcScore(lvl){
  let d=data[lvl], p=PAT[lvl];
  let n=d.seq.length;
  if(n===0) return 0;
  let phase=getPhase(lvl);

  // Phase observe: LUÔN trả về score thấp
  if(phase==='observe') return cl(d.consecFail*5, 0, 20);

  // Tính 5 tín hiệu
  let s1=sig_consecFail(lvl);
  let s2=sig_ladder(lvl);
  let s3=sig_endPattern(lvl);
  let s4=sig_debt(lvl);
  let s5=sig_dropTrend(lvl);

  let signals=[s1,s2,s3,s4,s5];
  let greenCount=signals.filter(s=>s.on).length;
  let totalStrength=signals.reduce((a,s)=>a+Math.max(0,s.strength),0);
  let negStrength=signals.reduce((a,s)=>a+Math.min(0,s.strength),0);
  let mk=markovProb(lvl), kn=knnProb(lvl);
  let mlBoost=(mk.prob/OFFICIAL[lvl]-1)*14 + (kn.prob/OFFICIAL[lvl]-1)*12;

  // Cần ít nhất 2 tín hiệu xanh để lên 50+, 3+ để lên 75+
  let base=0;
  if(greenCount>=4) base=80;
  else if(greenCount>=3) base=60;
  else if(greenCount>=2) base=40;
  else if(greenCount>=1) base=20;

  // Điều chỉnh theo strength
  let adjust = totalStrength * 3 + negStrength * 5;
  // Penalty nếu đã khuyên sai nhiều
  let penalty = d.missedCalls * 8;

  return cl(base + adjust + mlBoost - penalty, 0, 100);
}

function getSignals(lvl){
  return {
    consecFail: sig_consecFail(lvl),
    ladder: sig_ladder(lvl),
    endPat: sig_endPattern(lvl),
    debt: sig_debt(lvl),
    dropTrend: sig_dropTrend(lvl),
  };
}

function markovProb(lvl){
  let recs=learnedByLevel(lvl), k=getCurrentSeqDrops(lvl).length;
  if(recs.length<5) return {prob:OFFICIAL[lvl], sample:0, detail:'fallback official'};
  let eligible=recs.filter(r=>r.drops.length>=k);
  let successNow=recs.filter(r=>r.drops.length===k).length;
  let prob=(successNow+1)/(eligible.length+2);
  prob=prob*0.75 + OFFICIAL[lvl]*0.25;
  return {prob:cl(prob,0,1), sample:eligible.length, detail:`${successNow}/${eligible.length}`};
}

function knnProb(lvl){
  let cur=getCurrentSeqDrops(lvl), recs=learnedByLevel(lvl);
  if(cur.length<2 || recs.length<8) return {prob:OFFICIAL[lvl], sample:0, detail:'chưa đủ mẫu'};
  let scored=[];
  recs.forEach(r=>{
    let maxLen=Math.min(cur.length, r.drops.length, 4);
    if(maxLen<2) return;
    let dist=0, weight=0;
    for(let i=0;i<maxLen;i++){
      let a=cur[cur.length-1-i], b=r.drops[r.drops.length-1-i], w=i+1;
      dist += Math.abs(a-b)*w; weight += w;
    }
    scored.push({r, dist:dist/weight});
  });
  scored.sort((a,b)=>a.dist-b.dist);
  let top=scored.slice(0,Math.min(15,scored.length));
  let near=top.filter(x=>x.dist<=0.45).length;
  let prob=(near+1)/(top.length+2);
  prob=prob*0.70 + OFFICIAL[lvl]*0.30;
  return {prob:cl(prob,0,1), sample:top.length, detail:`${near}/${top.length} mẫu gần`};
}

function getRec(lvl){
  let d=data[lvl], p=PAT[lvl], off=OFFICIAL[lvl];
  let n=d.seq.length, score=calcScore(lvl);
  let phase=getPhase(lvl);
  let drops=getCurrentSeqDrops(lvl);
  let sigs=getSignals(lvl);
  let greenCount=[sigs.consecFail,sigs.ladder,sigs.endPat,sigs.debt,sigs.dropTrend].filter(s=>s.on).length;

  if(n===0) return{state:'neutral',icon:'🎲',title:'Chờ dữ liệu...',detail:'Nhấn ✅ khi thắng, chọn mức rớt khi thua',conf:null};

  // Phase 1: Quan sát
  if(phase==='observe'){
    let minObs=Math.max(3, Math.floor(p.hotT*0.4));
    return{state:'neutral',icon:'👁️',title:`QUAN SÁT (${drops.length}/${minObs})`,
      detail:`Đang thu thập dữ liệu dây này. Chưa khuyên đập.`,
      conf:`Mồi tiếp — còn ${minObs-drops.length} turn nữa`};
  }

  // Accuracy info
  let accNote = d.missedCalls>0 ? ` | Đã sai ${d.missedCalls}x → ngưỡng +${d.missedCalls}` : '';

  // Phase 2: Phân tích
  if(phase==='analyze'){
    let need=p.hotT+d.missedCalls-d.consecFail;
    return{state:'wait',icon:'📊',title:`PHÂN TÍCH — Chưa đủ tín hiệu`,
      detail:`${greenCount}/5 tín hiệu xanh | Cần thua thêm ~${need} lần${accNote}`,
      conf:`${Math.round(score)}% — Mồi tiếp`};
  }

  // Phase 3: Sẵn sàng — chỉ khuyên khi đủ tín hiệu
  if(score>=75 && greenCount>=3){
    return{state:'great',icon:'🔥',title:`⚡ ĐẬP NGAY! (${greenCount}/5 xanh)`,
      detail:`Đa tín hiệu hội tụ${accNote}`,
      conf:`${Math.round(score)}% tin cậy`};
  }
  if(score>=55 && greenCount>=2){
    return{state:'good',icon:'✨',title:`NÊN ĐẬP (${greenCount}/5 xanh)`,
      detail:`Nhiều tín hiệu tích cực${accNote}`,
      conf:`${Math.round(score)}% tin cậy`};
  }
  return{state:'wait',icon:'⏳',title:`CHỜ THÊM (${greenCount}/5 xanh)`,
    detail:`Chưa đủ tín hiệu hội tụ${accNote}`,
    conf:`${Math.round(score)}% — Mồi tiếp`};
}

// Render drop buttons based on current level
function renderDropBtns(){
  let maxDrop=curLvl; // khi đập +6→+7 thì fodder có thể rớt về 1..6
  let html='';
  for(let i=1;i<=Math.min(5,maxDrop);i++){
    html+=`<button class="drop-btn" data-drop="${i}" onclick="recordDrop(${i})">+${i}<span class="drop-sub">Rớt về</span></button>`;
  }
  $('dropBtns').innerHTML=html;
  $('targetLvlLabel').textContent=curLvl+1;
  $('meterLvl').textContent=curLvl;
  $('meterLvl2').textContent=curLvl+1;
}

function renderSeqDisplay(){
  let d=data[curLvl];
  let el=$('seqChars');
  if(d.seq.length===0){el.innerHTML='<span style="color:var(--dim);font-size:.7rem">Chưa có lần nào...</span>';return;}
  // Show last 15
  let recent=d.seq.slice(-15);
  el.innerHTML=recent.map(s=>{
    if(s==='W') return `<div class="seq-char win">✓</div>`;
    return `<div class="seq-char drop-${s}">+${s}</div>`;
  }).join('');
}

function renderStreakRow(){
  let d=data[curLvl];
  let recent=d.seq.slice(-15);
  let html=recent.map(s=>{
    if(s==='W') return `<div class="sdot win">✓</div>`;
    return `<div class="sdot drop-${s}">${s}</div>`;
  }).join('');
  html+=Array(Math.max(0,10-recent.length)).fill('<div class="sdot ph"></div>').join('');
  $('streakRow').innerHTML=html;
}

function renderPatternBox(){
  let d=data[curLvl], p=PAT[curLvl], off=OFFICIAL[curLvl];
  let n=d.seq.length;
  let winsToday=d.seq.slice(d.dayBreaks.length>0?d.dayBreaks[d.dayBreaks.length-1]:0).filter(x=>x==='W').length;
  let curDrops=getCurrentSeqDrops(curLvl);
  let phase=getPhase(curLvl);
  let sigs=getSignals(curLvl);
  let html='';

  // === 5 TÍN HIỆU DASHBOARD ===
  html+=`<div class="ititle">🧠 5 TÍN HIỆU — Phase: ${phase==='observe'?'👁️ QUAN SÁT':phase==='analyze'?'📊 PHÂN TÍCH':'🔥 SẴN SÀNG'}</div>`;
  let sigList=[
    {name:'Thua liên tiếp', sig:sigs.consecFail, icon:'🔢'},
    {name:'Bậc thang lùi', sig:sigs.ladder, icon:'📉'},
    {name:'Khớp mẫu cuối', sig:sigs.endPat, icon:'🎯'},
    {name:'Nợ xác suất', sig:sigs.debt, icon:'📈'},
    {name:'Drop trend', sig:sigs.dropTrend, icon:'📊'},
  ];
  sigList.forEach(s=>{
    let col=s.sig.on?'var(--green)':s.sig.strength<0?'var(--red)':'var(--dim)';
    let dot=s.sig.on?'🟢':s.sig.strength<0?'🔴':'⚪';
    html+=`<div class="iitem" style="color:${col}">${dot} ${s.icon} ${s.name}: ${s.sig.detail}</div>`;
  });

  // Prediction accuracy
  if(d.missedCalls>0||d.goodCalls>0){
    html+=`<div class="ititle" style="margin-top:6px">🎯 Độ chính xác khuyến nghị:</div>`;
    let total=d.missedCalls+d.goodCalls;
    let acc=total>0?(d.goodCalls/total*100).toFixed(0):0;
    html+=`<div class="iitem" style="color:${d.missedCalls>d.goodCalls?'var(--red)':'var(--green)'}">Đúng: ${d.goodCalls} | Sai: ${d.missedCalls} | Chính xác: ${acc}%</div>`;
    if(d.missedCalls>0) html+=`<div class="iitem" style="color:var(--orange)">→ Ngưỡng đã tăng +${d.missedCalls} (tự sửa sai)</div>`;
  }

  // Dataset info
  let mk=markovProb(curLvl), kn=knnProb(curLvl);
  html+=`<div class="ititle" style="margin-top:6px">🤖 ML live confidence</div>`;
  html+=`<div class="iitem">Markov: ${pct(mk.prob)} (${mk.detail}) • KNN: ${pct(kn.prob)} (${kn.detail})</div>`;
  html+=`<div class="ititle" style="margin-top:6px">📊 ${p.dataLabel} — +${curLvl}→+${curLvl+1}</div>`;
  html+=`<div class="iitem">TB ${p.avgLen.toFixed(1)} mồi/dây • Tỷ lệ: ${pct(off)} • Nóng: ≥${p.hotT+d.missedCalls}</div>`;

  // Current sequence
  if(curDrops.length>0){
    html+=`<div class="ititle" style="margin-top:6px">🔍 Dây hiện tại (${curDrops.length} mồi):</div>`;
    html+=`<div class="iitem">Rớt: ${curDrops.join(' → ')}</div>`;
  }

  // Completed sequences
  if(d.completedLens.length>0){
    html+=`<div class="ititle" style="margin-top:6px">📋 Lịch sử dây:</div>`;
    html+=`<div class="iitem">${d.completedLens.slice(-6).map((l,i)=>`D${d.completedLens.length-d.completedLens.slice(-6).length+i+1}:${l}`).join(' · ')} mồi</div>`;
  }

  $('patternBox').innerHTML=html;
}


function renderMultiGrid(){
  let html='';
  [5,6,7,8].forEach(lvl=>{
    let d=data[lvl], p=PAT[lvl], off=OFFICIAL[lvl];
    let n=d.seq.length, color=COLORS[lvl];
    let ar=n>0?d.wins/n:null;
    let score=calcScore(lvl);
    let bw=ar!==null?Math.min(100,(ar/off)*100):50;
    let st=n<3?'unk':score>=75?'hot':score>=50?'good':score>=25?'wait':'cold';
    let stTxt=n<3?'❓ Chưa đủ':score>=75?'🔥 ĐẬP NGAY!':score>=50?'✨ Nên đập':score>=25?'⏳ Đợi':'❄️ Lạnh';
    html+=`<div class="mcell" style="border-top:2px solid ${color}30">
      <div class="mc-lvl" style="color:${color}">+${lvl}</div>
      <div style="font-size:.62rem;color:var(--sub)">${n}t·${d.wins}✅${d.fails}❌</div>
      <div class="mc-bar"><div class="mc-fill" style="width:${bw}%;background:${color}"></div></div>
      <div style="font-size:.6rem;color:var(--dim)">Thua: ${d.consecFail}/${p.hotT}</div>
      <div class="mc-st ${st}">${stTxt}</div>
    </div>`;
  });
  $('mgrid').innerHTML=html;
}

function renderMeter(){
  let score=calcScore(curLvl);
  let fill=$('readFill');
  fill.style.width=score+'%';
  fill.textContent=Math.round(score)+'%';
  if(score>=75) fill.style.background='linear-gradient(90deg,#ef4444,#fbbf24)';
  else if(score>=50) fill.style.background='linear-gradient(90deg,#f59e0b,#10b981)';
  else if(score>=25) fill.style.background='#10b981';
  else fill.style.background='#2a3553';
}

function renderRec(){
  let rec=getRec(curLvl), score=calcScore(curLvl);
  let box=$('recBox');
  box.className='rec-box '+rec.state;
  $('recIcon').textContent=rec.icon;
  $('recTitle').textContent=rec.title;
  $('recDetail').textContent=rec.detail;
  let conf=$('recConf');
  if(rec.conf){conf.style.display='block';conf.textContent=rec.conf;conf.style.color=score>=75?'#fbbf24':score>=50?'#10b981':'#8b95b0';}
  else conf.style.display='none';
}

function renderStats(){
  let d=data[curLvl], p=PAT[curLvl];
  $('statAttempts').textContent=d.seq.length;
  $('statConsec').textContent=d.consecFail;
  $('statHot').textContent=p.hotT+'x';
  let rd=d.dropHistory.slice(-5);
  $('statAvgDrop').textContent=rd.length>0?'+'+( rd.reduce((a,b)=>a+b,0)/rd.length).toFixed(1):'—';
}

function renderHeader(){
  $('totalTurns').textContent=totalTurns;
  $('totalWins').textContent=totalWins;
  let e=Math.floor((Date.now()-sessionStart)/1000),m=Math.floor(e/60),s=e%60;
  $('sessionTime').textContent=(m<10?'0':'')+m+':'+(s<10?'0':'')+s;
}

function renderAll(){
  renderSeqDisplay();
  renderStreakRow();
  renderMeter();
  renderRec();
  renderStats();
  renderPatternBox();
  renderMultiGrid();
  renderHeader();
  // Highlight last drop button
  document.querySelectorAll('.drop-btn').forEach(b=>b.classList.remove('last'));
  let d=data[curLvl];
  if(d.seq.length>0){
    let last=d.seq[d.seq.length-1];
    if(last!=='W'){let b=document.querySelector(`.drop-btn[data-drop="${last}"]`);if(b)b.classList.add('last');}
  }
}

function addLog(lvl,entry,isDayBreak,score){
  let body=$('logBody');
  if(body.firstChild&&body.firstChild.style&&body.firstChild.style.textAlign) body.innerHTML='';
  if(isDayBreak){let s=document.createElement('div');s.className='day-sep';s.textContent='── 🌅 NGÀY MỚI ──';body.insertBefore(s,body.firstChild);}
  let rec=score>=75?'🔥ĐẬP!':score>=50?'✨Nên':'';
  let isWin=entry==='W';
  let div=document.createElement('div');
  div.className=`log-entry ${isWin?'win':''} ${rec==='🔥ĐẬP!'?'rec-now':''}`;
  let c=COLORS[lvl];
  let seqStr=data[lvl].seq.slice(-6).map(x=>x==='W'?'✅':'+'+x).join(' ');
  div.innerHTML=`<span class="le-t">#${totalTurns}</span><span class="le-l" style="color:${c}">+${lvl}→${lvl+1}</span><span class="le-seq">${isWin?'✅ THẮNG':('❌ Rớt→+'+entry)}</span><span class="le-rec">${rec}</span>`;
  body.insertBefore(div,body.firstChild);
  while(body.children.length>80) body.removeChild(body.lastChild);
}

// === ACTIONS ===
window.recordDrop=function(dropLvl){
  let d=data[curLvl];
  let score=calcScore(curLvl);
  let rec=getRec(curLvl);
  let isDay=isNewDay;
  if(isNewDay){d.dayBreaks.push(d.seq.length);isNewDay=false;$('btnNewDay').classList.remove('active');$('btnNewDay').textContent='🌅 Ngày mới';}
  // Track prediction: nếu hệ thống đang khuyên "đập" mà thua → sai
  if(rec.state==='great'||rec.state==='good') d.missedCalls++;
  d.seq.push(dropLvl);
  d.fails++;
  d.consecFail++;
  d.dropHistory.push(dropLvl);
  totalTurns++;
  addLog(curLvl,dropLvl,isDay,score);
  renderAll();
  let btn=document.querySelector(`.drop-btn[data-drop="${dropLvl}"]`);
  if(btn){btn.style.transform='scale(.88)';setTimeout(()=>btn.style.transform='',150);}
};

function recordWin(){
  let d=data[curLvl];
  let score=calcScore(curLvl);
  let rec=getRec(curLvl);
  let isDay=isNewDay;
  if(isNewDay){d.dayBreaks.push(d.seq.length);isNewDay=false;$('btnNewDay').classList.remove('active');$('btnNewDay').textContent='🌅 Ngày mới';}
  // Track prediction: nếu hệ thống đang khuyên "đập" mà thắng → đúng
  if(rec.state==='great'||rec.state==='good') d.goodCalls++;
  d.completedLens.push(d.consecFail);
  d.seq.push('W');
  d.wins++;
  d.consecFail=0;
  totalTurns++;totalWins++;
  addLog(curLvl,'W',isDay,score);
  renderAll();
  let b=$('btnWin');b.style.transform='scale(.93)';setTimeout(()=>b.style.transform='',150);
}

function undo(){
  let d=data[curLvl];
  if(d.seq.length===0) return;
  let last=d.seq.pop();
  totalTurns--;
  if(last==='W'){d.wins--;totalWins--;} else{d.fails--;d.dropHistory.pop();}
  d.consecFail=0;
  for(let i=d.seq.length-1;i>=0;i--){if(d.seq[i]!=='W')d.consecFail++;else break;}
  let body=$('logBody');if(body.firstChild) body.removeChild(body.firstChild);
  renderAll();
}

function switchLvl(lvl){
  curLvl=lvl;
  document.querySelectorAll('.lvl-tab').forEach(b=>b.classList.toggle('active',parseInt(b.dataset.lvl)===lvl));
  renderDropBtns();
  renderAll();
}

// Events
document.querySelectorAll('.lvl-tab').forEach(b=>b.addEventListener('click',()=>switchLvl(parseInt(b.dataset.lvl))));
$('btnWin').addEventListener('click',recordWin);
$('btnUndo').addEventListener('click',undo);
$('btnReset').onclick=function(){
  if(this.dataset.armed==='1'){
    [5,6,7,8].forEach(l=>{data[l]={seq:[],wins:0,fails:0,consecFail:0,dayBreaks:[],dropHistory:[],completedLens:[],predictions:[],missedCalls:0,goodCalls:0};});
    totalTurns=0;totalWins=0;sessionStart=Date.now();isNewDay=false;
    $('logBody').innerHTML='<div style="color:var(--dim);padding:6px;text-align:center">Chưa có dữ liệu</div>';
    $('btnNewDay').classList.remove('active');$('btnNewDay').textContent='🌅 Ngày mới';
    this.textContent='🔄 Reset';this.style.borderColor='';this.dataset.armed='0';
    renderAll();
  } else {
    this.dataset.armed='1';this.textContent='⚠️ XÁC NHẬN?';this.style.borderColor='var(--red)';
    setTimeout(()=>{this.textContent='🔄 Reset';this.style.borderColor='';this.dataset.armed='0';},3000);
  }
};
$('btnNewDay').addEventListener('click',()=>{
  isNewDay=!isNewDay;
  $('btnNewDay').classList.toggle('active',isNewDay);
  $('btnNewDay').textContent=isNewDay?'🌅 Ngày mới ✓':'🌅 Ngày mới';
});
$('btnClearLog').addEventListener('click',()=>{$('logBody').innerHTML='<div style="color:var(--dim);padding:6px;text-align:center">Log đã xóa</div>';});

function renderLearnStats(){
  if(!$('learnStats')) return;
  let total=allLearningRecords().length;
  let user=learnedRecords.length;
  let by=[5,6,7].map(l=>`+${l}→+${l+1}: ${learnedByLevel(l).length}`).join(' • ');
  $('learnCount').textContent=`${user} dòng học mới`;
  $('learnStats').textContent=`Dataset đang học: ${total} dây (${by}). Data mới lưu trên trình duyệt + có thể xuất backup.`;
}
function setupLearningUI(){
  if(!$('btnLearnAdd') || !window.FC_DATASET) return;
  renderLearnStats();
  $('learnImage').addEventListener('change',e=>{
    let f=e.target.files && e.target.files[0]; if(!f) return;
    let url=URL.createObjectURL(f); $('learnPreview').src=url; $('learnPreview').style.display='block';
  });
  $('btnLearnClearImg').addEventListener('click',()=>{$('learnImage').value=''; $('learnPreview').removeAttribute('src'); $('learnPreview').style.display='none';});
  $('btnLearnAdd').addEventListener('click',()=>{
    let lines=$('learnText').value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    let recs=window.FC_DATASET.recordsFromLines(lines,'user_daily');
    if(recs.length===0){$('learnResult').style.color='var(--red)';$('learnResult').textContent='Không parse được dòng nào. Dạng đúng: 2212 = 6';return;}
    learnedRecords=learnedRecords.concat(recs);
    window.FC_DATASET.saveLearned(learnedRecords);
    refreshPatFromLearning();
    $('learnText').value=''; $('learnResult').style.color='var(--green)'; $('learnResult').textContent=`Đã thêm ${recs.length} dây học mới ✅`;
    renderLearnStats(); renderAll();
  });
  $('btnLearnExport').addEventListener('click',()=>{
    let blob=new Blob([JSON.stringify(learnedRecords,null,2)],{type:'application/json'});
    let a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='fc-tracker-learned-data.json'; a.click(); URL.revokeObjectURL(a.href);
  });
  $('btnLearnImport').addEventListener('click',()=>$('learnImportFile').click());
  $('learnImportFile').addEventListener('change',e=>{
    let f=e.target.files && e.target.files[0]; if(!f) return;
    let r=new FileReader(); r.onload=()=>{try{let arr=JSON.parse(r.result); if(!Array.isArray(arr)) throw new Error('not array'); learnedRecords=learnedRecords.concat(arr); window.FC_DATASET.saveLearned(learnedRecords); refreshPatFromLearning(); renderLearnStats(); renderAll(); $('learnResult').style.color='var(--green)'; $('learnResult').textContent=`Đã nhập ${arr.length} dòng backup ✅`;}catch(err){$('learnResult').style.color='var(--red)';$('learnResult').textContent='File backup không hợp lệ';}}; r.readAsText(f);
  });
}
setupLearningUI();

document.addEventListener('keydown',e=>{
  if(e.target.tagName==='INPUT') return;
  let k=e.key;
  if(k==='w'||k==='W') recordWin();
  else if(['1','2','3','4','5'].includes(k)) window.recordDrop(parseInt(k));
  else if(k==='z'||k==='Z') undo();
  else if(k==='n'||k==='N') $('btnNewDay').click();
  else if(['5','6','7','8'].includes(k)&&e.shiftKey) switchLvl(parseInt(k));
});

setInterval(renderHeader,1000);
renderDropBtns();
renderAll();
})();
