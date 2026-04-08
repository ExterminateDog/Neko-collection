import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

const API_BASE = "/api";
const PIE_COLORS = ["#ff85a1", "#4ad1ff", "#ffd93d", "#a78bfa", "#34d399", "#fb923c", "#60a5fa"];
const BAR_COLORS = ["#60a5fa", "#fb7185", "#fbbf24", "#818cf8", "#2dd4bf", "#f472b6"];
const PLATFORM_OPTIONS = ["淘宝", "京东", "闲鱼", "其他"];
const BOOK_EDITION_OPTIONS = ["首刷限定版", "首刷版", "特装版", "普通版"];
const DEFAULT_CATEGORIES = ["手办", "书籍", "周边", "其他"];
const PRICE_CURRENCY_OPTIONS = ["CNY", "JPY", "TWD", "HKD"];
const CURRENCY_LABELS = { CNY: "人民币 (CNY)", JPY: "日元 (JPY)", TWD: "新台币 (TWD)", HKD: "港币 (HKD)" };
const CURRENCY_SYMBOLS = { CNY: "￥", JPY: "¥", TWD: "NT$", HKD: "$" };
const PLATFORM_ICONS = {
  淘宝: <img src="assets/Taobao.png" className="platform-icon" alt="Taobao" />,
  京东: <img src="assets/JD.ico" className="platform-icon" alt="JD" />,
  闲鱼: <img src="assets/Xianyu.png" className="platform-icon" alt="Xianyu" />,
  其他: "🏷️"
};

function formatNumber(value) {
  if (value === null || value === undefined || value === "") return "-";
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  if (Number.isInteger(num)) return String(num);
  return num.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
function fmtMoney(value) {
  const num = formatNumber(value);
  return num === "-" ? "-" : `￥${num}`;
}
function fmtSignedMoney(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  const abs = fmtMoney(Math.abs(num));
  if (abs === "-") return "-";
  return num > 0 ? `+${abs}` : num < 0 ? `-${abs}` : abs;
}
function fmtPriceByCurrency(amount, currency = "CNY") {
  const num = formatNumber(amount);
  if (num === "-") return "-";
  const code = String(currency || "CNY").toUpperCase();
  return (CURRENCY_SYMBOLS[code] || `${code} `) + num;
}
function fmtOriginalPrice(amount, currency = "CNY", amountCny = null) {
  const code = String(currency || "CNY").toUpperCase();
  if (code === "CNY") return fmtMoney(amount);
  const num = formatNumber(amount);
  if (num === "-") return "-";
  const cny = fmtMoney(amountCny);
  return `${code} ${num}${cny === "-" ? "" : ` (约${cny})`}`;
}
function statusLabel(status) {
  if (status === "owned") return "已购";
  if (status === "preorder") return "预订";
  return "未购";
}
function statusClass(status) {
  if (status === "owned") return "status-owned";
  if (status === "preorder") return "status-preorder";
  return "status-wishlist";
}
function fmtPlatform(platform) {
  if (!platform || platform === "-") return "-";
  const icon = PLATFORM_ICONS[platform] || PLATFORM_ICONS["其他"];
  return <span>{icon} {platform}</span>;
}
function editionClass(editionType) {
  const text = String(editionType || "");
  if (text.includes("限定")) return "edition-limited";
  if (text.includes("首刷")) return "edition-first";
  if (text.includes("特装")) return "edition-special";
  return "edition-default";
}
function toNumberOrNull(value) {
  const num = Number(String(value ?? "").trim());
  return Number.isFinite(num) ? num : null;
}
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.readAsDataURL(file);
  });
}

function initialItemForm() {
  return { name: "", category: "手办", status: "owned", platform: "", purchase_price: "", list_price_amount: "", list_price_currency: "CNY", book_edition_type: "普通版", author: "", publisher: "", purchase_date: "", tags: [], notes: "", image_data: null, is_series: true, is_private: false };
}
function initialVolumeForm() {
  return { volume_title: "", edition_type: "普通版", purchase_status: "owned", platform: "", purchase_price: "", list_price_amount: "", list_price_currency: "CNY", purchase_date: "", notes: "", cover_image_data: null };
}
function itemToPayload(item) {
  const name = item.name;
  const isSeries = item.is_series ?? true;
  return {
    name: name, category: item.category, 
    series_name: item.category === "书籍" ? name : null, 
    status: item.status, platform: item.platform || "", purchase_price: toNumberOrNull(item.purchase_price), purchase_currency: "CNY", list_price_amount: toNumberOrNull(item.list_price_amount), list_price_currency: String(item.list_price_currency || "CNY").toUpperCase(), purchase_date: item.purchase_date || "", book_edition_type: item.book_edition_type || "", author: item.author || "", publisher: item.publisher || "", tags: item.tags || [], notes: item.notes || "", image_data: item.image_data || null, sort_order: item.sort_order || 0, book_volumes: item.book_volumes || [], is_series: isSeries, is_private: item.is_private || false
  };
}

function Lightbox({ src, onClose }) {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });

  const onWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setScale(s => Math.min(Math.max(0.5, s + delta), 5));
  };

  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setStartPos({ x: e.clientX - pos.x, y: e.clientY - pos.y });
  };

  const onMouseMove = (e) => {
    if (!isDragging) return;
    setPos({ x: e.clientX - startPos.x, y: e.clientY - startPos.y });
  };

  const onMouseUp = () => setIsDragging(false);

  return (
    <div className="lightbox-overlay" onClick={onClose} onWheel={onWheel}>
      <button className="lightbox-close" onClick={onClose}>×</button>
      <img
        className="lightbox-img"
        src={src}
        alt="Lightbox"
        style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})` }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onClick={e => e.stopPropagation()}
      />
    </div>
  );
}

function drawPieChart(canvas, data, onHover) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d"), dpr = window.devicePixelRatio || 1;
  const width = Math.max(300, Math.floor(canvas.clientWidth || 300)), height = 300;
  canvas.width = Math.floor(width * dpr); canvas.height = Math.floor(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);

  const list = (data || []).filter(x => x.total > 0);
  const total = list.reduce((sum, x) => sum + x.total, 0);
  if (!list.length || total <= 0) {
    ctx.fillStyle = "#94a3b8"; ctx.font = "600 16px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("暂无数据", width / 2, height / 2); return { slices: [] };
  }

  const cx = width / 2, cy = height / 2, radius = Math.min(width, height) * 0.4, innerRadius = radius * 0.6;
  let start = -Math.PI / 2;
  const slices = list.map((item, index) => {
    const angle = (item.total / total) * Math.PI * 2;
    const end = start + angle;
    ctx.beginPath(); ctx.arc(cx, cy, radius, start, end); ctx.arc(cx, cy, innerRadius, end, start, true); ctx.closePath();
    ctx.fillStyle = PIE_COLORS[index % PIE_COLORS.length]; ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.2)"; ctx.lineWidth = 2; ctx.stroke();
    const slice = { start, end, ...item, color: PIE_COLORS[index % PIE_COLORS.length] };
    start = end;
    return slice;
  });

  const isDark = document.body.classList.contains("dark-mode");
  ctx.fillStyle = isDark ? "#f1f5f9" : "#1e293b"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = "800 20px sans-serif"; ctx.fillText(fmtMoney(total), cx, cy);
  ctx.font = "600 11px sans-serif"; ctx.fillStyle = isDark ? "#94a3b8" : "#64748b"; ctx.fillText("合计支出", cx, cy + 22);

  return { cx, cy, radius, innerRadius, slices, total };
}

function drawBarChart(canvas, data, isYearly) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d"), dpr = window.devicePixelRatio || 1;
  const width = Math.max(400, Math.floor(canvas.clientWidth || 600)), height = 300;
  canvas.width = Math.floor(width * dpr); canvas.height = Math.floor(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);

  if (!data || !data.length) {
    ctx.fillStyle = "#94a3b8"; ctx.font = "600 16px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("暂无数据", width / 2, height / 2); return;
  }

  const isDark = document.body.classList.contains("dark-mode");
  const left = 60, right = width - 20, top = 40, bottom = height - 40, chartW = right - left, chartH = bottom - top;
  const maxVal = Math.max(...data.map(x => x.total), 1) * 1.1;

  ctx.strokeStyle = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = bottom - (i / 4) * chartH;
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
    ctx.fillStyle = isDark ? "#64748b" : "#94a3b8"; ctx.font = "500 10px sans-serif"; ctx.textAlign = "right";
    ctx.fillText(formatNumber((maxVal * i) / 4), left - 10, y + 4);
  }

  const gap = 12, barW = (chartW - gap * (data.length - 1)) / data.length;
  data.forEach((item, i) => {
    const value = item.total, x = left + i * (barW + gap), h = (value / maxVal) * chartH, y = bottom - h;
    const color = BAR_COLORS[i % BAR_COLORS.length], grad = ctx.createLinearGradient(x, y, x, bottom);
    grad.addColorStop(0, color); grad.addColorStop(1, color + "44"); ctx.fillStyle = grad;
    ctx.beginPath(); ctx.roundRect?.(x, y, barW, h, Math.min(barW / 2, 6)); ctx.fill();
    
    ctx.fillStyle = isDark ? "#94a3b8" : "#64748b"; ctx.textAlign = "center"; ctx.font = "600 10px sans-serif";
    ctx.fillText(isYearly ? item.label + "年" : item.label + "月", x + barW / 2, bottom + 18);
    
    if (h > 15) {
      ctx.fillStyle = isDark ? "#f1f5f9" : "#1e293b"; ctx.font = "700 9px sans-serif";
      ctx.fillText(Math.round(value), x + barW / 2, y - 8);
    }
  });
}

function App() {
  const [token, setToken] = useState(localStorage.getItem("neko_token") || "");
  const [user, setUser] = useState(null);
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState({ events: [] });
  const [rates, setRates] = useState([]);
  const [selectedYear, setSelectedYear] = useState("all");
  const [pieTooltip, setPieTooltip] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(localStorage.getItem("neko_theme") === "dark");
  const [isPrivateMode, setIsPrivateMode] = useState(localStorage.getItem("neko_private_mode") === "true");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showLogin, setShowLogin] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showItem, setShowItem] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [showVolume, setShowVolume] = useState(false);
  const [showVolumeDetail, setShowVolumeDetail] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState("");
  
  const [loginForm, setLoginForm] = useState({ password: "" });
  const [itemForm, setItemForm] = useState(initialItemForm());
  const [editingItemId, setEditingItemId] = useState(null);
  const [bookVolumesDraft, setBookVolumesDraft] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedVolume, setSelectedVolume] = useState(null);
  const [volumeForm, setVolumeForm] = useState(initialVolumeForm());
  const [editingVolumeIndex, setEditingVolumeIndex] = useState(null);
  const [tagInputValue, setTagInputValue] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [imageUrlInput, setImageUrlInput] = useState("");
  const [volumeImageUrlInput, setVolumeImageUrlInput] = useState("");
  const [colWidths, setColWidths] = useState([48, 200, 100, 100, 120, 100, 120, 100, 80]);

  
  const pieCanvasRef = useRef(null);
  const barCanvasRef = useRef(null);
  const pieMetaRef = useRef(null);
  const fileInputRef = useRef(null);
  const loggedIn = Boolean(token && user);

  useEffect(() => {
    document.body.classList.toggle("dark-mode", isDarkMode);
    localStorage.setItem("neko_theme", isDarkMode ? "dark" : "light");
  }, [isDarkMode]);

  const apiRequest = useCallback(async (path, options = {}) => {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(path, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) { setToken(""); setUser(null); localStorage.removeItem("neko_token"); }
      throw new Error(data.error || `请求失败 (${response.status})`);
    }
    return data;
  }, [token]);

  const refreshAll = useCallback(async () => {
    try {
      const [itemsData, statsData, ratesData] = await Promise.all([
        apiRequest(`${API_BASE}/items?private_mode=${isPrivateMode}`),
        apiRequest(`${API_BASE}/stats`),
        apiRequest(`${API_BASE}/rates`)
      ]);
      setItems(itemsData.items || []);
      setStats(statsData);
      setRates(ratesData.rates || []);
      setSelectedItem(prev => prev ? (itemsData.items || []).find(x => x.id === prev.id) || null : null);
    } catch (e) { console.error(e); }
  }, [apiRequest, isPrivateMode]);

  useEffect(() => {
    if (token && !user) {
      apiRequest(`${API_BASE}/me`).then(d => { if (d.logged_in) setUser(d.user); }).catch(() => {});
    }
    refreshAll();
  }, [token, refreshAll]);

  const handleDownloadImage = async (url, type) => {
    if (!url) return;
    try {
      const data = await apiRequest(`${API_BASE}/download-image`, { method: "POST", body: JSON.stringify({ url }) });
      if (type === "item") {
        setItemForm(prev => ({ ...prev, image_data: data.image_data }));
        setImageUrlInput("");
      } else {
        setVolumeForm(prev => ({ ...prev, cover_image_data: data.image_data }));
        setVolumeImageUrlInput("");
      }
    } catch (e) {
      alert(e.message);
    }
  };

  const years = useMemo(() => {
    const s = new Set();
    (stats.events || []).forEach(e => { if (e.date && e.date !== "未知") s.add(e.date.split("-")[0]); });
    return Array.from(s).sort((a, b) => b - a);
  }, [stats]);

  const computedStats = useMemo(() => {
    const events = stats.events || [];
    const filtered = selectedYear === "all" ? events : events.filter(e => e && e.date && e.date.startsWith(selectedYear));
    
    const catMap = {};
    filtered.forEach(e => { if (e && e.category) catMap[e.category] = (catMap[e.category] || 0) + (e.amount || 0); });
    const categorySpending = Object.entries(catMap).map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total);

    let trendData = [];
    if (selectedYear === "all") {
      const yearMap = {};
      events.forEach(e => {
        if (!e || !e.date) return;
        const y = e.date.split("-")[0];
        if (y && y !== "未知") yearMap[y] = (yearMap[y] || 0) + (e.amount || 0);
      });
      trendData = Object.entries(yearMap).map(([label, total]) => ({ label, total })).sort((a, b) => a.label - b.label);
    } else {
      const monthMap = {};
      for (let i = 1; i <= 12; i++) monthMap[i.toString().padStart(2, '0')] = 0;
      filtered.forEach(e => {
        if (!e || !e.date) return;
        const m = e.date.split("-")[1];
        if (m) monthMap[m] = (monthMap[m] || 0) + (e.amount || 0);
      });
      trendData = Object.entries(monthMap).map(([label, total]) => ({ label, total })).sort((a, b) => a.label - b.label);
    }

    return { categorySpending, trendData };
  }, [stats, selectedYear]);

  useEffect(() => {
    if (showStats) {
      pieMetaRef.current = drawPieChart(pieCanvasRef.current, computedStats.categorySpending);
      drawBarChart(barCanvasRef.current, computedStats.trendData, selectedYear === "all");
    }
  }, [showStats, computedStats, selectedYear]);

  const handlePieMouseMove = (e) => {
    if (!pieMetaRef.current || !pieMetaRef.current.slices) return;
    const rect = pieCanvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - pieMetaRef.current.cx;
    const y = e.clientY - rect.top - pieMetaRef.current.cy;
    const dist = Math.sqrt(x * x + y * y);
    if (dist < pieMetaRef.current.innerRadius || dist > pieMetaRef.current.radius) {
      setPieTooltip(null); return;
    }
    let angle = Math.atan2(y, x);
    if (angle < -Math.PI / 2) angle += Math.PI * 2;
    const slice = pieMetaRef.current.slices.find(s => angle >= s.start && angle < s.end);
    if (slice) {
      setPieTooltip({
        x: e.clientX, y: e.clientY,
        category: slice.category,
        amount: slice.total,
        percent: ((slice.total / pieMetaRef.current.total) * 100).toFixed(1) + "%",
        color: slice.color
      });
    } else {
      setPieTooltip(null);
    }
  };

  const categoryOptions = useMemo(() => {
    const set = new Set(DEFAULT_CATEGORIES); items.forEach(x => { if (x.category) set.add(x.category); }); return Array.from(set);
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter(item => {
      if (statusFilter && item.status !== statusFilter) return false;
      if (categoryFilter && item.category !== categoryFilter) return false;
      if (!q) return true;
      return [item.name, item.series_name, item.category, item.platform, ...(item.tags || [])].filter(Boolean).join(" ").toLowerCase().includes(q);
    });
  }, [items, statusFilter, categoryFilter, searchQuery]);

  const summary = useMemo(() => {
    const ownedOrPreorder = filteredItems.filter(x => x.status === "owned" || x.status === "preorder");
    return { total: filteredItems.length, wishlist: filteredItems.length - ownedOrPreorder.length, spend: filteredItems.reduce((s, x) => s + Number(x.total_spent_cny || 0), 0) };
  }, [filteredItems]);

  const openEditItem = (item) => {
    if (!loggedIn) { setShowLogin(true); return; }
    setEditingItemId(item.id);
    setItemForm({ ...item, purchase_price: item.purchase_price ?? "", list_price_amount: item.list_price_amount ?? "", list_price_currency: item.list_price_currency || "CNY", tags: item.tags || [], is_series: item.is_series ?? true });
    setBookVolumesDraft(item.category === "书籍" ? item.book_volumes || [] : []);
    setShowItem(true);
  };

  const handleSubmitItem = async (e) => {
    e.preventDefault();
    const payload = { ...itemToPayload(itemForm), sort_order: editingItemId ? (items.find(x => x.id === editingItemId)?.sort_order || 0) : 0, book_volumes: itemForm.category === "书籍" ? bookVolumesDraft : [] };
    if (!payload.name) { alert("请填写名称"); return; }
    try {
      await apiRequest(editingItemId ? `${API_BASE}/items/${editingItemId}` : `${API_BASE}/items`, { method: editingItemId ? "PUT" : "POST", body: JSON.stringify(payload) });
      setShowItem(false); await refreshAll();
    } catch (e) { alert(e.message); }
  };

  const handleExport = async () => {
    try {
      const d = await apiRequest(`${API_BASE}/export`);
      const b = new Blob([JSON.stringify(d, null, 2)], { type: "application/json" }), u = URL.createObjectURL(b), a = document.createElement("a");
      a.href = u; a.download = `neko-export-${new Date().toISOString().split("T")[0]}.json`; a.click(); URL.revokeObjectURL(u);
    } catch (e) { alert(e.message); }
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (confirm("导入将清空现有数据，确定吗？")) { await apiRequest(`${API_BASE}/import`, { method: "POST", body: JSON.stringify(data) }); alert("成功"); await refreshAll(); }
    } catch (e) { alert("失败: " + e.message); }
    e.target.value = "";
  };

  const handleUpdateRates = async () => {
    try { await apiRequest(`${API_BASE}/rates/update`, { method: "POST" }); alert("汇率更新成功"); await refreshAll(); }
    catch (e) { alert(e.message); }
  };

  const openVolumeModal = (index = null) => {
    if (!selectedItem || !loggedIn) return;
    if (index === null) { setEditingVolumeIndex(null); setVolumeForm(initialVolumeForm()); }
    else { const v = selectedItem.book_volumes[index]; setEditingVolumeIndex(index); setVolumeForm({ ...v, purchase_price: v.purchase_price ?? "", list_price_amount: v.list_price_amount ?? "", list_price_currency: v.list_price_currency || "CNY" }); }
    setShowVolume(true);
  };

  const handleSubmitVolume = async (e) => {
    e.preventDefault();
    const vol = { ...volumeForm, purchase_price: toNumberOrNull(volumeForm.purchase_price), list_price_amount: toNumberOrNull(volumeForm.list_price_amount), list_price_currency: String(volumeForm.list_price_currency || "CNY").toUpperCase() };
    const vols = [...(selectedItem.book_volumes || [])];
    if (editingVolumeIndex === null) vols.push(vol); else vols[editingVolumeIndex] = vol;
    try {
      await apiRequest(`${API_BASE}/items/${selectedItem.id}`, { method: "PUT", body: JSON.stringify(itemToPayload({ ...selectedItem, book_volumes: vols })) });
      setShowVolume(false); await refreshAll();
    } catch (e) { alert(e.message); }
  };

  const handleResize = (index, e) => {
    e.stopPropagation();
    const startX = e.pageX;
    const startWidth = colWidths[index];
    const onMouseMove = (moveE) => {
      const newWidth = Math.max(40, startWidth + (moveE.pageX - startX));
      const nextWidths = [...colWidths];
      nextWidths[index] = newWidth;
      setColWidths(nextWidths);
    };
    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  const gridTemplate = colWidths.map(w => `${w}px`).join(' ');

  const triggerLightbox = (src) => { if (src) { setLightboxSrc(src); setShowLightbox(true); } };

  return (
    <>
      <div className="bg-orb orb-a"></div><div className="bg-orb orb-b"></div>
      <header className="topbar">
        <div className="brand"><img className="brand-logo" src="assets/logo.png" alt="logo" /><h1 className="brand-overline">Neko Collection</h1></div>
        <nav className="nav-tabs">
          <button className="tab-btn" onClick={async () => { await apiRequest(`${API_BASE}/stats`).then(d => setStats(d)); setShowStats(true); }}>📊 统计</button>
          {loggedIn && <button className="tab-btn" onClick={() => setShowSettings(true)}>⚙️ 设置</button>}
        </nav>
        <div className="auth-area">
          {!loggedIn ? <button className="btn ghost small" onClick={() => setShowLogin(true)}>🔑 登录</button> : <button className="btn ghost small logout-btn" onClick={async () => { await apiRequest(`${API_BASE}/logout`, { method: "POST" }); setToken(""); setUser(null); localStorage.removeItem("neko_token"); }}>🚪 退出</button>}
        </div>
      </header>

      <main className="container">
        <section className="view-section">
          {!loggedIn && <div className="readonly-tip">当前为只读模式，登录后可管理收藏品与设置。</div>}
          <div className="panel">
            <div className="summary">
              <div className="summary-card total"><div className="k">总数</div><div className="v">{summary.total}</div></div>
              <div className="summary-card wishlist"><div className="k">未购买</div><div className="v">{summary.wishlist}</div></div>
              <div className="summary-card spend"><div className="k">总支出</div><div className="v">{fmtMoney(summary.spend)}</div></div>
            </div>
            <div className="filter-row">
              <div className="filter-left">
                <div className="filter-group"><span className="filter-label">状态</span>
                  <div className="status-filters">{["owned", "preorder", "wishlist"].map(s => <button key={s} className={`status-chip ${statusFilter === s ? "active" : ""}`} onClick={() => setStatusFilter(statusFilter === s ? "" : s)}>{statusLabel(s)}</button>)}</div>
                </div>
                <div className="filter-group"><span className="filter-label">分类</span>
                  <div className="category-filters">{categoryOptions.map(c => <button key={c} className={`category-chip ${categoryFilter === c ? "active" : ""}`} onClick={() => setCategoryFilter(categoryFilter === c ? "" : c)}>{c}</button>)}</div>
                </div>
              </div>
              <label className="search-wrap"><input type="search" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="搜索名称 / 标签 / 平台" /></label>
            </div>
            <div className="collection-grid">
              {!filteredItems.length ? <div className="empty-state">暂无数据</div> : filteredItems.map(item => (
                <article key={item.id} className="item-card" onClick={async () => { await apiRequest(`${API_BASE}/items/${item.id}`).then(d => { setSelectedItem(d.item); setShowDetail(true); }); }}>
                  <div className="item-image-wrap">
                    {item.image_data ? <img className="item-image" src={item.image_data} alt={item.name} /> : <div className="item-placeholder">N</div>}
                    {item.is_private && <div className="private-badge">🔒 私密</div>}
                  </div>
                  <div className="item-body">
                    <h3 className="item-title">{item.series_name || item.name}</h3>
                    <div className="category-progress-row"><span className="item-sub">{item.category === "书籍" ? "📚 " : "✨ "}{item.category}</span>
                      {item.category === "书籍" && (item.book_volumes || []).length > 0 && (() => {
                        const owned = item.book_volumes.filter(v => v.purchase_status === "owned").length, total = item.book_volumes.length;
                        return <div className="inline-progress"><div className="progress-bar-bg"><div className="progress-bar-fill" style={{ width: `${(owned/total)*100}%` }}></div></div><span className="progress-text">{owned}/{total}</span></div>
                      })()}
                    </div>
                    <div className="price-status-row"><strong>{fmtMoney(item.category === "书籍" ? item.total_spent_cny : item.purchase_price)}</strong><span className={`status-pill ${statusClass(item.status)}`}>{statusLabel(item.status)}</span></div>
                    {item.tags?.length > 0 && (
                      <div className="item-tags-row" style={{ marginTop: "0.25rem" }}>
                        {item.tags.slice(0, 3).map((t, i) => <span key={i} className="item-tag-sm">{t}</span>)}
                        {item.tags.length > 3 && <span className="item-tag-sm">...</span>}
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>

      <div className="fab-group">
        <button className="fab secondary" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>↑</button>
        <button className="fab secondary" onClick={() => setIsDarkMode(!isDarkMode)}>{isDarkMode ? "☀️" : "🌙"}</button>
        <button className="fab" onClick={() => { if (!loggedIn) setShowLogin(true); else { setEditingItemId(null); setItemForm(initialItemForm()); setBookVolumesDraft([]); setTagInputValue(""); setShowItem(true); } }}>+</button>
      </div>

      {showStats && (
        <div className="modal" onMouseDown={e => e.target === e.currentTarget && setShowStats(false)}>
          <div className="modal-card detail-modal-card" style={{ maxWidth: "1000px" }} onMouseDown={e => e.stopPropagation()}>
            <div className="modal-head">
              <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
                <h3 style={{ margin: 0 }}>数据统计</h3>
                <div className="stats-year-picker">
                  <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)}>
                    <option value="all">总体支出</option>
                    {years.map(y => <option key={y} value={y}>{y} 年</option>)}
                  </select>
                </div>
              </div>
              <button className="icon-btn" onClick={() => setShowStats(false)}>×</button>
            </div>
            
            <div className="chart-grid">
              <div className="chart-panel">
                <h4>{selectedYear === "all" ? "年度趋势图" : `${selectedYear}年月度趋势`}</h4>
                <canvas ref={barCanvasRef}></canvas>
              </div>
              <div className="chart-panel" style={{ position: "relative" }}>
                <h4>{selectedYear === "all" ? "总支出构成" : `${selectedYear}年支出构成`}</h4>
                <canvas 
                  ref={pieCanvasRef} 
                  onMouseMove={handlePieMouseMove}
                  onMouseLeave={() => setPieTooltip(null)}
                ></canvas>
                {pieTooltip && (
                  <div className="chart-tooltip" style={{ left: pieTooltip.x - 100, top: pieTooltip.y - 120 }}>
                    <div className="tooltip-title"><span className="tooltip-dot" style={{ background: pieTooltip.color }}></span>{pieTooltip.category}</div>
                    <div className="tooltip-row"><span>金额</span><strong>{fmtMoney(pieTooltip.amount)}</strong></div>
                    <div className="tooltip-row"><span>占比</span><strong>{pieTooltip.percent}</strong></div>
                  </div>
                )}
                <div className="legend">
                  {computedStats.categorySpending.map((l, i) => (
                    <span key={i} className="legend-item" onMouseEnter={() => {
                      const slice = pieMetaRef.current?.slices?.find(s => s.category === l.category);
                      if (slice) setPieTooltip({ x: 0, y: 0, category: slice.category, amount: slice.total, percent: ((slice.total / pieMetaRef.current.total) * 100).toFixed(1) + "%", color: slice.color, fixed: true });
                    }} onMouseLeave={() => setPieTooltip(null)}>
                      <span className="legend-color" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}></span>
                      {l.category}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="modal" onMouseDown={e => e.target === e.currentTarget && setShowSettings(false)}>
          <div className="modal-card small" onMouseDown={e => e.stopPropagation()}>
            <div className="modal-head"><h3>系统设置</h3><button className="icon-btn" onClick={() => setShowSettings(false)}>×</button></div>
            <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              <section>
                <h4>偏好设置</h4>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.5rem 0" }}>
                  <span>私密模式 (显示标记为私密的条目)</span>
                  <button 
                    className={`toggle-btn ${isPrivateMode ? "active" : ""}`}
                    onClick={() => {
                      const val = !isPrivateMode;
                      setIsPrivateMode(val);
                      localStorage.setItem("neko_private_mode", val);
                    }}
                  >
                    {isPrivateMode ? "已开启" : "已关闭"}
                  </button>
                </div>
              </section>
              <section><h4>修改密码</h4><div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}><input type="password" placeholder="新密码" value={newPassword} onChange={e => setNewPassword(e.target.value)} style={{ flex: 1, padding: "0.5rem", borderRadius: "8px", border: "1px solid var(--line)" }} /><button className="btn primary small" onClick={async () => { if (newPassword.length < 6) { alert("至少6位"); return; } await apiRequest(`${API_BASE}/change-password`, { method: "POST", body: JSON.stringify({ new_password: newPassword }) }); alert("成功"); setNewPassword(""); }}>修改</button></div></section>
              <section><h4>数据备份与恢复</h4><div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}><button className="btn ghost small" onClick={handleExport}>导出 JSON</button><button className="btn ghost small" onClick={() => fileInputRef.current?.click()}>导入 JSON</button><input type="file" ref={fileInputRef} hidden accept=".json" onChange={handleImport} /></div></section>
              <section>
                <h4>汇率更新</h4>
                <div style={{ background: "var(--surface-2)", padding: "1.25rem", borderRadius: "16px", border: "1px solid var(--line)", marginTop: "0.75rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                    <div>
                      <span style={{ fontSize: "0.75rem", color: "var(--muted)", display: "block" }}>当前参考汇率</span>
                      <span style={{ fontSize: "0.7rem", color: "var(--muted)" }}>更新于: {rates.length > 0 ? new Date(rates[0].updated_at).toLocaleString() : "未知"}</span>
                    </div>
                    <button className="btn primary small" onClick={handleUpdateRates} style={{ padding: "0.4rem 0.75rem", borderRadius: "8px" }}>同步</button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.75rem" }}>
                    {[
                      { code: "JPY", label: "日元", color: "#ff85a1" },
                      { code: "TWD", label: "新台币", color: "#4ad1ff" },
                      { code: "HKD", label: "港币", color: "#ffd93d" }
                    ].map(c => {
                      const r = rates.find(x => x.currency === c.code);
                      return (
                        <div key={c.code} style={{ background: "var(--surface)", padding: "0.75rem 0.5rem", borderRadius: "12px", border: "1px solid var(--line)", textAlign: "center", boxShadow: "var(--shadow-sm)" }}>
                          <span style={{ fontSize: "0.65rem", color: "var(--muted)", fontWeight: 700, textTransform: "uppercase" }}>1 CNY =</span>
                          <div style={{ fontSize: "1.125rem", fontWeight: 800, color: c.color, margin: "0.25rem 0" }}>
                            {r ? (1 / r.rate_to_cny).toFixed(2) : "-"}
                          </div>
                          <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-soft)" }}>{c.label}</span>
                        </div>
                      );
                    })}
                  </div>
                  <p style={{ fontSize: "0.7rem", color: "var(--muted)", marginTop: "1rem", textAlign: "center" }}>数据来源: ExchangeRate-API (实时汇率仅供参考)</p>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {showLogin && (
        <div className="modal" onMouseDown={e => e.target === e.currentTarget && setShowLogin(false)}>
          <div className="modal-card small" onMouseDown={e => e.stopPropagation()}>
            <div className="modal-head"><h3>登录</h3><button className="icon-btn" onClick={() => setShowLogin(false)}>×</button></div>
            <form className="form-grid one-col" onSubmit={async e => { e.preventDefault(); try { const d = await apiRequest(`${API_BASE}/login`, { method: "POST", body: JSON.stringify(loginForm) }); setToken(d.token); setUser(d.user); localStorage.setItem("neko_token", d.token); setShowLogin(false); setLoginForm({ password: "" }); } catch (e) { alert(e.message); } }}>
              <label>密码<input type="password" value={loginForm.password} onChange={e => setLoginForm({ password: e.target.value })} required /></label>
              <div className="form-actions"><button type="submit" className="btn primary">登录</button></div>
            </form>
          </div>
        </div>
      )}

      {showItem && (
        <div className="modal" onMouseDown={e => e.target === e.currentTarget && setShowItem(false)}>
          <div className="modal-card" style={{ maxWidth: "900px" }} onMouseDown={e => e.stopPropagation()}>
            <div className="modal-head"><h3>{editingItemId ? "编辑收藏品" : "新增收藏品"}</h3><button className="icon-btn" onClick={() => setShowItem(false)}>×</button></div>
            <form onSubmit={handleSubmitItem}>
              <div className="form-with-image">
                <div className="form-image-col">
                  <div className="image-preview-3-4" onClick={() => triggerLightbox(itemForm.image_data)} style={{cursor: itemForm.image_data ? 'zoom-in' : 'default'}}>
                    {itemForm.image_data ? <img src={itemForm.image_data} alt="preview" /> : <span>📷</span>}
                  </div>
                  <div className="file-input-wrapper"><button type="button" className="btn ghost small" style={{ width: "100%" }}>上传图片</button><input type="file" accept="image/*" onChange={async e => { if (e.target.files?.[0]) setItemForm({ ...itemForm, image_data: await fileToDataUrl(e.target.files[0]) }); }} /></div>
                  <div style={{ display: "flex", gap: "0.25rem", marginTop: "0.5rem" }}>
                    <input type="text" placeholder="图片链接..." value={imageUrlInput} onChange={e => setImageUrlInput(e.target.value)} style={{ flex: 1, fontSize: "0.8rem", padding: "0.25rem", borderRadius: "4px", border: "1px solid var(--line)", background: "var(--surface)" }} />
                    <button type="button" className="btn ghost small" onClick={() => handleDownloadImage(imageUrlInput, "item")}>下载</button>
                  </div>
                  {itemForm.image_data && <button type="button" className="btn danger small" onClick={() => setItemForm({ ...itemForm, image_data: null })} style={{ width: "100%", marginTop: "0.5rem" }}>移除图片</button>}
                </div>
                <div className="form-fields-col">
                  <label className="full">名称 / 系列名<input type="text" value={itemForm.name} onChange={e => setItemForm({ ...itemForm, name: e.target.value })} required /></label>
                  <label>分类<select value={itemForm.category} onChange={e => setItemForm({ ...itemForm, category: e.target.value })}>{categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}</select></label>
                  {itemForm.category === "书籍" && (
                    <label>是否系列
                      <select value={itemForm.is_series ? "1" : "0"} onChange={e => setItemForm({ ...itemForm, is_series: e.target.value === "1" })}>
                        <option value="1">是 (具有多个分册)</option>
                        <option value="0">否 (单本书籍)</option>
                      </select>
                    </label>
                  )}
                  {!(itemForm.category === "书籍" && itemForm.is_series) && (
                    <>
                      <label>状态<select value={itemForm.status} onChange={e => {
                        const newStatus = e.target.value;
                        const update = { ...itemForm, status: newStatus };
                        if (newStatus === "wishlist") { update.purchase_price = ""; update.purchase_date = ""; }
                        setItemForm(update);
                      }}><option value="owned">已购</option><option value="preorder">预订</option><option value="wishlist">未购</option></select></label>
                      <label>购买价格 (CNY)<input type="number" step="0.01" value={itemForm.purchase_price} onChange={e => setItemForm({ ...itemForm, purchase_price: e.target.value })} disabled={itemForm.status === "wishlist"} /></label>
                      <label>商品定价
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                          <input type="number" step="0.01" style={{ flex: 1 }} value={itemForm.list_price_amount} onChange={e => setItemForm({ ...itemForm, list_price_amount: e.target.value })} placeholder="金额" />
                          <select style={{ width: "80px" }} value={itemForm.list_price_currency} onChange={e => setItemForm({ ...itemForm, list_price_currency: e.target.value })}>{PRICE_CURRENCY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}</select>
                        </div>
                      </label>
                      <label>购买平台<select value={itemForm.platform} onChange={e => setItemForm({ ...itemForm, platform: e.target.value })}><option value="">请选择</option>{PLATFORM_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}</select></label>
                    </>
                  )}
                  {itemForm.category === "书籍" ? (
                    <>
                      {!itemForm.is_series && (
                        <label>版本类型<select value={itemForm.book_edition_type} onChange={e => setItemForm({ ...itemForm, book_edition_type: e.target.value })}><option value="">请选择</option>{BOOK_EDITION_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}</select></label>
                      )}
                      <label>作者<input type="text" value={itemForm.author || ""} onChange={e => setItemForm({ ...itemForm, author: e.target.value })} /></label>
                      <label>出版社<input type="text" value={itemForm.publisher || ""} onChange={e => setItemForm({ ...itemForm, publisher: e.target.value })} /></label>
                      {!itemForm.is_series && itemForm.status !== "wishlist" && (
                        <label>购买日期 (必填)
                          <input
                            type="date"
                            value={itemForm.purchase_date}
                            onChange={e => setItemForm({ ...itemForm, purchase_date: e.target.value })}
                            required={itemForm.status === "owned" || itemForm.status === "preorder"}
                          />
                        </label>
                      )}
                    </>
                  ) : (itemForm.status !== "wishlist" && (
                    <label>购买日期 (必填)
                      <input
                        type="date"
                        value={itemForm.purchase_date}
                        onChange={e => setItemForm({ ...itemForm, purchase_date: e.target.value })}
                        required={itemForm.status === "owned" || itemForm.status === "preorder"}
                      />
                    </label>
                  ))}
                  <div className="full">
                    <label>标签 (输入后回车添加)</label>
                    <div className="tag-input-container">
                      {(itemForm.tags || []).map((t, i) => (
                        <span key={i} className="tag-capsule">{t}<span className="tag-remove" onClick={() => setItemForm({ ...itemForm, tags: itemForm.tags.filter((_, idx) => idx !== i) })}>×</span></span>
                      ))}
                      <input
                        type="text"
                        className="tag-inner-input"
                        style={{ border: "none", background: "transparent", flex: 1, minWidth: "120px", outline: "none", padding: "0.25rem" }}
                        value={tagInputValue}
                        onChange={e => setTagInputValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const val = tagInputValue.trim();
                            if (val && !itemForm.tags.includes(val)) {
                              setItemForm({ ...itemForm, tags: [...itemForm.tags, val] });
                              setTagInputValue("");
                            }
                          }
                        }}
                        placeholder="输入标签..."
                      />
                    </div>
                  </div>
                  <label className="full">备注<textarea rows="2" value={itemForm.notes} onChange={e => setItemForm({ ...itemForm, notes: e.target.value })}></textarea></label>
                  <div className="full" style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.5rem" }}>
                    <input type="checkbox" id="is_private_checkbox" checked={itemForm.is_private} onChange={e => setItemForm({ ...itemForm, is_private: e.target.checked })} style={{ width: "auto" }} />
                    <label htmlFor="is_private_checkbox" style={{ margin: 0, cursor: "pointer", fontWeight: "600" }}>🔒 标记为私密 (仅在私密模式下显示)</label>
                  </div>
                </div>
              </div>
              <div className="form-actions" style={{ marginTop: "2rem" }}><button type="button" className="btn ghost" onClick={() => setShowItem(false)}>取消</button><button type="submit" className="btn primary">保存</button></div>
            </form>
          </div>
        </div>
      )}

      {showDetail && selectedItem && (
        <div className="modal" onMouseDown={e => e.target === e.currentTarget && setShowDetail(false)}>
          <div className="modal-card" onMouseDown={e => e.stopPropagation()}>
            <div className="modal-head"><h3>{selectedItem.series_name || selectedItem.name}</h3><button className="icon-btn" onClick={() => setShowDetail(false)}>×</button></div>
            <div className="detail-shell">
              <div className="detail-grid">
                {selectedItem.image_data ? (
                  <img className="detail-cover" src={selectedItem.image_data} alt="cover" onClick={() => triggerLightbox(selectedItem.image_data)} />
                ) : (
                  <div className="detail-cover item-image-wrap"><div className="item-placeholder">N</div></div>
                )}
                <div className="detail-meta">
                  <div className="detail-line"><strong>分类</strong> {selectedItem.category}</div>
                  {!(selectedItem.category === "书籍" && selectedItem.is_series) && (
                    <>
                      <div className="detail-line"><strong>商品定价</strong> {fmtOriginalPrice(selectedItem.list_price_amount, selectedItem.list_price_currency, selectedItem.list_price_cny)}</div>
                      <div className="detail-line"><strong>购买平台</strong> {fmtPlatform(selectedItem.platform)}</div>
                    </>
                  )}
                  {selectedItem.category === "书籍" ? (
                    <>
                      <div className="detail-line"><strong>作者</strong> {selectedItem.author || "-"}</div>
                      <div className="detail-line"><strong>出版社</strong> {selectedItem.publisher || "-"}</div>
                      {!selectedItem.is_series && <div className="detail-line"><strong>版本</strong> {selectedItem.book_edition_type || "-"}</div>}
                      <div className="detail-line"><strong>总消费</strong> {fmtMoney(selectedItem.total_spent_cny)}</div>
                    </>
                  ) : (
                    <>
                      <div className="detail-line"><strong>购买价格</strong> {fmtMoney(selectedItem.purchase_price)}</div>
                      {selectedItem.status !== "wishlist" && <div className="detail-line"><strong>购买日期</strong> {selectedItem.purchase_date || "-"}</div>}
                    </>
                  )}
                  {selectedItem.status === "owned" && selectedItem.list_price_cny > 0 && (selectedItem.purchase_price > 0 || (selectedItem.category === "书籍" && selectedItem.total_spent_cny > 0)) && (
                    <div className="detail-line">
                      <strong>盈亏估算</strong>
                      {(() => {
                        const cost = selectedItem.category === "书籍" ? selectedItem.total_spent_cny : selectedItem.purchase_price;
                        const diff = selectedItem.list_price_cny - cost;
                        return <span className={diff >= 0 ? "diff-positive" : "diff-negative"}>{fmtSignedMoney(diff)}</span>;
                      })()}
                    </div>
                  )}
                  <div className="detail-line"><strong>状态</strong> <span className={`status-pill ${statusClass(selectedItem.status)}`}>{statusLabel(selectedItem.status)}</span></div>
                  <div className="detail-line"><strong>备注</strong> {selectedItem.notes || "-"}</div>
                  {selectedItem.tags?.length > 0 && <div className="item-tags-row">{selectedItem.tags.map((t, i) => <span key={i} className="item-tag-sm">{t}</span>)}</div>}
                </div>
              </div>
              {selectedItem.category === "书籍" && selectedItem.is_series && (
                <div className="volumes-grid">
                <div className="volume-table-row volume-table-head" style={{ "--col-widths": gridTemplate }}>
                  {["封面", "名称", "版本", "购买价", "定价", "盈亏", "购买平台", "状态", "操作"].map((label, idx) => (
                    <div key={idx} className="volume-cell">
                      {label}
                      {idx < 8 && <div className="resizer" onMouseDown={(e) => handleResize(idx, e)}></div>}
                    </div>
                  ))}
                </div>
                {selectedItem.book_volumes?.map((v, i) => (
                  <div key={i} className="volume-table-row" style={{ "--col-widths": gridTemplate }} onClick={() => { setSelectedVolume(v); setShowVolumeDetail(true); }}>
                    <div className="volume-cell">
                      {v.cover_image_data ? (
                        <img className="volume-cover" src={v.cover_image_data} onClick={e => { e.stopPropagation(); triggerLightbox(v.cover_image_data); }} />
                      ) : (
                        <div className="volume-cover volume-cover-fallback">B</div>
                      )}
                    </div>
                    <div className="volume-cell volume-name" title={v.volume_title}>{v.volume_title}</div>
                    <div className="volume-cell"><span className={`edition-pill ${editionClass(v.edition_type)}`}>{v.edition_type}</span></div>
                    <div className="volume-cell volume-number">{fmtMoney(v.purchase_price_cny)}</div>
                    <div className="volume-cell volume-number">{fmtPriceByCurrency(v.list_price_amount, v.list_price_currency)}</div>
                    <div className="volume-cell">
                      {v.purchase_status === "owned" && v.list_price_cny > 0 ? (
                        <span className={v.list_price_cny - v.purchase_price_cny >= 0 ? "diff-positive" : "diff-negative"}>
                          {fmtSignedMoney(v.list_price_cny - v.purchase_price_cny)}
                        </span>
                      ) : "-"}
                    </div>
                    <div className="volume-cell">{fmtPlatform(v.platform)}</div>
                    <div className="volume-cell"><span className={`status-badge ${statusClass(v.purchase_status)}`}>{statusLabel(v.purchase_status)}</span></div>
                    <div className="volume-cell volume-row-actions" onClick={e => e.stopPropagation()}>
                      {loggedIn && <><button className="action-icon-btn" onClick={() => openVolumeModal(i)}>✎</button><button className="action-icon-btn danger" onClick={async () => { if (confirm("确定删除？")) { const nv = [...selectedItem.book_volumes]; nv.splice(i, 1); await apiRequest(`${API_BASE}/items/${selectedItem.id}`, { method: "PUT", body: JSON.stringify(itemToPayload({ ...selectedItem, book_volumes: nv })) }); await refreshAll(); } }}>🗑</button></>}
                    </div>
                  </div>
                ))}

                  {loggedIn && <button className="btn ghost small top-gap" onClick={() => openVolumeModal(null)}>+ 新增分册</button>}
                </div>
              )}
            </div>
            <div className="item-actions top-gap">{loggedIn && <><button className="btn ghost" onClick={() => { setShowDetail(false); openEditItem(selectedItem); }}>编辑</button><button className="btn ghost danger" onClick={async () => { if (confirm("确定删除？")) { await apiRequest(`${API_BASE}/items/${selectedItem.id}`, { method: "DELETE" }); setShowDetail(false); await refreshAll(); } }}>删除</button></>}</div>
          </div>
        </div>
      )}

      {showVolumeDetail && selectedVolume && (
        <div className="modal" onMouseDown={e => e.target === e.currentTarget && setShowVolumeDetail(false)}>
          <div className="modal-card" onMouseDown={e => e.stopPropagation()}>
            <div className="modal-head"><h3>分册详情</h3><button className="icon-btn" onClick={() => setShowVolumeDetail(false)}>×</button></div>
            <div className="detail-shell">
              <div className="detail-grid">
                {selectedVolume.cover_image_data ? (
                  <img className="detail-cover" src={selectedVolume.cover_image_data} alt="cover" onClick={() => triggerLightbox(selectedVolume.cover_image_data)} />
                ) : (
                  <div className="detail-cover item-image-wrap"><div className="item-placeholder">B</div></div>
                )}
                <div className="detail-meta">
                  <div className="detail-line"><strong>分册名</strong> {selectedVolume.volume_title}</div>
                  <div className="detail-line"><strong>版本</strong> {selectedVolume.edition_type}</div>
                  <div className="detail-line"><strong>购买平台</strong> {fmtPlatform(selectedVolume.platform)}</div>
                  <div className="detail-line"><strong>购买价格</strong> {fmtMoney(selectedVolume.purchase_price_cny)}</div>
                  <div className="detail-line"><strong>商品定价</strong> {fmtPriceByCurrency(selectedVolume.list_price_amount, selectedVolume.list_price_currency)}</div>
                  {selectedVolume.purchase_status !== "wishlist" && <div className="detail-line"><strong>购买日期</strong> {selectedVolume.purchase_date || "-"}</div>}
                  {selectedVolume.purchase_status === "owned" && selectedVolume.list_price_cny > 0 && selectedVolume.purchase_price_cny > 0 && (
                    <div className="detail-line">
                      <strong>盈亏估算</strong>
                      {(() => {
                        const diff = selectedVolume.list_price_cny - selectedVolume.purchase_price_cny;
                        return <span className={diff >= 0 ? "diff-positive" : "diff-negative"}>{fmtSignedMoney(diff)}</span>;
                      })()}
                    </div>
                  )}
                  <div className="detail-line"><strong>状态</strong> <span className={`status-pill ${statusClass(selectedVolume.purchase_status)}`}>{statusLabel(selectedVolume.purchase_status)}</span></div>
                  <div className="detail-line"><strong>备注</strong> {selectedVolume.notes || "-"}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showVolume && (
        <div className="modal" onMouseDown={e => e.target === e.currentTarget && setShowVolume(false)}>
          <div className="modal-card" style={{ maxWidth: "900px" }} onMouseDown={e => e.stopPropagation()}>
            <div className="modal-head"><h3>{editingVolumeIndex === null ? "新增分册" : "编辑分册"}</h3><button className="icon-btn" onClick={() => setShowVolume(false)}>×</button></div>
            <form onSubmit={handleSubmitVolume}>
              <div className="form-with-image">
                <div className="form-image-col">
                  <div className="image-preview-3-4" onClick={() => triggerLightbox(volumeForm.cover_image_data)} style={{cursor: volumeForm.cover_image_data ? 'zoom-in' : 'default'}}>
                    {volumeForm.cover_image_data ? <img src={volumeForm.cover_image_data} alt="preview" /> : <span>📷</span>}
                  </div>
                  <div className="file-input-wrapper"><button type="button" className="btn ghost small" style={{ width: "100%" }}>封面</button><input type="file" accept="image/*" onChange={async e => { if (e.target.files?.[0]) setVolumeForm({ ...volumeForm, cover_image_data: await fileToDataUrl(e.target.files[0]) }); }} /></div>
                  <div style={{ display: "flex", gap: "0.25rem", marginTop: "0.5rem" }}>
                    <input type="text" placeholder="图片链接..." value={volumeImageUrlInput} onChange={e => setVolumeImageUrlInput(e.target.value)} style={{ flex: 1, fontSize: "0.8rem", padding: "0.25rem", borderRadius: "4px", border: "1px solid var(--line)", background: "var(--surface)" }} />
                    <button type="button" className="btn ghost small" onClick={() => handleDownloadImage(volumeImageUrlInput, "volume")}>下载</button>
                  </div>
                  {volumeForm.cover_image_data && <button type="button" className="btn danger small" onClick={() => setVolumeForm({ ...volumeForm, cover_image_data: null })} style={{ width: "100%", marginTop: "0.5rem" }}>移除图片</button>}
                </div>
                <div className="form-fields-col">
                  <label className="full">分册名<input type="text" value={volumeForm.volume_title} onChange={e => setVolumeForm({ ...volumeForm, volume_title: e.target.value })} required /></label>
                  <label>版本类型<select value={volumeForm.edition_type} onChange={e => setVolumeForm({ ...volumeForm, edition_type: e.target.value })}>{BOOK_EDITION_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}</select></label>
                  <label>购买状态<select value={volumeForm.purchase_status} onChange={e => {
                    const newStatus = e.target.value;
                    const update = { ...volumeForm, purchase_status: newStatus };
                    if (newStatus === "wishlist") { update.purchase_price = ""; update.purchase_date = ""; }
                    setVolumeForm(update);
                  }}><option value="owned">已购</option><option value="preorder">预订</option><option value="wishlist">未购</option></select></label>
                  <label>购买价格 (CNY)<input type="number" step="0.01" value={volumeForm.purchase_price} onChange={e => setVolumeForm({ ...volumeForm, purchase_price: e.target.value })} disabled={volumeForm.purchase_status === "wishlist"} /></label>
                  <label>商品定价
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <input type="number" step="0.01" style={{ flex: 1 }} value={volumeForm.list_price_amount} onChange={e => setVolumeForm({ ...volumeForm, list_price_amount: e.target.value })} placeholder="金额" />
                      <select style={{ width: "80px" }} value={volumeForm.list_price_currency} onChange={e => setVolumeForm({ ...volumeForm, list_price_currency: e.target.value })}>{PRICE_CURRENCY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}</select>
                    </div>
                  </label>
                  <label>购买平台<select value={volumeForm.platform} onChange={e => setVolumeForm({ ...volumeForm, platform: e.target.value })}><option value="">请选择</option>{PLATFORM_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}</select></label>
                  {volumeForm.purchase_status !== "wishlist" && (
                    <label>购买日期 (必填)
                      <input
                        type="date"
                        value={volumeForm.purchase_date}
                        onChange={e => setVolumeForm({ ...volumeForm, purchase_date: e.target.value })}
                        required={volumeForm.purchase_status === "owned" || volumeForm.purchase_status === "preorder"}
                      />
                    </label>
                  )}
                  <label className="full">备注<textarea rows="2" value={volumeForm.notes} onChange={e => setVolumeForm({ ...volumeForm, notes: e.target.value })}></textarea></label>
                </div>
              </div>
              <div className="form-actions" style={{ marginTop: "2rem" }}><button type="button" className="btn ghost" onClick={() => setShowVolume(false)}>取消</button><button type="submit" className="btn primary">保存</button></div>
            </form>
          </div>
        </div>
      )}
      {showLightbox && <Lightbox src={lightboxSrc} onClose={() => setShowLightbox(false)} />}
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);
