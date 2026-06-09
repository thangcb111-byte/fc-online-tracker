// FC Online Upgrade Simulator
(function() {
"use strict";

// === OFFICIAL RATES (FC Online Nâng Cấp 2.0 - công bố 03.11.2025) ===
const BASE_RATES = {
    1: 1.00,  // 100%
    2: 1.00,  // 100%
    3: 0.81,  // 81%
    4: 0.64,  // 64%
    5: 0.50,  // 50%
    6: 0.26,  // 26%
    7: 0.15,  // 15%
    8: 0.07,  // 7%
    9: 0.05,  // 5%
    10: 0.04, // 4%
    11: 0.03, // 3%
    12: 0.02, // 2%
    13: 0.01  // 1% (cấp tối đa +)
};

// OVR tăng khi nâng cấp thành công
const OVR_GAINS = {
    1:0, 2:1, 3:1, 4:2, 5:2, 6:2, 7:3,
    8:4, 9:2, 10:2, 11:2, 12:3, 13:3
};

// Tỷ lệ tụt cấp khi thất bại (ước tính - game không công bố chính thức)
const DOWNGRADE_RATES = {
    1:0, 2:0, 3:0, 4:0, 5:0,
    6:0.20, 7:0.30, 8:0.40, 9:0.50, 10:0.60, 11:0.70, 12:0.80, 13:0.90
};

function getSuccessRate(targetLvl, slots, fodderOVR) {
    // Official rates are fixed. Slots & OVR affect number of fodder cards used,
    // not the base success rate (rate is per attempt with full slot usage).
    // We model slots as a small bonus since more fodder = slightly better chance.
    let base = BASE_RATES[targetLvl] || 0.005;
    // Slots provide a small additive bonus (community observation)
    let slotBonus = (slots - 3) * 0.01; // ±1% per slot vs baseline 3 slots
    // OVR above base (110) provides marginal bonus
    let ovrBonus = (fodderOVR - 110) * 0.001;
    return Math.min(0.99, Math.max(0.005, base + slotBonus + ovrBonus));
}

// === STATE ===
let state = {
    currentLevel: 0, targetLevel: 7, useProtection: false,
    fodderOVR: 110, fodderCost: 3000, slots: 3, simCount: 1000,
    liveLevel: 0, liveAttempts: 0, liveSuccess: 0, liveFail: 0, liveCost: 0,
    simResults: null, totalSimulations: 0
};

// === PARTICLE BACKGROUND ===
const pc = document.getElementById('particleCanvas');
const pctx = pc.getContext('2d');
let particles = [];
function initParticles() {
    pc.width = window.innerWidth; pc.height = window.innerHeight;
    particles = Array.from({length: 40}, () => ({
        x: Math.random()*pc.width, y: Math.random()*pc.height,
        vx: (Math.random()-0.5)*0.3, vy: (Math.random()-0.5)*0.3,
        r: Math.random()*2+0.5, a: Math.random()*0.5+0.1
    }));
}
function drawParticles() {
    pctx.clearRect(0,0,pc.width,pc.height);
    particles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if(p.x<0) p.x=pc.width; if(p.x>pc.width) p.x=0;
        if(p.y<0) p.y=pc.height; if(p.y>pc.height) p.y=0;
        pctx.beginPath(); pctx.arc(p.x,p.y,p.r,0,Math.PI*2);
        pctx.fillStyle=`rgba(0,240,255,${p.a})`; pctx.fill();
    });
    requestAnimationFrame(drawParticles);
}
initParticles(); drawParticles();
window.addEventListener('resize', initParticles);

// === UI HELPERS ===
function $(id) { return document.getElementById(id); }
function fmt(n) {
    if(n>=1e9) return (n/1e9).toFixed(1)+'T';
    if(n>=1e6) return (n/1e6).toFixed(1)+'M';
    if(n>=1e3) return (n/1e3).toFixed(1)+'K';
    return n.toFixed(0);
}

// === SELECTOR BINDINGS ===
function bindSelector(containerId, key, isInt) {
    const el = $(containerId); if(!el) return;
    el.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
            el.querySelectorAll('button').forEach(b=>b.classList.remove('active'));
            btn.classList.add('active');
            state[key] = isInt ? parseInt(btn.dataset.level||btn.dataset.slots||btn.dataset.count) : btn.dataset.level;
            if(key==='currentLevel'||key==='targetLevel') updateProgressDisplay();
        });
    });
}
bindSelector('currentLevelSelector','currentLevel',true);
bindSelector('targetLevelSelector','targetLevel',true);
bindSelector('slotSelector','slots',true);
bindSelector('simCountSelector','simCount',true);

// Fix: simCount uses data-count
$('simCountSelector').querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
        $('simCountSelector').querySelectorAll('button').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        state.simCount = parseInt(btn.dataset.count);
    });
});

$('useProtection').addEventListener('change', e => { state.useProtection = e.target.checked; });
$('fodderOVR').addEventListener('input', e => {
    state.fodderOVR = parseInt(e.target.value);
    $('fodderOVRValue').textContent = state.fodderOVR;
});
$('fodderCost').addEventListener('input', e => { state.fodderCost = parseInt(e.target.value)||1000; });

// Forward declarations for chart redraw on tab switch
var _lastSimResults = null;
var drawCurrentChart = function() {};

// Tabs
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
        document.querySelectorAll('.chart-container').forEach(c=>c.classList.remove('active'));
        btn.classList.add('active');
        $(btn.dataset.tab+'Tab').classList.add('active');
        // Redraw chart for the newly visible tab
        if(_lastSimResults) drawCurrentChart();
    });
});

function updateProgressDisplay() {
    $('progressLabel').textContent = `+${state.liveLevel} → +${state.targetLevel}`;
    let pct = state.targetLevel > state.currentLevel ?
        ((state.liveLevel - state.currentLevel) / (state.targetLevel - state.currentLevel)) * 100 : 0;
    $('progressFill').style.width = Math.max(0,Math.min(100,pct))+'%';
    $('cardLevel').textContent = '+'+state.liveLevel;
}

// === SINGLE UPGRADE ATTEMPT ===
function doSingleUpgrade(level, target) {
    let rate = getSuccessRate(level+1, state.slots, state.fodderOVR);
    let success = Math.random() < rate;
    if(success) return { newLevel: level+1, success: true, rate };
    // Fail: check downgrade
    if(!state.useProtection && level >= 5) {
        let dgRate = DOWNGRADE_RATES[level+1] || 0;
        if(Math.random() < dgRate) return { newLevel: Math.max(0, level-1), success: false, rate, downgraded: true };
    }
    return { newLevel: level, success: false, rate };
}

// === SIMULATE FULL UPGRADE PATH ===
function simulateFullUpgrade() {
    let level = state.currentLevel;
    let attempts = 0, cost = 0, maxAttempts = 5000;
    while(level < state.targetLevel && attempts < maxAttempts) {
        let result = doSingleUpgrade(level, state.targetLevel);
        level = result.newLevel;
        attempts++;
        cost += state.fodderCost * state.slots;
    }
    return { attempts, cost, success: level >= state.targetLevel };
}

// === MONTE CARLO SIMULATION ===
function runMonteCarlo() {
    let results = [];
    for(let i = 0; i < state.simCount; i++) {
        results.push(simulateFullUpgrade());
    }
    return results;
}

// === HTML BAR CHART DRAWING ===
function drawBarChart(container, options) {
    let { labels, values, colors, title, formatY } = options;
    let maxVal = Math.max(...values, 1);
    let html = '<div class="html-chart">';
    if(title) html += '<div class="chart-title">' + title + '</div>';
    html += '<div class="chart-bars">';
    labels.forEach(function(label, i) {
        let pct = (values[i] / maxVal) * 100;
        let c = colors ? colors[i] : '#00f0ff';
        let valText = formatY ? formatY(values[i]) : values[i].toFixed(0);
        html += '<div class="bar-col">' +
            '<div class="bar-val" style="color:' + c + '">' + valText + '</div>' +
            '<div class="bar-track"><div class="bar-fill" style="height:' + pct + '%;background:' + c + ';box-shadow:0 0 8px ' + c + '44"></div></div>' +
            '<div class="bar-label">' + label + '</div>' +
            '</div>';
    });
    html += '</div></div>';
    container.innerHTML = html;
}

// === DISPLAY RESULTS ===
// Store last results so we can redraw on tab switch
// _lastSimResults declared above for hoisting

function drawDistributionChart(results) {
    let attempts = results.map(r => r.attempts);
    let maxAtt = Math.max(...attempts), minAtt = Math.min(...attempts);
    let bucketSize = Math.max(1, Math.ceil((maxAtt - minAtt) / 25));
    let buckets = {};
    attempts.forEach(a => { let b = Math.floor(a/bucketSize)*bucketSize; buckets[b]=(buckets[b]||0)+1; });
    let bKeys = Object.keys(buckets).map(Number).sort((a,b)=>a-b);
    drawBarChart($('distributionChart'), {
        labels: bKeys.map(k => k+(bucketSize>1?'-'+(k+bucketSize-1):'')),
        values: bKeys.map(k => buckets[k]),
        colors: bKeys.map(k => { let r=k/(maxAtt||1); return r<0.3?'#10b981':r<0.6?'#f59e0b':'#ef4444'; }),
        title: `Phân bố số lần thử (${results.length} mô phỏng, +${state.currentLevel}→+${state.targetLevel})`,
        formatY: v => v.toFixed(0)
    });
}

function drawCostChart(results) {
    let costs = results.map(r => r.cost);
    let maxC = Math.max(...costs), minC = Math.min(...costs);
    let cbs = Math.max(1000, Math.ceil((maxC-minC)/20/1000)*1000);
    let bk = {};
    costs.forEach(c => { let b=Math.floor(c/cbs)*cbs; bk[b]=(bk[b]||0)+1; });
    let ks = Object.keys(bk).map(Number).sort((a,b)=>a-b);
    drawBarChart($('costChart'), {
        labels: ks.map(k => fmt(k)), values: ks.map(k=>bk[k]),
        colors: ks.map(k => { let r=k/(Math.max(...ks)||1); return r<0.3?'#10b981':r<0.6?'#f59e0b':'#ef4444'; }),
        title: 'Phân bố chi phí (BP)', formatY: v => v.toFixed(0)
    });
}

function drawProbChart() {
    let pL=[], pV=[], pC=[];
    for(let l=1;l<=10;l++) { pL.push('+'+l); pV.push(getSuccessRate(l,state.slots,state.fodderOVR)*100); pC.push(l<=4?'#10b981':l<=7?'#f59e0b':'#ef4444'); }
    drawBarChart($('probabilityChart'), {
        labels: pL, values: pV, colors: pC,
        title: `Tỷ lệ thành công/lần (${state.slots} slot, OVR ${state.fodderOVR})`,
        formatY: v => v.toFixed(1)+'%'
    });
}

function displayResults(results) {
    _lastSimResults = results;
    $('chartPlaceholder').classList.add('hidden');
    $('statsSummary').style.display = 'grid';

    let attempts = results.map(r => r.attempts);
    let costs = results.map(r => r.cost);
    let avgAtt = attempts.reduce((a,b)=>a+b,0)/attempts.length;
    let avgCst = costs.reduce((a,b)=>a+b,0)/costs.length;
    let maxAtt = Math.max(...attempts);
    let perTurnRate = getSuccessRate(state.targetLevel, state.slots, state.fodderOVR);

    $('successRate').textContent = (perTurnRate*100).toFixed(1)+'%';
    $('avgAttempts').textContent = avgAtt.toFixed(1)+'x';
    $('avgCost').textContent = fmt(avgCst)+' B';
    $('worstCase').textContent = maxAtt+'x / '+fmt(maxAtt*state.slots*state.fodderCost)+' B';
    $('totalSimulations').textContent = fmt(state.totalSimulations);
    $('avgCostHeader').textContent = fmt(avgCst)+' B';

    // Only draw the currently visible chart
    drawCurrentChart();

    // Percentile table
    let sorted_att = [...attempts].sort((a,b)=>a-b);
    let sorted_cost = [...costs].sort((a,b)=>a-b);
    let percentiles = [10,25,50,75,90,95,99];
    let ptHTML = '<table class="ref-table"><thead><tr><th>Percentile</th><th>Số lần thử</th><th>Chi phí</th><th>Ý nghĩa</th></tr></thead><tbody>';
    percentiles.forEach(p => {
        let idx = Math.min(Math.floor(p/100*sorted_att.length), sorted_att.length-1);
        let meaning = p<=25?'May mắn':p<=50?'Trung bình':p<=75?'Hơi xui':p<=90?'Xui':'Rất xui';
        let color = p<=25?'#10b981':p<=50?'#00f0ff':p<=75?'#f59e0b':'#ef4444';
        ptHTML += `<tr><td style="color:${color};font-weight:700">${p}%</td><td>${sorted_att[idx]}x</td><td>${fmt(sorted_cost[idx])} B</td><td style="color:${color}">${meaning}</td></tr>`;
    });
    ptHTML += '</tbody></table>';
    $('probTableContainer').innerHTML = ptHTML;
}

drawCurrentChart = function() {
    let activeTab = document.querySelector('.tab-btn.active');
    if(!activeTab || !_lastSimResults) return;
    let tab = activeTab.dataset.tab;
    requestAnimationFrame(() => {
        if(tab === 'distribution') drawDistributionChart(_lastSimResults);
        else if(tab === 'cost') drawCostChart(_lastSimResults);
        else if(tab === 'probability') drawProbChart();
    });
};

// === RUN SIMULATION ===
$('runSimulation').addEventListener('click', () => {
    let btn = $('runSimulation');
    btn.classList.add('running');
    btn.querySelector('.run-text').textContent = 'Đang chạy...';

    setTimeout(() => {
        try {
            let results = runMonteCarlo();
            state.totalSimulations += state.simCount;
            state.simResults = results;
            displayResults(results);
        } catch(e) {
            console.error('Simulation error:', e);
        } finally {
            btn.classList.remove('running');
            btn.querySelector('.run-text').textContent = 'Chạy Mô Phỏng';
        }
    }, 50);
});

// === SINGLE TRY ===
function addLog(msg, type) {
    let log = $('liveLog');
    let entry = document.createElement('div');
    entry.className = 'log-entry log-' + type;
    entry.innerHTML = `<span class="log-time">#${state.liveAttempts}</span><span class="log-msg">${msg}</span>`;
    log.appendChild(entry);
    log.scrollTop = log.scrollHeight;
    if(log.children.length > 200) log.removeChild(log.children[0]);
}

$('trySingle').addEventListener('click', () => {
    if(state.liveLevel >= state.targetLevel) {
        // Reset
        state.liveLevel = state.currentLevel;
        state.liveAttempts = 0; state.liveSuccess = 0;
        state.liveFail = 0; state.liveCost = 0;
        addLog('🔄 Reset! Bắt đầu lại từ +'+state.currentLevel, 'system');
    }

    let result = doSingleUpgrade(state.liveLevel, state.targetLevel);
    state.liveAttempts++;
    state.liveCost += state.fodderCost * state.slots;

    let card = $('playerCard');
    let anim = $('animResult');

    if(result.success) {
        state.liveSuccess++;
        state.liveLevel = result.newLevel;
        card.className = 'player-card upgraded';
        anim.textContent = `✅ Thành công! +${result.newLevel} (${(result.rate*100).toFixed(1)}%)`;
        anim.className = 'anim-result show success';
        addLog(`✅ +${result.newLevel-1} → +${result.newLevel} THÀNH CÔNG! (tỷ lệ: ${(result.rate*100).toFixed(1)}%)`, 'success');

        if(state.liveLevel >= state.targetLevel) {
            addLog(`🏆 ĐẠT MỤC TIÊU +${state.targetLevel}! Tổng: ${state.liveAttempts} lần, ${fmt(state.liveCost)} B`, 'milestone');
        }
    } else {
        state.liveFail++;
        let oldLvl = state.liveLevel;
        if(result.downgraded) {
            state.liveLevel = result.newLevel;
            anim.textContent = `❌ Thất bại + tụt cấp! +${oldLvl} → +${result.newLevel}`;
            addLog(`❌ THẤT BẠI + TỤT CẤP +${oldLvl} → +${result.newLevel} (tỷ lệ: ${(result.rate*100).toFixed(1)}%)`, 'fail');
        } else {
            anim.textContent = `❌ Thất bại! Giữ nguyên +${state.liveLevel}`;
            addLog(`❌ Thất bại, giữ +${state.liveLevel} (tỷ lệ: ${(result.rate*100).toFixed(1)}%)`, 'fail');
        }
        card.className = 'player-card failed';
        anim.className = 'anim-result show fail';
    }

    setTimeout(() => { card.className = 'player-card'; anim.className = 'anim-result'; }, 800);

    updateProgressDisplay();
    $('qsAttempts').textContent = state.liveAttempts;
    $('qsSuccess').textContent = state.liveSuccess;
    $('qsFail').textContent = state.liveFail;
    $('qsCost').textContent = fmt(state.liveCost)+' B';
});

$('clearLog').addEventListener('click', () => {
    $('liveLog').innerHTML = '<div class="log-entry log-system"><span class="log-time">HT</span><span class="log-msg">Log đã xóa.</span></div>';
    state.liveLevel = state.currentLevel;
    state.liveAttempts=0; state.liveSuccess=0; state.liveFail=0; state.liveCost=0;
    updateProgressDisplay();
    $('qsAttempts').textContent='0'; $('qsSuccess').textContent='0';
    $('qsFail').textContent='0'; $('qsCost').textContent='0 B';
});

// === REFERENCE TABLE (uses official FC Online rates) ===
function buildRefTable() {
    let html = '';
    for(let lvl = 1; lvl <= 13; lvl++) {
        let officialRate = (BASE_RATES[lvl]*100).toFixed(0);
        let ovrGain = OVR_GAINS[lvl] || 0;
        let r3 = getSuccessRate(lvl,3,110)*100;
        let avg = r3 > 0 ? Math.ceil(1/(r3/100)) : '∞';
        let dg = (DOWNGRADE_RATES[lvl]*100).toFixed(0)+'%';
        let diff, diffClass, diffW;
        if(lvl<=2){diff='Đảm bảo';diffClass='diff-easy';diffW=20;}
        else if(lvl<=4){diff='Dễ';diffClass='diff-easy';diffW=35;}
        else if(lvl<=6){diff='Trung bình';diffClass='diff-medium';diffW=50;}
        else if(lvl<=8){diff='Khó';diffClass='diff-hard';diffW=70;}
        else{diff='Cực khó';diffClass='diff-extreme';diffW=90;}
        let color = lvl<=2?'#10b981':lvl<=4?'#06b6d4':lvl<=6?'#f59e0b':lvl<=8?'#ef4444':'#ec4899';
        html += '<tr>' +
            '<td style="font-weight:700;color:'+color+'">+'+lvl+'</td>' +
            '<td style="font-weight:700;color:'+color+'">'+officialRate+'%</td>' +
            '<td>+'+ovrGain+' OVR</td>' +
            '<td>~'+avg+'x</td>' +
            '<td>'+dg+'</td>' +
            '<td><span class="difficulty-bar '+diffClass+'" style="width:'+diffW+'px"></span>'+diff+'</td>' +
            '</tr>';
    }
    $('refTableBody').innerHTML = html;
}
buildRefTable();
updateProgressDisplay();

})();
