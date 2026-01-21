/* Promotor de Seguros de Salud 2026 — App (v3)
   Reglas solicitadas:
   1) Justificación legal SOLO si el usuario presiona "Ver fundamentos" (dentro del feedback).
   2) Bloques: hasta 30 preguntas por bloque (7 bloques temáticos). "Todos" contiene 277.
   3) Auditoría automática de integridad al cargar (window.AUDIT).
*/
(() => {
  "use strict";

  // Bandera para detectar que app.js sí cargó (útil si se abre index.html sin extraer el .zip)
  window.PSS_APP_READY = true;

  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const LETTERS = ["A","B","C","D","E","F"];

  const QUESTIONS = Array.isArray(window.PREGUNTAS) ? window.PREGUNTAS : [];
  const BLOCKS = (window.BLOQUES && typeof window.BLOQUES === "object") ? window.BLOQUES : { "Todos": QUESTIONS.map(q => q.id) };
  const AUDIT = window.AUDIT || null;

  const STORE_KEY = "pss_promotor_salud_v3_users";
  const CURRENT_USER_KEY = "pss_promotor_salud_v3_currentUser";

  const toastEl = $("#toast");
  let toastTimer = null;
  function toast(msg, ms=1600){
    if(!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    if(toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), ms);
  }

  function loadStore(){
    try{ return JSON.parse(localStorage.getItem(STORE_KEY) || "{}") || {}; }
    catch{ return {}; }
  }
  function saveStore(store){
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  }

  function ensureUser(store, username){
    if(!store[username]){
      store[username] = {
        createdAt: new Date().toISOString(),
        lastAccess: null,
        answers: {}, // { [id]: { answered:boolean, userAnswer:number, correct:boolean } }
        hints: {},   // hints count by question
      };
    }
    // initialize answer slots (no cambia respuestas existentes)
    for(const q of QUESTIONS){
      if(!store[username].answers[q.id]){
        store[username].answers[q.id] = { answered:false, userAnswer:null, correct:false };
      }
    }
    return store[username];
  }

  function calcStats(user){
    let ok=0, bad=0, ans=0;
    for(const a of Object.values(user.answers)){
      if(a.answered){
        ans++;
        if(a.correct) ok++; else bad++;
      }
    }
    const prog = QUESTIONS.length ? Math.round((ans / QUESTIONS.length) * 100) : 0;
    const acc = ans ? Math.round((ok / ans) * 100) : 0;
    return { ok, bad, ans, prog, acc };
  }

  function blockStats(user, ids){
    let ok=0, ans=0;
    for(const id of ids){
      const a = user.answers[id];
      if(a && a.answered){
        ans++;
        if(a.correct) ok++;
      }
    }
    const pct = ids.length ? Math.round((ok / ids.length) * 100) : 0;
    return { ok, ans, total: ids.length, pct };
  }

  // UI refs
  const loginScreen = $("#loginScreen");
  const appRoot = $("#appRoot");
  const loginForm = $("#loginForm");
  const usernameInput = $("#usernameInput");
  const userListWrap = $("#userListWrap");
  const userList = $("#userList");

  const welcomeLine = $("#welcomeLine");
  const userName = $("#userName");
  const avatar = $("#avatar");
  const logoutBtn = $("#logoutBtn");

  const hdrOk = $("#hdrOk");
  const hdrBad = $("#hdrBad");
  const hdrProg = $("#hdrProg");

  const blockList = $("#blockList");

  const panelStudy = $("#panelStudy");
  const panelGame = $("#panelGame");
  const panelStats = $("#panelStats");

  const modeStudy = $("#modeStudy");
  const modeQuiz = $("#modeQuiz");
  const modeChallenge = $("#modeChallenge");
  const modeStats = $("#modeStats");

  const resetBtn = $("#resetBtn");
  const compactBtn = $("#compactBtn");
  const backBtn = $("#backBtn");
  const exportJsonBtn = $("#exportJsonBtn");
  const exportCsvBtn = $("#exportCsvBtn");
  const missingFilesMsg = $("#missingFilesMsg");

  // Study refs
  const qBlock = $("#qBlock");
  const qText = $("#qText");
  const qPos = $("#qPos");
  const qTotal = $("#qTotal");
  const opts = $("#opts");

  const feedback = $("#feedback");
  const fbText = $("#fbText");
  const fundBtn = $("#fundBtn");
  const fundBox = $("#fundBox");

  const prevBtn = $("#prevBtn");
  const nextBtn = $("#nextBtn");
  const hintBtn = $("#hintBtn");
  const showBtn = $("#showBtn");

  // Game refs
  const gTitle = $("#gTitle");
  const gQText = $("#gQText");
  const gTimer = $("#gTimer");
  const gScore = $("#gScore");
  const gOk = $("#gOk");
  const gBad = $("#gBad");
  const gLeft = $("#gLeft");
  const gOpts = $("#gOpts");
  const gFeedback = $("#gFeedback");
  const gFbText = $("#gFbText");
  const gFundBtn = $("#gFundBtn");
  const gFundBox = $("#gFundBox");
  const gEndBtn = $("#gEndBtn");
  const gNextBtn = $("#gNextBtn");

  // Stats refs
  const sOk = $("#sOk");
  const sBad = $("#sBad");
  const sAns = $("#sAns");
  const sAcc = $("#sAcc");
  const bars = $("#bars");

  const auditBadge = $("#auditBadge");

  function showMissingFiles(){
    if(missingFilesMsg) missingFilesMsg.classList.remove("hidden");
    const btn = loginForm ? loginForm.querySelector('button[type="submit"]') : null;
    if(btn) btn.disabled = true;
    if(auditBadge) auditBadge.textContent = "SIN DATOS";
    toast("No se cargó el banco de preguntas. Extrae el .zip completo y abre index.html desde la carpeta extraída.", 4500);
  }


  // State
  let store = loadStore();
  let currentUser = null;
  let user = null;

  let mode = "study"; // study | quiz | challenge | stats
  let currentBlock = "Todos";
  let currentList = BLOCKS["Todos"] ? [...BLOCKS["Todos"]] : QUESTIONS.map(q => q.id);
  let pos = 0;

  // game state
  let game = null; // { kind, ids, idx, score, ok, bad, timer, interval, maxFails, fails }

  const Q_BY_ID = new Map(QUESTIONS.map(q => [q.id, q]));

  function setPanel(which){
    panelStudy.classList.toggle("show", which === "study");
    panelGame.classList.toggle("show", which === "game");
    panelStats.classList.toggle("show", which === "stats");
  }

  function setActiveModeButtons(){
    const all = [modeStudy, modeQuiz, modeChallenge, modeStats];
    all.forEach(b => b.classList.remove("btnPrimary"));
    // keep them soft/warn by default; highlight with btnPrimary by swapping classes
    modeStudy.classList.add("btnSoft");
    modeQuiz.classList.add("btnSoft");
    modeChallenge.classList.add("btnWarn");
    modeStats.classList.add("btnSoft");

    const mark = (btn) => {
      btn.classList.remove("btnSoft","btnWarn");
      btn.classList.add("btnPrimary");
    };

    if(mode === "study") mark(modeStudy);
    else if(mode === "quiz") mark(modeQuiz);
    else if(mode === "challenge") mark(modeChallenge);
    else if(mode === "stats") mark(modeStats);
  }

  function renderHeader(){
    const st = calcStats(user);
    hdrOk.textContent = st.ok;
    hdrBad.textContent = st.bad;
    hdrProg.textContent = st.prog + "%";
    // stats panel quick refs
    sOk.textContent = st.ok;
    sBad.textContent = st.bad;
    sAns.textContent = st.ans;
    sAcc.textContent = st.acc + "%";
  }

  function renderUserList(){
    const users = Object.keys(store);
    if(users.length === 0){
      userListWrap.classList.add("hidden");
      return;
    }
    userListWrap.classList.remove("hidden");
    userList.innerHTML = "";
    users.sort((a,b) => a.localeCompare(b, "es", { sensitivity:"base" }));
    for(const u of users){
      const udata = store[u];
      const tmpUser = ensureUser(store, u);
      const st = calcStats(tmpUser);
      const item = document.createElement("div");
      item.className = "userItem";
      item.innerHTML = `
        <div style="font-weight:900">${escapeHtml(u)}</div>
        <div class="pill">Progreso: ${st.prog}%</div>
      `;
      item.addEventListener("click", () => {
        usernameInput.value = u;
        usernameInput.focus();
      });
      userList.appendChild(item);
    }
  }

  function renderBlocks(){
    blockList.innerHTML = "";
    const names = Object.keys(BLOCKS);

    // Orden deseado: Todos, 7 bloques, Fuera de Bloques
    const preferred = ["Todos",
      "PBS y Coberturas",
      "Afiliación, Traspasos y Regímenes",
      "Subsidios",
      "Instituciones del SDSS",
      "Derechos y Deberes",
      "Sanciones, Plazos y Procedimientos",
      "Leyes y Resoluciones",
      "Fuera de Bloques"
    ].filter(n => names.includes(n));

    for(const name of preferred){
      const ids = BLOCKS[name] || [];
      const st = blockStats(user, ids);
      const btn = document.createElement("button");
      btn.className = "blockBtn" + (name === currentBlock ? " active" : "");
      btn.innerHTML = `
        <span class="name">${escapeHtml(name)}</span>
        <span class="pill">${st.ok}/${st.total} (${st.pct}%)</span>
      `;
      btn.addEventListener("click", () => {
        currentBlock = name;
        currentList = [...ids];
        pos = 0;
        mode = "study";
        setActiveModeButtons();
        setPanel("study");
        renderBlocks();
        renderStudy();
        toast("Bloque seleccionado: " + name);
      });
      blockList.appendChild(btn);
    }
  }

  function escapeHtml(s){
    return (s ?? "").toString()
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function clampPos(){
    if(currentList.length === 0){ pos = 0; return; }
    if(pos < 0) pos = currentList.length - 1;
    if(pos >= currentList.length) pos = 0;
  }

  function renderStudy(){
    clampPos();
    const qid = currentList[pos];
    const q = Q_BY_ID.get(qid);
    if(!q){
      qText.textContent = "Pregunta no encontrada.";
      opts.innerHTML = "";
      return;
    }

    qBlock.textContent = "Bloque: " + (q.bloque || "—");
    qText.textContent = q.pregunta;
    qPos.textContent = (pos + 1);
    qTotal.textContent = currentList.length;

    // reset feedback (se activa si ya respondió)
    fundBox.classList.remove("show");
    fundBox.textContent = "";
    fundBtn.innerHTML = '<i class="fa-solid fa-scale-balanced"></i> Ver fundamentos';
    feedback.classList.remove("show");

    opts.innerHTML = "";
    const a = user.answers[qid];

    q.opciones.forEach((txt, idx) => {
      const b = document.createElement("button");
      b.className = "opt";
      b.innerHTML = `<div class="badge">${LETTERS[idx] || (idx+1)}</div><div>${escapeHtml(txt)}</div>`;
      if(a.answered){
        const isCorrect = idx === q.correcta;
        const isSelected = a.userAnswer === idx;
        if(isCorrect) b.classList.add("correct");
        if(isSelected) b.classList.add("selected");
        if(isSelected && !isCorrect) b.classList.add("wrong");
        b.disabled = true;
      }else{
        b.addEventListener("click", () => answerStudy(qid, idx));
      }
      opts.appendChild(b);
    });

    // navigation state
    prevBtn.disabled = (currentList.length <= 1);
    nextBtn.disabled = false;

    // show feedback if already answered
    if(a.answered){
      showFeedbackStudy(q, a);
    }
  }

  function showFeedbackStudy(q, a){
    const correctLetter = LETTERS[q.correcta] || (q.correcta + 1);
    fbText.innerHTML = a.correct
      ? `<b>Correcto.</b> La respuesta correcta es la opción ${correctLetter}.`
      : `<b>Incorrecto.</b> La respuesta correcta es la opción ${correctLetter}.`;

    // Fundamentos: solo si existe justificación
    if(q.justificacion && q.justificacion.trim()){
      fundBtn.classList.remove("hidden");
      fundBtn.onclick = () => toggleFundamentos(q.justificacion, fundBox, fundBtn);
    }else{
      fundBtn.classList.add("hidden");
      fundBox.classList.remove("show");
      fundBox.textContent = "";
    }

    feedback.classList.add("show");
  }

  function toggleFundamentos(text, box, btn){
    const isOpen = box.classList.toggle("show");
    if(isOpen){
      box.textContent = "Justificación legal: " + text;
      btn.innerHTML = '<i class="fa-solid fa-eye-slash"></i> Ocultar fundamentos';
    }else{
      box.textContent = "";
      btn.innerHTML = '<i class="fa-solid fa-scale-balanced"></i> Ver fundamentos';
    }
  }

  function answerStudy(qid, idx){
    const q = Q_BY_ID.get(qid);
    const isCorrect = idx === q.correcta;

    {
      const prev = user.answers[qid] || {};
      const ts = prev.answeredAt || new Date().toISOString();
      user.answers[qid] = { ...prev, answered:true, userAnswer: idx, correct: isCorrect, answeredAt: ts };
    }
    user.lastAccess = new Date().toISOString();
    saveStore(store);

    renderHeader();
    renderBlocks();
    renderStudy();

    toast(isCorrect ? "Respuesta correcta" : "Respuesta incorrecta");
  }

  function hint(){
    const qid = currentList[pos];
    const q = Q_BY_ID.get(qid);
    const a = user.answers[qid];
    if(a.answered){
      toast("Pista no disponible: ya respondiste esta pregunta.");
      return;
    }
    const used = user.hints[qid] || 0;
    user.hints[qid] = used + 1;
    saveStore(store);

    // Pista 1: elimina 2 opciones incorrectas visualmente (deshabilita)
    if(used === 0){
      const buttons = $$("#opts .opt");
      const wrong = [];
      for(let i=0;i<q.opciones.length;i++){
        if(i !== q.correcta) wrong.push(i);
      }
      shuffle(wrong);
      const toDisable = wrong.slice(0, Math.min(2, wrong.length));
      toDisable.forEach(i => {
        const b = buttons[i];
        if(b){
          b.disabled = true;
          b.style.opacity = "0.55";
          b.style.filter = "grayscale(1)";
        }
      });
      toast("Pista aplicada: 2 opciones descartadas.");
      return;
    }

    // Pista 2+: muestra letra correcta (sin marcar automáticamente)
    const correctLetter = LETTERS[q.correcta] || (q.correcta+1);
    toast("Pista: la respuesta correcta es la opción " + correctLetter + ".");
  }

  function showAnswer(){
    const qid = currentList[pos];
    const a = user.answers[qid];
    if(a.answered){
      toast("Ya respondiste esta pregunta.");
      return;
    }
    const q = Q_BY_ID.get(qid);
    answerStudy(qid, q.correcta);
  }

  function prev(){
    pos--;
    renderStudy();
  }
  function next(){
    pos++;
    renderStudy();
  }

  // Game
  function startGame(kind){
    // kind: "quiz" (10) o "challenge" (20)
    const count = kind === "challenge" ? 20 : 10;
    const ids = [...BLOCKS["Todos"]];
    shuffle(ids);
    const chosen = ids.slice(0, Math.min(count, ids.length));

    game = {
      kind,
      ids: chosen,
      idx: 0,
      score: 0,
      ok: 0,
      bad: 0,
      maxFails: (kind === "challenge") ? 5 : null,
      fails: 0,
      timer: (kind === "challenge") ? 420 : 300, // 7min vs 5min
      interval: null
    };

    mode = kind;
    setActiveModeButtons();
    setPanel("game");
    renderGame();
    startTimer();
    toast(kind === "challenge" ? "Modo desafío iniciado" : "Quiz iniciado");
  }

  function renderGame(){
    if(!game) return;
    const qid = game.ids[game.idx];
    const q = Q_BY_ID.get(qid);
    if(!q){
      gQText.textContent = "Pregunta no encontrada.";
      gOpts.innerHTML = "";
      return;
    }

    gTitle.textContent = (game.kind === "challenge") ? "Modo Desafío" : "Quiz Cronometrado";
    gQText.textContent = q.pregunta;

    gScore.textContent = game.score;
    gOk.textContent = game.ok;
    gBad.textContent = game.bad;
    gLeft.textContent = Math.max(0, game.ids.length - game.idx - 1);

    gFeedback.classList.remove("show");
    gFundBox.classList.remove("show");
    gFundBox.textContent = "";
    gFundBtn.classList.add("hidden");

    gOpts.innerHTML = "";
    q.opciones.forEach((txt, idx) => {
      const b = document.createElement("button");
      b.className = "opt";
      b.innerHTML = `<div class="badge">${LETTERS[idx] || (idx+1)}</div><div>${escapeHtml(txt)}</div>`;
      b.addEventListener("click", () => answerGame(qid, idx));
      gOpts.appendChild(b);
    });

    gNextBtn.disabled = true;
  }

  function answerGame(qid, idx){
    if(!game) return;
    const q = Q_BY_ID.get(qid);
    const correct = (idx === q.correcta);

    // scoring
    if(correct){
      game.score += 10;
      game.ok++;
    }else{
      game.score -= 5;
      game.bad++;
      if(game.kind === "challenge"){
        game.fails++;
      }
    }

    // also persist as user answer (para estadísticas)
    {
      const prev = user.answers[qid] || {};
      const ts = prev.answeredAt || new Date().toISOString();
      user.answers[qid] = { ...prev, answered:true, userAnswer: idx, correct: correct, answeredAt: ts };
    }
    user.lastAccess = new Date().toISOString();
    saveStore(store);

    // feedback
    const correctLetter = LETTERS[q.correcta] || (q.correcta + 1);
    gFbText.innerHTML = correct
      ? `<b>Correcto. +10</b> — Respuesta: ${correctLetter}.`
      : `<b>Incorrecto. -5</b> — Respuesta: ${correctLetter}.`;

    if(q.justificacion && q.justificacion.trim()){
      gFundBtn.classList.remove("hidden");
      gFundBtn.onclick = () => toggleFundamentos(q.justificacion, gFundBox, gFundBtn);
    }else{
      gFundBtn.classList.add("hidden");
    }

    gFeedback.classList.add("show");

    // lock options
    $$("#gOpts .opt").forEach(b => b.disabled = true);

    // update scoreboard
    gScore.textContent = game.score;
    gOk.textContent = game.ok;
    gBad.textContent = game.bad;

    // challenge lose condition
    if(game.kind === "challenge" && game.fails > game.maxFails){
      endGame("Has superado el límite de errores (" + game.maxFails + ").");
      return;
    }

    gNextBtn.disabled = false;
    renderHeader();
    renderBlocks();
  }

  function nextGame(){
    if(!game) return;
    game.idx++;
    if(game.idx >= game.ids.length){
      endGame("Has completado el juego.");
      return;
    }
    renderGame();
  }

  function startTimer(){
    if(!game) return;
    if(game.interval) clearInterval(game.interval);
    updateTimer();
    game.interval = setInterval(() => {
      game.timer--;
      updateTimer();
      if(game.timer <= 0){
        endGame("Tiempo agotado.");
      }
    }, 1000);
  }

  function updateTimer(){
    if(!game) return;
    const m = Math.floor(game.timer / 60);
    const s = game.timer % 60;
    gTimer.textContent = String(m).padStart(2,"0") + ":" + String(s).padStart(2,"0");
  }

  function endGame(reason){
    if(!game) return;
    if(game.interval) clearInterval(game.interval);
    const summary = `Juego terminado: ${reason}\n\nPuntuación: ${game.score}\nCorrectas: ${game.ok}\nIncorrectas: ${game.bad}`;
    alert(summary);
    game = null;
    mode = "study";
    setActiveModeButtons();
    setPanel("study");
    renderHeader();
    renderBlocks();
    renderStudy();
  }

  // Stats
  function renderStats(){
    renderHeader();
    bars.innerHTML = "";
    const blockNames = Object.keys(BLOCKS).filter(n => n !== "Todos");
    const preferred = ["PBS y Coberturas",
      "Afiliación, Traspasos y Regímenes",
      "Subsidios",
      "Instituciones del SDSS",
      "Derechos y Deberes",
      "Sanciones, Plazos y Procedimientos",
      "Leyes y Resoluciones",
      "Fuera de Bloques"
    ].filter(n => blockNames.includes(n));

    for(const name of preferred){
      const ids = BLOCKS[name];
      const st = blockStats(user, ids);
      const row = document.createElement("div");
      row.className = "barItem";
      row.innerHTML = `
        <div class="left">${escapeHtml(name)}</div>
        <div class="barMeta">
          <div class="bar"><div class="fill" style="width:${st.pct}%"></div></div>
          <div class="pct">${st.pct}%</div>
          <div class="pill">${st.ok}/${st.total}</div>
        </div>
      `;
      bars.appendChild(row);
    }
  }

  // Reset progress
  function resetProgress(){
    if(!confirm("¿Seguro que deseas reiniciar tu progreso? Esta acción no se puede deshacer.")) return;
    for(const q of QUESTIONS){
      user.answers[q.id] = { answered:false, userAnswer:null, correct:false, answeredAt:null };
    }
    user.hints = {};
    user.lastAccess = new Date().toISOString();
    saveStore(store);
    pos = 0;
    toast("Progreso reiniciado.");
    renderHeader();
    renderBlocks();
    if(mode === "stats") renderStats();
    else renderStudy();
  }

  function toggleCompact(){
    document.body.classList.toggle("compact");
    toast(document.body.classList.contains("compact") ? "Vista compacta activada" : "Vista compacta desactivada");
  }

  // Login/logout
  function doLogin(username){
    username = (username || "").trim();
    if(!username) return;
    currentUser = username;
    localStorage.setItem(CURRENT_USER_KEY, username);

    user = ensureUser(store, username);
    user.lastAccess = new Date().toISOString();
    saveStore(store);

    // UI update
    loginScreen.classList.add("hidden");
    appRoot.classList.remove("hidden");

    welcomeLine.textContent = "Bienvenido, " + username;
    userName.textContent = username;
    avatar.textContent = username[0].toUpperCase();

    // audit badge
    if(auditBadge){
      if(AUDIT && AUDIT.ok){
        auditBadge.textContent = "OK (" + (AUDIT.stats?.total_preguntas ?? QUESTIONS.length) + ")";
      }else if(AUDIT){
        auditBadge.textContent = "Con hallazgos";
      }else{
        auditBadge.textContent = "No disponible";
      }
    }

    mode = "study";
    currentBlock = "Todos";
    currentList = [...(BLOCKS["Todos"] || QUESTIONS.map(q => q.id))];
    pos = 0;

    renderHeader();
    renderBlocks();
    renderStudy();
    setActiveModeButtons();

    toast("Sesión iniciada.");
  }

  function doLogout(){
    localStorage.removeItem(CURRENT_USER_KEY);
    currentUser = null;
    user = null;

    // reset ui
    appRoot.classList.add("hidden");
    loginScreen.classList.remove("hidden");
    usernameInput.value = "";
    renderUserList();
    toast("Sesión cerrada.");
  }

  // Exportación (sin dependencias; funciona offline)
  function downloadFile(filename, content, mime){
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 800);
  }

  function csvEscape(v){
    const s = String(v ?? "");
    if(/[\n",]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function buildExport(){
    const st = calcStats(user);
    const byBlock = {};
    for(const [name, ids] of Object.entries(BLOCKS)){
      if(name === "Todos") continue;
      byBlock[name] = blockStats(user, ids);
    }
    return {
      app: "Promotor de Seguros de Salud 2026",
      version: "v3.1",
      exportedAt: new Date().toISOString(),
      user: currentUser,
      stats: st,
      byBlock,
      answers: user.answers,
      audit: AUDIT || null,
    };
  }

  function exportJSON(){
    if(!user) return;
    const data = buildExport();
    const filename = `pss_${(currentUser||"usuario").replace(/\s+/g,"_")}_export.json`;
    downloadFile(filename, JSON.stringify(data, null, 2), "application/json;charset=utf-8");
    toast("Exportado JSON.");
  }

  function exportCSV(){
    if(!user) return;
    const rows = [];
    rows.push(["id","bloque","pregunta","opcion_usuario","opcion_correcta","correcta","respondida","respondida_en"].join(","));
    for(const q of QUESTIONS){
      const a = user.answers[q.id] || { answered:false, userAnswer:null, correct:false, answeredAt:null };
      const userLetter = a.userAnswer === null || a.userAnswer === undefined ? "" : (LETTERS[a.userAnswer] || String(a.userAnswer));
      const corLetter = LETTERS[q.correcta] || String(q.correcta);
      rows.push([
        csvEscape(q.id),
        csvEscape(q.bloque),
        csvEscape(q.pregunta),
        csvEscape(userLetter),
        csvEscape(corLetter),
        csvEscape(a.correct ? "SI" : "NO"),
        csvEscape(a.answered ? "SI" : "NO"),
        csvEscape(a.answeredAt || ""),
      ].join(","));
    }
    const filename = `pss_${(currentUser||"usuario").replace(/\s+/g,"_")}_respuestas.csv`;
    downloadFile(filename, rows.join("\n"), "text/csv;charset=utf-8");
    toast("Exportado CSV.");
  }

  // Helpers
  function shuffle(arr){
    for(let i = arr.length - 1; i > 0; i--){
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // Si no hay preguntas cargadas, se muestra una advertencia clara y se bloquea el login.
  if(!QUESTIONS.length){
    showMissingFiles();
    // Aun así mostramos usuarios existentes, si los hubiera
    renderUserList();
    return;
  }

  // Events
  loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    doLogin(usernameInput.value);
  });

  logoutBtn.addEventListener("click", doLogout);

  modeStudy.addEventListener("click", () => {
    mode = "study";
    setActiveModeButtons();
    setPanel("study");
    renderStudy();
  });

  modeQuiz.addEventListener("click", () => startGame("quiz"));
  modeChallenge.addEventListener("click", () => startGame("challenge"));

  modeStats.addEventListener("click", () => {
    mode = "stats";
    setActiveModeButtons();
    setPanel("stats");
    renderStats();
  });

  backBtn.addEventListener("click", () => {
    mode = "study";
    setActiveModeButtons();
    setPanel("study");
    renderStudy();
  });

  if(exportJsonBtn) exportJsonBtn.addEventListener("click", exportJSON);
  if(exportCsvBtn) exportCsvBtn.addEventListener("click", exportCSV);

  prevBtn.addEventListener("click", prev);
  nextBtn.addEventListener("click", next);
  hintBtn.addEventListener("click", hint);
  showBtn.addEventListener("click", showAnswer);

  resetBtn.addEventListener("click", resetProgress);
  compactBtn.addEventListener("click", toggleCompact);

  gEndBtn.addEventListener("click", () => endGame("Terminado por el usuario."));
  gNextBtn.addEventListener("click", nextGame);

  // Boot
  renderUserList();

  const savedUser = localStorage.getItem(CURRENT_USER_KEY);
  if(savedUser){
    doLogin(savedUser);
  }else{
    // show login
    loginScreen.classList.remove("hidden");
    appRoot.classList.add("hidden");
  }

  // Auditoría automática: si hay advertencias, se notifica en toast (sin bloquear)
  if(AUDIT){
    if(!AUDIT.ok){
      console.warn("AUDITORÍA (errores):", AUDIT.errors);
      toast("Auditoría: se detectaron errores. Revisa la consola.");
    }else if((AUDIT.warnings || []).length){
      console.info("AUDITORÍA (warnings):", AUDIT.warnings);
      toast("Auditoría: OK (con hallazgos menores).");
    }
  }
})();
