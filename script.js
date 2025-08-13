(() => {
  // DOM
  const imageLoader = document.getElementById('imageLoader');
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const patternDiv = document.getElementById('pattern');
  const colorPaletteDiv = document.getElementById('colorPalette');
  const inputWidth = document.getElementById('inputWidth');
  const inputHeight = document.getElementById('inputHeight');
  const rowCountEl = document.getElementById('rowCount');
  const rowTypeEl = document.getElementById('rowType');
  const stitchCountEl = document.getElementById('stitchCount');
  const btnPrevStitch = document.getElementById('btnPrevStitch');
  const btnNextStitch = document.getElementById('btnNextStitch');
  const btnNextRow = document.getElementById('btnNextRow');
  const btnReset = document.getElementById('btnReset');
  const btnVoiceStart = document.getElementById('btnVoiceStart');
  const sizeChangeAlert = document.getElementById('size-change-alert');

  // ===== 状態 =====
  let totalRows = 0, totalCols = 0;
  let cellMap = []; // index 0 = 最下段
  let currentRow = 1;      // 1..totalRows（1=最下段）
  let currentStitchInRow = 1; // 1..totalCols

  let yarnColors = [
    {hex:'#000000', symbol:'■'},
    {hex:'#ffffff', symbol:'□'},
    {hex:'#ff0000', symbol:'▲'},
    {hex:'#00ff00', symbol:'●'},
    {hex:'#0000ff', symbol:'★'}
  ];

  // ===== util =====
  function hexToRgb(hex){ const bigint = parseInt(hex.slice(1),16); return [(bigint>>16)&255,(bigint>>8)&255, bigint&255]; }
  function rgbToHex(r,g,b){ return '#'+[r,g,b].map(x=>x.toString(16).padStart(2,'0')).join(''); }
  function colorDistance(a,b){ return (a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2; }

  function extractColorsFromImage(imageData, maxColors=5){
    const data = imageData.data;
    const map = new Map();
    for(let i=0;i<data.length;i+=4){
      const hex = rgbToHex(data[i],data[i+1],data[i+2]);
      map.set(hex, (map.get(hex)||0)+1);
    }
    const sorted = [...map.entries()].sort((a,b)=>b[1]-a[1]).slice(0,maxColors).map(x=>x[0]);
    const colors = sorted.slice();
    for(const c of ['#000000','#ffffff','#ff0000','#00ff00','#0000ff']){
      if(colors.length>=maxColors) break;
      if(!colors.includes(c)) colors.push(c);
    }
    return colors.slice(0,maxColors);
  }

  function findNearestColorIndex(hex){
    const rgb = hexToRgb(hex);
    let min=Infinity, idx=0;
    yarnColors.forEach((c,i)=>{
      const d = colorDistance(rgb, hexToRgb(c.hex));
      if(d<min){ min=d; idx=i; }
    });
    return idx;
  }

  // ===== render =====
  function renderPattern(){
    if(!totalRows || !totalCols){
      patternDiv.innerHTML = '<div style="text-align:center;color:#7a5a2a;padding:18px;">編み図がありません</div>';
      return;
    }
    let html = '<table>';
    // 表示は最上段（index totalRows-1）→ 最下段（index 0）
    for(let r = totalRows - 1; r >= 0; r--){
      const rowNumber = r + 1; // 1=最下段
      const isRightToLeft = (rowNumber % 2 === 1); // 奇数段=右→左
      const arrow = isRightToLeft ? '←' : '→';
      html += `<tr data-row="${r}"><td class="row-label">${rowNumber} (${isRightToLeft ? '表' : '裏'}) ${arrow}</td>`;
      const row = cellMap[r];
      for(let c = 0; c < row.length; c++){
        const cell = row[c];
        const color = yarnColors[cell.colorIndex];
        html += `<td data-col="${c}" style="background:${color.hex}">${color.symbol}</td>`;
      }
      html += '</tr>';
    }
    html += '</table>';
    patternDiv.innerHTML = html;
    updateCounterDisplay(true);
  }

  function getColumnIndex(){
    const isRightToLeft = (currentRow % 2 === 1);
    return isRightToLeft ? (totalCols - currentStitchInRow) : (currentStitchInRow - 1);
  }

  function updateCounterDisplay(autoScroll = false){
    rowCountEl.textContent = currentRow;
    rowTypeEl.textContent = (currentRow % 2 === 1) ? '表' : '裏';
    stitchCountEl.textContent = currentStitchInRow;

    patternDiv.querySelectorAll('tr').forEach(tr => tr.classList.remove('current-row'));
    patternDiv.querySelectorAll('td').forEach(td => td.classList.remove('current-stitch'));

    if(!totalRows || !totalCols) return;

    const rowIdx = currentRow - 1;
    const colIdx = getColumnIndex();

    const tr = patternDiv.querySelector(`tr[data-row="${rowIdx}"]`);
    if(tr) tr.classList.add('current-row');

    const td = tr ? tr.querySelector(`td[data-col="${colIdx}"]`) : null;
    if(td){
      td.classList.add('current-stitch');
      if(autoScroll){
        td.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        setTimeout(()=> {
          const rect = td.getBoundingClientRect();
          const viewportHeight = window.innerHeight;
          const counterHeight = document.querySelector('.counter')?.getBoundingClientRect().height || 0;
          if(rect.bottom > (viewportHeight - counterHeight - 16)){
            window.scrollBy({ top: rect.bottom - (viewportHeight - counterHeight) + 20, behavior: 'smooth' });
          } else if(rect.top < 64){
            window.scrollBy({ top: rect.top - 64, behavior: 'smooth' });
          }
        }, 220);
      }
    }
  }

  // ===== ナビゲーション =====
  function incrementStitch(){
    if(currentStitchInRow < totalCols){
      currentStitchInRow++;
    } else if(currentRow < totalRows){
      currentRow++;
      currentStitchInRow = 1;
    }
    updateCounterDisplay(true);
  }
  function decrementStitch(){
    if(currentStitchInRow > 1){
      currentStitchInRow--;
    } else if(currentRow > 1){
      currentRow--;
      currentStitchInRow = totalCols;
    }
    updateCounterDisplay(true);
  }
  function nextRow(){
    if(currentRow < totalRows){
      currentRow++;
      currentStitchInRow = 1;
      updateCounterDisplay(true);
    }
  }
  function resetCounter(){
    currentRow = 1;
    currentStitchInRow = 1;
    updateCounterDisplay(true);
  }

  // ===== 画像→パターン構築 =====
  function buildPatternFromImage(img, w, h){
    canvas.width = w; canvas.height = h;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0,0,w,h);
    ctx.drawImage(img,0,0,w,h);
    const imageData = ctx.getImageData(0,0,w,h);
    const extracted = extractColorsFromImage(imageData,5);
    extracted.forEach((hex,i)=>{ if(yarnColors[i]) yarnColors[i].hex = hex; });
    totalCols = w; totalRows = h;
    cellMap = [];
    for(let y = h-1; y >= 0; y--){
      const row = [];
      for(let x = 0; x < w; x++){
        const idx = (y * w + x) * 4;
        const hex = rgbToHex(imageData.data[idx], imageData.data[idx+1], imageData.data[idx+2]);
        const nearest = findNearestColorIndex(hex);
        row.push({ colorIndex: nearest });
      }
      cellMap.push(row);
    }
    sizeChangeAlert.style.display = 'none';
    renderPattern();
    updateColorPaletteUI();
    resetCounter();
    setTimeout(()=> updateCounterDisplay(true), 120);
  }

  // ===== セル編集 =====
  function onPatternClick(e){
    const td = e.target.closest('td');
    if(!td || td.classList.contains('row-label')) return;
    const tr = td.parentElement;
    const dataRow = Number(tr.dataset.row);
    const dataCol = Number(td.dataset.col);
    if(Number.isInteger(dataRow) && Number.isInteger(dataCol) && cellMap[dataRow] && cellMap[dataRow][dataCol]){
      let idx = cellMap[dataRow][dataCol].colorIndex;
      idx = (idx + 1) % yarnColors.length;
      cellMap[dataRow][dataCol].colorIndex = idx;
      renderPattern();
    }
  }

  // ===== パレット =====
  function updateColorPaletteUI(){
    colorPaletteDiv.innerHTML = '';
    yarnColors.forEach((c,i)=>{
      const sw = document.createElement('div'); sw.className='color-swatch'; sw.style.background = c.hex;
      const lbl = document.createElement('div'); lbl.className='color-label'; lbl.textContent = c.symbol;
      const inp = document.createElement('input'); inp.type='color'; inp.value = c.hex;
      inp.addEventListener('input', (ev)=>{ yarnColors[i].hex = ev.target.value; sw.style.background = ev.target.value; renderPattern(); });
      sw.appendChild(lbl); sw.appendChild(inp); colorPaletteDiv.appendChild(sw);
    });
  }

  // ===== イベント =====
  imageLoader.addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    if(!file) return;
    const img = new Image();
    const reader = new FileReader();
    reader.onload = ev => {
      img.onload = () => {
        const w = Math.max(4, Math.min(64, parseInt(inputWidth.value)||20));
        const h = Math.max(4, Math.min(64, parseInt(inputHeight.value)||20));
        buildPatternFromImage(img, w, h);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });

  patternDiv.addEventListener('click', onPatternClick);
  inputWidth.addEventListener('change', ()=> sizeChangeAlert.style.display = 'block');
  inputHeight.addEventListener('change', ()=> sizeChangeAlert.style.display = 'block');

  btnNextStitch.addEventListener('click', ()=> incrementStitch());
  btnPrevStitch.addEventListener('click', ()=> decrementStitch());
  btnNextRow.addEventListener('click', ()=> nextRow());
  btnReset.addEventListener('click', ()=> resetCounter());

  // ===== 音声認識（デフォルト連続待機 / 停止で完全停止）=====
  let recognition = null;
  let recognizing = false;
  let shouldBeListening = false; // true の間は自動再開を続ける
  let restartTimer = null;

  function initRecognition(){
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if(!SR) return null;
    const rec = new SR();
    rec.lang = 'ja-JP';
    rec.interimResults = false;
    rec.continuous = true;

    rec.onstart = () => {
      recognizing = true;
      btnVoiceStart.textContent = '音声停止（連続待機中）';
      btnVoiceStart.style.background = '#a05a00';
      // 念のためTTSは常にキャンセル（他の要因で鳴っていたら止める）
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    };

    rec.onend = () => {
      recognizing = false;
      btnVoiceStart.textContent = '音声操作開始';
      btnVoiceStart.style.background = '';
      if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }
      if (shouldBeListening) {
        // すぐstartするとInvalidStateになる端末があるので少し待つ
        restartTimer = setTimeout(() => { try { rec.start(); } catch(_){} }, 300);
      }
    };

    rec.onerror = (e) => {
      console.warn('Speech error', e);
      if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }
      if (shouldBeListening) {
        restartTimer = setTimeout(() => { try { rec.start(); } catch(_){} }, 600);
      }
    };

    rec.onresult = (ev) => {
      for (let i = ev.resultIndex; i < ev.results.length; i++){
        if (ev.results[i].isFinal){
          const text = ev.results[i][0].transcript.trim();
          console.log('音声:', text);
          handleVoiceCommand(text);
          // ★ここでは何も喋らない（完全ミュート）
        }
      }
    };

    // Androidでたまに音声終了イベント後に止まる対策（効かない端末もある）
    rec.onaudioend = () => {/* no-op */};
    rec.onspeechend = () => {/* no-op */};

    return rec;
  }

  function handleVoiceCommand(text){
    const t = text.replace(/\s+/g,'').toLowerCase();
    if(/次の段|つぎのだん|次へ|すすむ|次/.test(t)){ nextRow(); return; }
    if(/目プラス|めぷらす|目を進め|一つ進|すすめ|プラス|\+/.test(t)){ incrementStitch(); return; }
    if(/目マイナス|めまいなす|目を戻|一つ戻|もどる|マイナス|\-/.test(t)){ decrementStitch(); return; }
    if(/リセット|さいしょ|最初に戻/.test(t)){ resetCounter(); return; }
    if(/終了|ストップ|やめる|停止/.test(t)){
      shouldBeListening = false;     // 以降は自動再開しない
      if (recognition) { try { recognition.stop(); } catch(_) {} }
      return;
    }
  }

  // 完全ミュート（TTS/バイブなし）
  function speak(_text){ /* no-op (mute) */ }

  // ボタン：開始/停止トグル
  btnVoiceStart.addEventListener('click', ()=>{
    if (!recognition) {
      recognition = initRecognition();
      if (!recognition) {
        alert('このブラウザは音声認識に対応していません。Chrome等で試してください');
        return;
      }
    }
    if (recognizing) {
      // 停止：自動再開もしない
      shouldBeListening = false;
      if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }
      try { recognition.stop(); } catch(_) {}
    } else {
      // 連続待機開始：以降 shouldBeListening が true の間はonend/onerrorで自動再開
      shouldBeListening = true;
      try { recognition.start(); } catch(_) {}
    }
  });

  // ===== 初期化 =====
  updateColorPaletteUI();
  resetCounter();

  // デバッグ用
  window._knitApp = { incrementStitch, decrementStitch, nextRow, resetCounter, renderPattern, cellMap, yarnColors };

})();
