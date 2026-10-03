// Score-Tool 前端（纯 JS，无框架）
// ⚠️ 部署后把下面这行换成你的 Worker 地址（wrangler deploy 输出的 URL）
const API_BASE = "https://scoretool-api.947219346.workers.dev";

const $ = id => document.getElementById(id);
let token = localStorage.getItem("st_token") || "";
let me = null;
let currentRoom = null;
let roomTab = "current";
let pollTimer = null;

// ---------- API ----------
async function api(path, opts = {}) {
  opts.headers = opts.headers || {};
  if (token) opts.headers["Authorization"] = "Bearer " + token;
  if (opts.body && typeof opts.body !== "string") {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(API_BASE + path, opts);
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error(data.error || ("错误 " + res.status));
  return data;
}

// ---------- 视图切换 ----------
function show(view) {
  ["view-auth", "view-home", "view-room"].forEach(v => $(v).style.display = (v === view) ? "block" : "none");
}
function setMsg(el, text, isErr) {
  el.textContent = text || "";
  el.className = "msg" + (isErr ? " err" : "");
}

// ---------- 登录 / 注册 ----------
let authMode = "login";
$("tab-login").onclick = () => {
  authMode = "login";
  $("tab-login").classList.add("active"); $("tab-register").classList.remove("active");
  $("auth-nickname").style.display = "none"; $("auth-submit").textContent = "登录";
};
$("tab-register").onclick = () => {
  authMode = "register";
  $("tab-register").classList.add("active"); $("tab-login").classList.remove("active");
  $("auth-nickname").style.display = "block"; $("auth-submit").textContent = "注册";
};
$("auth-submit").onclick = async () => {
  const username = $("auth-username").value.trim();
  const password = $("auth-password").value;
  const nickname = $("auth-nickname").value.trim();
  setMsg($("auth-msg"), "处理中…", false);
  try {
    const data = await api("/api/" + authMode, { method: "POST", body: { username, password, nickname } });
    token = data.token; localStorage.setItem("st_token", token); me = data.user;
    enterHome();
  } catch (e) { setMsg($("auth-msg"), e.message, true); }
};
$("btn-logout").onclick = () => {
  token = ""; me = null; localStorage.removeItem("st_token");
  stopPoll(); show("view-auth");
};

// ---------- 首页 ----------
async function enterHome() {
  show("view-home");
  $("home-user").textContent = me ? ("👤 " + (me.nickname || me.username)) : "";
  await loadRooms();
}
async function loadRooms() {
  try {
    const data = await api("/api/rooms");
    const list = $("room-list"); list.innerHTML = "";
    const rooms = data.rooms || [];
    if (!rooms.length) { list.innerHTML = `<div class="empty">还没有房间，下面创建一个或加入一个</div>`; return; }
    rooms.forEach(r => {
      const d = document.createElement("div");
      d.className = "item";
      d.innerHTML = `<span>${esc(r.name)} <small>#${esc(r.room_no)}</small></span><span class="arrow">›</span>`;
      d.onclick = () => enterRoom(r.room_no);
      list.appendChild(d);
    });
  } catch (e) { alert(e.message); }
}
$("btn-create").onclick = async () => {
  const name = $("create-name").value.trim() || "牌局";
  try { const d = await api("/api/rooms", { method: "POST", body: { name } }); enterRoom(d.room_no); }
  catch (e) { alert(e.message); }
};
$("btn-join").onclick = async () => {
  const room_no = $("join-no").value.trim();
  if (!room_no) { alert("请输入房间号"); return; }
  try { await api("/api/rooms/join", { method: "POST", body: { room_no } }); enterRoom(room_no); }
  catch (e) { alert(e.message); }
};

// ---------- 房间 ----------
async function enterRoom(roomNo) {
  currentRoom = roomNo;
  show("view-room");
  roomTab = "current";
  switchTab("current");
  $("room-no").textContent = "#" + roomNo;
  await loadRoom();
  startPoll();
}
function startPoll() {
  stopPoll();
  pollTimer = setInterval(async () => {
    try {
      if (roomTab === "current") await loadRoom();
      else if (roomTab === "history") await loadHistory();
      else if (roomTab === "chart") await loadChart();
    } catch (e) {}
  }, 3000);
}
function stopPoll() { if (pollTimer) clearInterval(pollTimer); pollTimer = null; }
$("btn-back").onclick = () => { stopPoll(); currentRoom = null; enterHome(); };

$("tab-current").onclick = () => switchTab("current");
$("tab-history").onclick = () => switchTab("history");
$("tab-chart").onclick = () => switchTab("chart");
function switchTab(t) {
  roomTab = t;
  $("tab-current").classList.toggle("active", t === "current");
  $("tab-history").classList.toggle("active", t === "history");
  $("tab-chart").classList.toggle("active", t === "chart");
  $("panel-current").style.display = t === "current" ? "block" : "none";
  $("panel-history").style.display = t === "history" ? "block" : "none";
  $("panel-chart").style.display = t === "chart" ? "block" : "none";
  if (t === "history") loadHistory();
  if (t === "chart") loadChart();
}

async function loadRoom() {
  const d = await api("/api/rooms/" + currentRoom);
  $("room-title").textContent = d.room.name;
  const ml = $("member-list"); ml.innerHTML = "";
  (d.members || []).forEach(m => {
    const div = document.createElement("div"); div.className = "item";
    div.innerHTML = `<span>${esc(m.nickname || m.username)}</span><b>${m.cum_score}</b>`;
    ml.appendChild(div);
  });
  const cl = $("contrib-list"); cl.innerHTML = "";
  if (!d.contributions.length) cl.innerHTML = `<div class="empty">本轮还没人出钱</div>`;
  (d.contributions || []).forEach(c => {
    const div = document.createElement("div"); div.className = "item";
    div.innerHTML = `<span>${esc(c.nickname)}</span><b>出 ${c.amount}</b>`;
    cl.appendChild(div);
  });
}

$("btn-contrib").onclick = async () => {
  const amount = parseInt($("contrib-amount").value, 10);
  if (!(amount > 0)) { alert("请输入正整数金额"); return; }
  try {
    await api("/api/rooms/" + currentRoom + "/contribute", { method: "POST", body: { amount } });
    $("contrib-amount").value = ""; await loadRoom();
  } catch (e) { alert(e.message); }
};
$("btn-settle").onclick = async () => {
  if (!confirm("确认你是本回合赢家，收下奖池？")) return;
  try { await api("/api/rooms/" + currentRoom + "/settle", { method: "POST", body: {} }); await loadRoom(); }
  catch (e) { alert(e.message); }
};
$("btn-cancel").onclick = async () => {
  if (!confirm("确认取消本回合？本轮所有出钱将撤销，不计入历史。")) return;
  try { await api("/api/rooms/" + currentRoom + "/cancel", { method: "POST", body: {} }); await loadRoom(); }
  catch (e) { alert(e.message); }
};

async function loadHistory() {
  const d = await api("/api/rooms/" + currentRoom + "/history");
  const el = $("history-list"); el.innerHTML = "";
  const rounds = d.rounds || [];
  if (!rounds.length) { el.innerHTML = `<div class="empty">还没有已结算的回合</div>`; return; }
  rounds.slice().reverse().forEach(r => {
    const div = document.createElement("div"); div.className = "item round";
    const contrib = (r.contributions || []).map(c => `${esc(c.nickname)}出${c.amount}`).join("、");
    div.innerHTML =
      `<div class="r-head"><span>第 ${r.round_no} 局</span>` +
      (r.status === "settled" ? `<b>赢家 ${esc(r.winner_name || "")} +${r.pot}</b>` : `<span>进行中</span>`) +
      `</div><div class="r-body">${contrib || "无出钱"}</div>`;
    el.appendChild(div);
  });
}
async function loadChart() {
  const d = await api("/api/rooms/" + currentRoom + "/chart");
  drawChart($("chart"), d.axis, d.series);
}

// ---------- 工具 ----------
function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function drawChart(canvas, axis, series) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const pad = 38, plotW = W - pad * 2, plotH = H - pad * 2;
  let maxY = 0, minY = 0;
  (series || []).forEach(s => (s.points || []).forEach(v => { maxY = Math.max(maxY, v); minY = Math.min(minY, v); }));
  if (maxY === minY) { maxY += 1; minY -= 1; }
  const n = axis.length;
  const xAt = i => pad + (n <= 1 ? 0 : plotW * i / (n - 1));
  const yAt = v => pad + plotH * (1 - (v - minY) / (maxY - minY));
  ctx.strokeStyle = "#ddd"; ctx.lineWidth = 1; ctx.beginPath();
  ctx.moveTo(pad, pad); ctx.lineTo(pad, H - pad); ctx.lineTo(W - pad, H - pad); ctx.stroke();
  ctx.fillStyle = "#888"; ctx.font = "10px sans-serif"; ctx.textAlign = "center";
  axis.forEach((a, i) => ctx.fillText(a === 0 ? "起" : a, xAt(i), H - pad + 14));
  ctx.textAlign = "right";
  for (let t = 0; t <= 4; t++) { const v = minY + (maxY - minY) * t / 4; ctx.fillText(Math.round(v), pad - 4, yAt(v) + 3); }
  const colors = ["#e74c3c", "#3498db", "#2ecc71", "#f39c12", "#9b59b6", "#1abc9c"];
  (series || []).forEach((s, idx) => {
    ctx.strokeStyle = colors[idx % colors.length]; ctx.lineWidth = 2; ctx.beginPath();
    (s.points || []).forEach((v, i) => { const x = xAt(i), y = yAt(v); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
    ctx.stroke();
    (s.points || []).forEach((v, i) => { ctx.fillStyle = colors[idx % colors.length]; ctx.beginPath(); ctx.arc(xAt(i), yAt(v), 3, 0, 7); ctx.fill(); });
  });
  ctx.textAlign = "left"; ctx.font = "11px sans-serif";
  (series || []).forEach((s, idx) => {
    ctx.fillStyle = colors[idx % colors.length]; ctx.fillRect(pad, pad - 4 + idx * 15, 10, 10);
    ctx.fillStyle = "#333"; ctx.fillText(esc(s.nickname), pad + 14, pad + 7 + idx * 15);
  });
}

// ---------- 初始化 ----------
if (token) {
  api("/api/me").then(d => { me = d.user; enterHome(); })
    .catch(() => { token = ""; localStorage.removeItem("st_token"); show("view-auth"); });
} else {
  show("view-auth");
}
