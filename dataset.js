// FC Online Tracker dataset seed + storage helpers
(function(){"use strict";
  const YT6 = [
    "33213=66","22=6","1232=6","1=6","13322113211=66","3=6","321=666","2212=6","3=6","312223121=6","21=6","12111233222222=66",
    "1=6","23221211112=6","23=6","3=6","1=6","21=6","2133223312=6","12221112=6","1211131233=6","2113=66","2222=66","112=6","212=6","2222=6","1=6","211=6","1=6","2223=6","21311232=666",
    "11=6","111211=6","23=6","21=6","11211=66","313=6","3=6","233=666","111233=6","1222=66","2=6","2221=6","13=6","2=6","31121222=6","1222=6",
    "2212=6","133321133321=6","1213=6","321122=66","111213211111111=6","2=66","21333122=6","22=6","3=6","33=6"
  ];
  const YT7 = [
    "312334112=7","332=7","223=77","2=7","4222=7","3233232322=7","4132222=7","43142341=7","243344211342333442=7","4421243122434322242434=7","3223322423=7","322224233=7","3=7","1=77","42=777","1=7",
    "337=7","327=7","237=7","227=7","347=7","247=7","437=7","4327=7","2247=7"
  ];
  function recordsFromLines(lines, source, forcedTarget) {
    let records = [];
    let currentBait = "";
    
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i] || "";
      let clean = line.replace(/\([^)]*\)/g, " ").trim();
      
      let hasLetters = /[a-zA-Z\u00c0-\u017f\u1ea0-\u1ef9]/.test(
        clean.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      );
      if (hasLetters && !clean.includes("=")) {
        continue;
      }
      
      let charsOnly = clean.replace(/[^0-9=]/g, "").trim();
      if (!charsOnly) continue;
      
      if (charsOnly.includes("=")) {
        let parts = charsOnly.split("=");
        let left = parts[0], right = parts[1] || "";
        currentBait += left;
        
        let target = forcedTarget ? parseInt(forcedTarget, 10) : parseInt(right[0], 10);
        let drops = currentBait.split("").map(Number).filter(n => n >= 1 && n <= 5);
        
        if (drops.length > 0 && [6,7,8,9].includes(target)) {
          let mainAttempts = right.length || 1;
          records.push({
            target,
            level: target - 1,
            drops,
            mainFails: Math.max(0, mainAttempts - 1),
            source: source || "user_daily",
            createdAt: new Date().toISOString(),
            raw: line,
            forced: !!forcedTarget
          });
        }
        currentBait = "";
      } else {
        let match = charsOnly.match(/^([1-5]+)([6-9]+)$/);
        if (match) {
          let left = match[1];
          let right = match[2];
          currentBait += left;
          
          let target = forcedTarget ? parseInt(forcedTarget, 10) : parseInt(right[0], 10);
          let drops = currentBait.split("").map(Number).filter(n => n >= 1 && n <= 5);
          if (drops.length > 0 && [6,7,8,9].includes(target)) {
            let mainAttempts = right.length;
            records.push({
              target,
              level: target - 1,
              drops,
              mainFails: Math.max(0, mainAttempts - 1),
              source: source || "user_daily",
              createdAt: new Date().toISOString(),
              raw: line,
              forced: !!forcedTarget
            });
          }
          currentBait = "";
        } else {
          let digitsOnly = charsOnly.replace(/[^1-9]/g, "");
          currentBait += digitsOnly;
        }
      }
    }
    
    if (currentBait.length > 0 && forcedTarget) {
      let target = parseInt(forcedTarget, 10);
      let drops = currentBait.split("").map(Number).filter(n => n >= 1 && n <= 5);
      if (drops.length > 0 && [6,7,8,9].includes(target)) {
        records.push({
          target,
          level: target - 1,
          drops,
          mainFails: 0,
          source: source || "user_daily",
          createdAt: new Date().toISOString(),
          raw: "leftover: " + currentBait,
          forced: true
        });
      }
    }
    return records;
  }
  const seedRecords = recordsFromLines(YT6,"youtube_seed").concat(recordsFromLines(YT7,"youtube_seed"));
  const STORAGE_KEY="fc_tracker_learned_records_v1";
  function loadLearned(){ try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]");}catch(e){return [];} }
  function saveLearned(records){ localStorage.setItem(STORAGE_KEY, JSON.stringify(records||[])); }
  window.FC_DATASET={ STORAGE_KEY, seedRecords, recordsFromLines, loadLearned, saveLearned };
})();
