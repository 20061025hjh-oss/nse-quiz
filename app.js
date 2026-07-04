const TOTAL_QUESTIONS = 50;
const POINTS_PER_QUESTION = 2;
const LOCAL_KEY = 'nse_quiz_leaderboard_cloud_fallback_v1';
const TABLE_NAME = 'quiz_attempts';
const LEADERBOARD_COLUMNS = 'id,name,score,correct_count,total_count,duration_seconds,answers,details,created_at';

const els = {
  bankCount: document.querySelector('#bankCount'),
  cloudStatus: document.querySelector('#cloudStatus'),
  startScreen: document.querySelector('#startScreen'),
  quizScreen: document.querySelector('#quizScreen'),
  resultScreen: document.querySelector('#resultScreen'),
  leaderboardScreen: document.querySelector('#leaderboardScreen'),
  userName: document.querySelector('#userName'),
  startBtn: document.querySelector('#startBtn'),
  openBoardBtn: document.querySelector('#openBoardBtn'),
  checkCloudBtn: document.querySelector('#checkCloudBtn'),
  quizTitle: document.querySelector('#quizTitle'),
  quizMeta: document.querySelector('#quizMeta'),
  answeredCount: document.querySelector('#answeredCount'),
  timer: document.querySelector('#timer'),
  progressBar: document.querySelector('#progressBar'),
  quizForm: document.querySelector('#quizForm'),
  submitBtn: document.querySelector('#submitBtn'),
  backHomeBtn: document.querySelector('#backHomeBtn'),
  resultTitle: document.querySelector('#resultTitle'),
  resultMeta: document.querySelector('#resultMeta'),
  scoreValue: document.querySelector('#scoreValue'),
  answerReview: document.querySelector('#answerReview'),
  againBtn: document.querySelector('#againBtn'),
  showWrongBtn: document.querySelector('#showWrongBtn'),
  showAllAnswersBtn: document.querySelector('#showAllAnswersBtn'),
  boardFromResultBtn: document.querySelector('#boardFromResultBtn'),
  boardBackBtn: document.querySelector('#boardBackBtn'),
  podium: document.querySelector('#podium'),
  rankRows: document.querySelector('#rankRows'),
  storageNote: document.querySelector('#storageNote'),
  leaderboardHint: document.querySelector('#leaderboardHint')
};

let state = {
  name: '',
  quiz: [],
  answers: {},
  startedAt: null,
  timerId: null,
  lastResult: null,
  lastScreen: 'startScreen'
};

let supabaseClient = null;
let cloudReady = false;
let realtimeChannel = null;
let pollingTimer = null;

function escapeHTML(str) {
  return String(str ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function show(screen) {
  ['startScreen','quizScreen','resultScreen','leaderboardScreen'].forEach(k => els[k].classList.add('hidden'));
  els[screen].classList.remove('hidden');
  window.scrollTo({top: 0, behavior: 'smooth'});
}

function formatTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const pad = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function elapsedText() {
  if (!state.startedAt) return '00:00';
  const s = elapsedSeconds();
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

function elapsedSeconds() {
  if (!state.startedAt) return 0;
  return Math.max(0, Math.floor((Date.now() - state.startedAt) / 1000));
}

function updateTimer() { els.timer.textContent = elapsedText(); }

function selectedFor(q) {
  if (q.type === 'multiple') {
    return Array.from(document.querySelectorAll(`input[name="q-${q.id}"]:checked`)).map(i => i.value).sort().join('');
  }
  const picked = document.querySelector(`input[name="q-${q.id}"]:checked`);
  return picked ? picked.value : '';
}

function syncAnswers() {
  for (const q of state.quiz) state.answers[q.id] = selectedFor(q);
  const answered = Object.values(state.answers).filter(Boolean).length;
  els.answeredCount.textContent = `已答 ${answered}/${state.quiz.length}`;
  els.progressBar.style.width = state.quiz.length ? `${(answered / state.quiz.length) * 100}%` : '0%';
}

function renderQuiz() {
  els.quizForm.innerHTML = state.quiz.map((q, idx) => {
    const inputType = q.type === 'multiple' ? 'checkbox' : 'radio';
    const typeName = q.type === 'multiple' ? '多选题' : '单选题';
    const options = ['A','B','C','D'].map(letter => `
      <label class="option">
        <input type="${inputType}" name="q-${q.id}" value="${letter}" />
        <span class="option-letter">${letter}</span>
        <span>${escapeHTML(q.options[letter])}</span>
      </label>`).join('');
    return `
      <article class="question-card" id="card-${q.id}">
        <div class="q-head">
          <div>
            <div class="q-index">第 ${idx + 1} 题</div>
            <p class="q-title">${escapeHTML(q.question)}</p>
          </div>
          <span class="q-type">${typeName}</span>
        </div>
        <div class="options">${options}</div>
      </article>`;
  }).join('');
  els.quizForm.addEventListener('change', syncAnswers, {once:false});
  syncAnswers();
}

function startQuiz() {
  const name = els.userName.value.trim();
  if (!name) {
    els.userName.focus();
    alert('请先输入姓名。');
    return;
  }
  state.name = name;
  state.quiz = shuffle(window.QUESTION_BANK).slice(0, Math.min(TOTAL_QUESTIONS, window.QUESTION_BANK.length));
  state.answers = {};
  state.startedAt = Date.now();
  clearInterval(state.timerId);
  state.timerId = setInterval(updateTimer, 1000);
  els.quizTitle.textContent = `${name} 的答题卷`;
  els.quizMeta.textContent = `本次随机抽取 ${state.quiz.length} 题，每题 ${POINTS_PER_QUESTION} 分。多选题需要完全选对才得分。`;
  updateTimer();
  renderQuiz();
  show('quizScreen');
}

function answerText(q, letters) {
  return answerTextFromOptions(q.options, letters);
}

function answerTextFromOptions(options, letters) {
  if (!letters) return '未作答';
  return letters.split('').map(l => `${l}. ${options[l] || ''}`).join('；');
}

function gradeQuiz() {
  syncAnswers();
  let correctCount = 0;
  const details = state.quiz.map((q, index) => {
    const userAnswer = state.answers[q.id] || '';
    const correctAnswer = q.answer;
    const isCorrect = userAnswer === correctAnswer;
    if (isCorrect) correctCount++;
    return {
      index: index + 1,
      questionId: q.id,
      type: q.type,
      question: q.question,
      options: {...q.options},
      userAnswer,
      correctAnswer,
      userAnswerText: answerText(q, userAnswer),
      correctAnswerText: answerText(q, correctAnswer),
      isCorrect
    };
  });
  const totalCount = state.quiz.length;
  const score = correctCount * POINTS_PER_QUESTION;
  const createdAt = new Date().toISOString();
  return {
    name: state.name,
    score,
    correctCount,
    totalCount,
    wrongCount: totalCount - correctCount,
    details,
    answers: details.map(({questionId, userAnswer, correctAnswer, isCorrect}) => ({
      questionId,
      userAnswer,
      correctAnswer,
      isCorrect
    })),
    duration: elapsedText(),
    durationSeconds: elapsedSeconds(),
    createdAt
  };
}

async function submitQuiz() {
  syncAnswers();
  const unanswered = state.quiz.length - Object.values(state.answers).filter(Boolean).length;
  if (unanswered > 0 && !confirm(`还有 ${unanswered} 题未作答，确认提交吗？`)) return;
  clearInterval(state.timerId);
  const result = gradeQuiz();
  els.submitBtn.disabled = true;
  els.submitBtn.textContent = '提交中...';
  try {
    const saved = await saveAttempt({
      name: result.name,
      score: result.score,
      correctCount: result.correctCount,
      totalCount: result.totalCount,
      duration: result.duration,
      durationSeconds: result.durationSeconds,
      answers: result.answers,
      details: result.details,
      createdAt: result.createdAt
    });
    if (saved?.createdAt) result.createdAt = saved.createdAt;
    state.lastResult = result;
    renderResult(result, false);
    show('resultScreen');
    renderLeaderboard().catch(error => console.error(error));
  } finally {
    els.submitBtn.disabled = false;
    els.submitBtn.textContent = '提交并查看结果';
  }
}

function renderResult(result, wrongOnly = false) {
  els.scoreValue.textContent = result.score;
  els.resultTitle.textContent = `${result.name} 的本次成绩`;
  els.resultMeta.textContent = `正确 ${result.correctCount}/${result.totalCount} 题，错题 ${result.wrongCount} 题，用时 ${result.duration}。提交时间：${formatTime(result.createdAt)}`;
  const list = wrongOnly ? result.details.filter(d => !d.isCorrect) : result.details;
  if (wrongOnly && list.length === 0) {
    els.answerReview.innerHTML = '<div class="empty-board">本次没有错题。</div>';
    return;
  }
  els.answerReview.innerHTML = list.map((item) => `
    <article class="review-card ${item.isCorrect ? 'correct' : 'wrong'}">
      <div class="review-top">
        <span>第 ${item.index} 题 · ${item.type === 'multiple' ? '多选题' : '单选题'}</span>
        <span class="status ${item.isCorrect ? 'correct' : 'wrong'}">${item.isCorrect ? '正确' : '错误'}</span>
      </div>
      <div class="review-q">${escapeHTML(item.question)}</div>
      <div class="review-answer">
        <div class="answer-line"><strong>你的答案：</strong>${escapeHTML(item.userAnswerText || answerTextFromOptions(item.options, item.userAnswer))}</div>
        <div class="answer-line"><strong>正确答案：</strong>${escapeHTML(item.correctAnswerText || answerTextFromOptions(item.options, item.correctAnswer))}</div>
      </div>
    </article>`).join('');
}

function localRecords() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); }
  catch { return []; }
}

function saveLocal(record) {
  const rows = localRecords();
  rows.push({...record, id: globalThis.crypto?.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random())});
  localStorage.setItem(LOCAL_KEY, JSON.stringify(rows));
}

function normalizeRecord(r) {
  const correctCount = Number(r.correct_count ?? r.correctCount ?? r.correct ?? 0);
  const totalCount = Number(r.total_count ?? r.totalCount ?? r.total ?? TOTAL_QUESTIONS);
  const createdAt = r.created_at || r.createdAt || r.submitted_at || r.submittedAt || new Date().toISOString();
  const durationSeconds = Number(r.duration_seconds ?? r.durationSeconds ?? 0);
  return {
    id: r.id,
    name: r.name,
    score: Number(r.score),
    correctCount,
    totalCount,
    durationSeconds,
    duration: r.duration || (durationSeconds ? formatDuration(durationSeconds) : ''),
    answers: r.answers || [],
    details: r.details || [],
    createdAt,
    correct: correctCount,
    total: totalCount,
    submittedAt: createdAt
  };
}

function sortRecords(rows) {
  return [...rows].map(normalizeRecord).sort((a,b) => {
    const scoreDiff = b.score - a.score;
    if (scoreDiff) return scoreDiff;
    return new Date(a.createdAt) - new Date(b.createdAt);
  });
}

function formatDuration(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

function setCloudStatus(status, type = 'checking') {
  const textMap = {
    ready: '云端已连接 · 实时排行',
    fallback: '云端未配置 · 本机预览',
    error: '云端连接失败',
    checking: '云端连接检测中'
  };
  els.cloudStatus.textContent = textMap[type] || status;
  els.cloudStatus.className = `cloud-pill ${type}`;
  els.storageNote.textContent = status;
}

function hasValidConfig() {
  const cfg = window.SUPABASE_CONFIG || {};
  const badUrl = !cfg.url || cfg.url.includes('PASTE_YOUR') || !/^https:\/\//.test(cfg.url);
  const badKey = !cfg.anonKey || cfg.anonKey.includes('PASTE_YOUR') || cfg.anonKey.length < 20;
  return !badUrl && !badKey;
}

async function initSupabase() {
  setCloudStatus('正在检测 Supabase 云端连接...', 'checking');
  cloudReady = false;
  supabaseClient = null;

  if (!hasValidConfig()) {
    setCloudStatus('尚未填写 supabase-config.js。当前只能本机预览；部署前请按 README 配置 Supabase。', 'fallback');
    return false;
  }
  if (!window.supabase?.createClient) {
    setCloudStatus('Supabase JS 加载失败。请检查网络或 CDN 是否被拦截。', 'error');
    return false;
  }

  try {
    supabaseClient = window.supabase.createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.anonKey);
    const { error } = await supabaseClient
      .from(TABLE_NAME)
      .select('id', { count: 'exact', head: true });
    if (error) throw error;
    cloudReady = true;
    setCloudStatus('已连接云端排行榜：所有手机访问同一网址后，提交成绩会统一入库并实时刷新。', 'ready');
    subscribeLeaderboard();
    return true;
  } catch (error) {
    console.error(error);
    setCloudStatus(`云端连接失败：${error.message || '请检查 SQL、URL、anon key 和 RLS 策略。'}`, 'error');
    return false;
  }
}

async function saveAttempt(record) {
  const payload = {
    name: String(record.name || '').trim().slice(0,20),
    score: Math.round(record.score),
    correct_count: Math.round(record.correctCount ?? record.correct ?? 0),
    total_count: Math.round(record.totalCount ?? record.total ?? TOTAL_QUESTIONS),
    duration_seconds: Math.max(0, Math.round(record.durationSeconds || 0)),
    answers: Array.isArray(record.answers) ? record.answers : [],
    details: Array.isArray(record.details) ? record.details : []
  };

  if (cloudReady && supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from(TABLE_NAME)
        .insert(payload)
        .select(LEADERBOARD_COLUMNS)
        .single();
      if (error) throw error;
      return normalizeRecord(data);
    } catch (error) {
      console.error(error);
      alert(`云端保存失败：${error.message || '未知错误'}。本次成绩会暂存到本机浏览器。`);
      setCloudStatus(`云端保存失败：${error.message || '请检查 Supabase 配置。'}`, 'error');
    }
  }

  const fallback = {...payload, createdAt: record.createdAt || new Date().toISOString()};
  saveLocal(fallback);
  return normalizeRecord(fallback);
}

async function loadLeaderboard() {
  if (cloudReady && supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from(TABLE_NAME)
        .select(LEADERBOARD_COLUMNS)
        .order('score', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(1000);
      if (error) throw error;
      return sortRecords(data || []);
    } catch (error) {
      console.error(error);
      setCloudStatus(`排行榜读取失败：${error.message || '请检查 Supabase 配置。'}`, 'error');
    }
  }
  return sortRecords(localRecords());
}

function subscribeLeaderboard() {
  if (!cloudReady || !supabaseClient || realtimeChannel) return;
  realtimeChannel = supabaseClient
    .channel('quiz-attempts-realtime-rank')
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLE_NAME }, async () => {
      if (!els.leaderboardScreen.classList.contains('hidden')) await renderLeaderboard();
    })
    .subscribe(status => {
      if (status === 'SUBSCRIBED') {
        els.leaderboardHint.textContent = '实时同步已开启：有人提交成绩后，此页面会自动刷新。';
        stopPolling();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        els.leaderboardHint.textContent = '实时通道暂不可用，已改为每 8 秒自动刷新。';
        startPolling();
      }
    });
}

function startPolling() {
  stopPolling();
  pollingTimer = setInterval(() => {
    if (!els.leaderboardScreen.classList.contains('hidden')) renderLeaderboard();
  }, 8000);
}

function stopPolling() {
  if (pollingTimer) clearInterval(pollingTimer);
  pollingTimer = null;
}

async function renderLeaderboard() {
  const rows = await loadLeaderboard();
  if (!rows.length) {
    els.podium.innerHTML = document.querySelector('#emptyBoardTemplate').innerHTML;
    els.rankRows.innerHTML = '';
    return;
  }
  const medals = ['🥇','🥈','🥉'];
  els.podium.innerHTML = rows.slice(0,3).map((r,i) => `
    <article class="podium-card rank-${i+1}">
      <div class="medal">${medals[i]}</div>
      <div class="podium-name">${escapeHTML(r.name)}</div>
      <div class="podium-score">${r.score} 分</div>
      <div class="podium-time">正确 ${r.correctCount}/${r.totalCount}<br>${formatTime(r.createdAt)}</div>
    </article>`).join('');
  els.rankRows.innerHTML = rows.map((r,i) => `
    <tr>
      <td class="rank-number">${i + 1}</td>
      <td>${escapeHTML(r.name)}</td>
      <td><strong>${r.score}</strong></td>
      <td>${r.correctCount}/${r.totalCount}</td>
      <td>${formatTime(r.createdAt)}</td>
    </tr>`).join('');
}

async function openBoard() {
  state.lastScreen = els.resultScreen.classList.contains('hidden') ? 'startScreen' : 'resultScreen';
  await renderLeaderboard();
  if (cloudReady) subscribeLeaderboard();
  if (!cloudReady) els.leaderboardHint.textContent = '当前为本机预览排行；填写 Supabase 配置并部署后，所有人会看到同一个实时排行榜。';
  show('leaderboardScreen');
}

function goBoardBack() {
  show(state.lastScreen || 'startScreen');
}

async function init() {
  if (!Array.isArray(window.QUESTION_BANK)) {
    alert('题库加载失败，请检查 questions.js 是否存在。');
    return;
  }
  els.bankCount.textContent = `题库共 ${window.QUESTION_BANK.length} 题`;
  await initSupabase();
}

els.startBtn.addEventListener('click', startQuiz);
els.userName.addEventListener('keydown', e => { if (e.key === 'Enter') startQuiz(); });
els.submitBtn.addEventListener('click', submitQuiz);
els.backHomeBtn.addEventListener('click', () => {
  if (confirm('确认退出本次答题吗？当前作答不会保存。')) {
    clearInterval(state.timerId);
    show('startScreen');
  }
});
els.againBtn.addEventListener('click', () => { show('startScreen'); setTimeout(() => els.startBtn.focus(), 50); });
els.showWrongBtn.addEventListener('click', () => state.lastResult && renderResult(state.lastResult, true));
els.showAllAnswersBtn.addEventListener('click', () => state.lastResult && renderResult(state.lastResult, false));
els.openBoardBtn.addEventListener('click', openBoard);
els.boardFromResultBtn.addEventListener('click', openBoard);
els.boardBackBtn.addEventListener('click', goBoardBack);
els.checkCloudBtn.addEventListener('click', initSupabase);

init();
