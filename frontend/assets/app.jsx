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
const ITEM_NAME_COLLATOR = new Intl.Collator(["zh-Hans-CN-u-co-pinyin", "en"], { numeric: true, sensitivity: "base" });
const PINYIN_INITIAL_COLLATOR = new Intl.Collator("zh-Hans-CN-u-co-pinyin", { sensitivity: "base" });
const PINYIN_INITIAL_BOUNDARIES = [
  ["a", "阿"], ["b", "芭"], ["c", "擦"], ["d", "搭"], ["e", "蛾"], ["f", "发"],
  ["g", "噶"], ["h", "哈"], ["j", "击"], ["k", "喀"], ["l", "垃"], ["m", "妈"],
  ["n", "拿"], ["o", "哦"], ["p", "啪"], ["q", "期"], ["r", "然"], ["s", "撒"],
  ["t", "塌"], ["w", "挖"], ["x", "昔"], ["y", "压"], ["z", "匝"]
];
const PLATFORM_ICONS = {
  淘宝: <img src="assets/Taobao.png" className="platform-icon" alt="Taobao" />,
  京东: <img src="assets/JD.ico" className="platform-icon" alt="JD" />,
  闲鱼: <img src="assets/Xianyu.png" className="platform-icon" alt="Xianyu" />,
  其他: "🏷️"
};
const CATEGORY_ICONS = {
  手办: "🧸",
  书籍: "📚",
  周边: "✨",
  其他: "📦"
};
const STATUS_ICONS = {
  owned: "✅",
  preorder: "✴️",
  wishlist: "❌"
};
const CURRENCY_ICONS = {
  CNY: "￥",
  JPY: "¥",
  TWD: "NT$",
  HKD: "$"
};

function OptionGroup({ options, value, onChange, icons = {}, labelMap = {}, className = "", hideIcons = false }) {
  return (
    <div className={`option-group ${className}`}>
      {options.map(opt => (
        <button
          key={opt}
          type="button"
          className={`option-item ${value === opt ? "active" : ""}`}
          onClick={() => onChange(opt)}
        >
          {!hideIcons && <span className="option-icon">{icons[opt] || ""}</span>}
          <span className="option-label">{labelMap[opt] || (hideIcons ? icons[opt] : opt)}</span>
        </button>
      ))}
    </div>
  );
}

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
function fmtFileSize(bytes) {
  const num = Number(bytes);
  if (!Number.isFinite(num) || num <= 0) return "-";
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / (1024 * 1024)).toFixed(2)} MB`;
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

function getChinesePinyinInitial(char) {
  if (!/[\u3400-\u9fff]/.test(char)) return "";
  for (let i = PINYIN_INITIAL_BOUNDARIES.length - 1; i >= 0; i--) {
    if (PINYIN_INITIAL_COLLATOR.compare(char, PINYIN_INITIAL_BOUNDARIES[i][1]) >= 0) {
      return PINYIN_INITIAL_BOUNDARIES[i][0];
    }
  }
  return "a";
}

function getItemSortInitial(label) {
  const text = String(label || "").trim();
  if (!text) return "~";
  const firstChar = text[0];
  if (/[a-z0-9]/i.test(firstChar)) return firstChar.toLowerCase();
  if (/[\u3400-\u9fff]/.test(firstChar)) return getChinesePinyinInitial(firstChar);
  return "~";
}

function getEarliestVolumePurchaseDate(volumes = []) {
  return (volumes || [])
    .map(volume => String(volume?.purchase_date || "").trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))[0] || "";
}

function getVolumeProfitEstimateTotal(volumes = []) {
  return (volumes || []).reduce((sum, volume) => {
    if (!["owned", "preorder"].includes(volume?.purchase_status)) return sum;
    const listPriceCny = Number(volume?.list_price_cny || 0);
    const purchasePriceCny = Number(volume?.purchase_price_cny || 0);
    if (!Number.isFinite(listPriceCny) || !Number.isFinite(purchasePriceCny) || listPriceCny <= 0) return sum;
    return sum + (listPriceCny - purchasePriceCny);
  }, 0);
}

function getVolumeListPriceTotal(volumes = []) {
  return (volumes || []).reduce((sum, volume) => {
    const listPriceCny = Number(volume?.list_price_cny || 0);
    if (!Number.isFinite(listPriceCny) || listPriceCny <= 0) return sum;
    return sum + listPriceCny;
  }, 0);
}

function getItemListPriceForDisplay(item) {
  if (item?.category === "书籍" && item?.is_series) {
    return getVolumeListPriceTotal(item.book_volumes);
  }
  return Number(item?.list_price_cny || 0);
}

function getItemProfitEstimate(item) {
  if (!["owned", "preorder"].includes(item?.status)) return null;
  if (item?.category === "书籍" && item?.is_series) {
    return getVolumeProfitEstimateTotal(item.book_volumes);
  }
  const listPriceCny = Number(item?.list_price_cny || 0);
  const purchasePrice = Number(item?.purchase_price || 0);
  if (!Number.isFinite(listPriceCny) || !Number.isFinite(purchasePrice) || listPriceCny <= 0) return null;
  return listPriceCny - purchasePrice;
}

function initialItemForm() {
  return { name: "", category: "手办", status: "owned", platform: "", purchase_price: "", purchase_currency: "CNY", list_price_amount: "", list_price_currency: "CNY", book_edition_type: "普通版", author: "", publisher: "", manufacturer: "", purchase_date: "", tags: [], notes: "", image_data: null, is_series: true, is_private: false };
}
function initialVolumeForm() {
  return { volume_title: "", edition_type: "普通版", purchase_status: "owned", platform: "", purchase_price: "", purchase_currency: "CNY", list_price_amount: "", list_price_currency: "CNY", purchase_date: "", notes: "", cover_image_data: null };
}
function initialProxyForm() {
  return { enabled: false, http_proxy: "", https_proxy: "", no_proxy: "127.0.0.1,localhost" };
}
function itemToPayload(item) {
  const name = item.name;
  const isSeries = item.is_series ?? true;
  return {
    name: name, category: item.category,
    series_name: item.category === "书籍" ? name : null,
    status: item.status, platform: item.platform || "", purchase_price: toNumberOrNull(item.purchase_price), purchase_currency: item.purchase_currency || "CNY", list_price_amount: toNumberOrNull(item.list_price_amount), list_price_currency: String(item.list_price_currency || "CNY").toUpperCase(), purchase_date: item.purchase_date || "", book_edition_type: item.book_edition_type || "", author: item.author || "", publisher: item.publisher || "", manufacturer: item.manufacturer || "", tags: item.tags || [], notes: item.notes || "", image_data: item.image_data || null, sort_order: item.sort_order || 0, book_volumes: item.book_volumes || [], is_series: isSeries, is_private: item.is_private || false
  };
}

function AutocompleteInput({ value, onChange, suggestions = [], placeholder, className = "", ...props }) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filtered, setFiltered] = useState([]);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleInputChange = (e) => {
    const val = e.target.value;
    onChange(val);
    if (val.trim() && suggestions.length > 0) {
      const matches = suggestions.filter(s => 
        s.toLowerCase().includes(val.toLowerCase()) && s.toLowerCase() !== val.toLowerCase()
      ).slice(0, 10);
      setFiltered(matches);
      setShowSuggestions(matches.length > 0);
    } else {
      setShowSuggestions(false);
    }
  };

  return (
    <div className={`suggestions-container ${className}`} ref={containerRef} style={{ width: "100%" }}>
      <input
        {...props}
        type="text"
        className={className}
        style={{ width: "100%" }}
        value={value || ""}
        onChange={handleInputChange}
        onFocus={() => {
          if (value && value.trim()) {
            const matches = suggestions.filter(s => 
              s.toLowerCase().includes(value.toLowerCase()) && s.toLowerCase() !== value.toLowerCase()
            ).slice(0, 10);
            setFiltered(matches);
            setShowSuggestions(matches.length > 0);
          }
        }}
        onBlur={() => {
          // 延迟关闭，以便让点击建议项的 mousedown 先执行
          setTimeout(() => setShowSuggestions(false), 200);
        }}
        placeholder={placeholder}
      />
      {showSuggestions && (
        <ul className="suggestions-list" style={{ width: "100%" }}>
          {filtered.map((s, i) => (
            <li
              key={i}
              className="suggestion-item"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(s);
                setShowSuggestions(false);
              }}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
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
  const [viewMode, setViewMode] = useState(localStorage.getItem("neko_view_mode") || "grid");
  const [sortDirection, setSortDirection] = useState(localStorage.getItem("neko_sort_direction") || "asc");
  const [pieTooltip, setPieTooltip] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(localStorage.getItem("neko_theme") === "dark");
  const [isPrivateMode, setIsPrivateMode] = useState(localStorage.getItem("neko_private_mode") === "true");
  const [statusFilter, setStatusFilter] = useState([]);
  const [categoryFilter, setCategoryFilter] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showLogin, setShowLogin] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showItem, setShowItem] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [showVolume, setShowVolume] = useState(false);
  const [showVolumeDetail, setShowVolumeDetail] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);
  const [showBackupPreview, setShowBackupPreview] = useState(false);
  const [showClearDataConfirm, setShowClearDataConfirm] = useState(false);
  const [showServerBackups, setShowServerBackups] = useState(false);
  const [backupToDelete, setBackupToDelete] = useState(null);
  const [showNotification, setShowNotification] = useState(false);
  const [notificationConfig, setNotificationConfig] = useState({ title: "", message: "", type: "info" });
  const [confirmConfig, setConfirmConfig] = useState({ show: false, title: "确认", message: "", onConfirm: null });
  const [lightboxSrc, setLightboxSrc] = useState("");

  const notify = (message, title = "提示", type = "info") => {
    setNotificationConfig({ title, message, type });
    setShowNotification(true);
  };

  const askConfirm = (message, onConfirm, title = "确认操作") => {
    setConfirmConfig({ show: true, title, message, onConfirm });
  };
  const [backupPreview, setBackupPreview] = useState(null);
  const [backupFiles, setBackupFiles] = useState([]);
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);
  const [isClearingData, setIsClearingData] = useState(false);
  const [isDeletingBackup, setIsDeletingBackup] = useState(false);
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [isSavingProxy, setIsSavingProxy] = useState(false);
  const [isTestingProxy, setIsTestingProxy] = useState(false);
  const [suggestions, setSuggestions] = useState({ name: [], author: [], publisher: [], manufacturer: [], tags: [], volume_title: [] });
  const [proxyForm, setProxyForm] = useState(initialProxyForm());

  const [loginForm, setLoginForm] = useState({ 
    password: localStorage.getItem("neko_remembered_password") || "", 
    remember: !!localStorage.getItem("neko_remembered_password") 
  });
  const [itemForm, setItemForm] = useState(initialItemForm());  const [editingItemId, setEditingItemId] = useState(null);
  const [bookVolumesDraft, setBookVolumesDraft] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedVolume, setSelectedVolume] = useState(null);
  const [volumeForm, setVolumeForm] = useState(initialVolumeForm());
  const [editingVolumeIndex, setEditingVolumeIndex] = useState(null);
  const [tagInputValue, setTagInputValue] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [imageUrlInput, setImageUrlInput] = useState("");
  const [volumeImageUrlInput, setVolumeImageUrlInput] = useState("");
  const [colWidths, setColWidths] = useState([56, 210, 116, 92, 104, 92, 104, 88, 148]);

  
  const pieCanvasRef = useRef(null);
  const barCanvasRef = useRef(null);
  const pieMetaRef = useRef(null);
  const fileInputRef = useRef(null);
  const pendingBackupBodyRef = useRef(null);
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
      
      // 加载建议
      apiRequest(`${API_BASE}/suggestions`).then(setSuggestions).catch(() => {});
    } catch (e) { console.error(e); }
  }, [apiRequest, isPrivateMode]);

  const refreshBackupFiles = useCallback(async () => {
    if (!loggedIn) {
      setBackupFiles([]);
      return;
    }
    try {
      setIsLoadingBackups(true);
      const data = await apiRequest(`${API_BASE}/backups`);
      setBackupFiles(data.backups || []);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingBackups(false);
    }
  }, [apiRequest, loggedIn]);

  const loadSettings = useCallback(async () => {
    if (!loggedIn) {
      setProxyForm(initialProxyForm());
      return;
    }
    try {
      setIsLoadingSettings(true);
      const data = await apiRequest(`${API_BASE}/settings`);
      setProxyForm({ ...initialProxyForm(), ...(data.proxy || {}) });
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingSettings(false);
    }
  }, [apiRequest, loggedIn]);

  useEffect(() => {
    if (token && !user) {
      apiRequest(`${API_BASE}/me`).then(d => { if (d.logged_in) setUser(d.user); }).catch(() => {});
    }
    refreshAll();
  }, [token, refreshAll]);

  useEffect(() => {
    if (showSettings && loggedIn) {
      refreshBackupFiles();
      loadSettings();
    }
  }, [showSettings, loggedIn, refreshBackupFiles, loadSettings]);

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
      notify(e.message, "错误", "error");
    }
  };

  const handleSaveProxySettings = async () => {
    try {
      setIsSavingProxy(true);
      const data = await apiRequest(`${API_BASE}/settings/proxy`, { method: "POST", body: JSON.stringify(proxyForm) });
      setProxyForm({ ...initialProxyForm(), ...(data.proxy || {}) });
      notify(data.message || "代理设置已保存", "成功", "success");
    } catch (e) {
      notify(e.message, "错误", "error");
    } finally {
      setIsSavingProxy(false);
    }
  };

  const handleTestProxySettings = async () => {
    try {
      setIsTestingProxy(true);
      const data = await apiRequest(`${API_BASE}/settings/proxy/test`, { method: "POST", body: JSON.stringify(proxyForm) });
      notify(data.message || "代理连接测试成功", "成功", "success");
    } catch (e) {
      notify(e.message, "错误", "error");
    } finally {
      setIsTestingProxy(false);
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
      if (statusFilter.length && !statusFilter.includes(item.status)) return false;
      if (categoryFilter.length && !categoryFilter.includes(item.category)) return false;
      if (!q) return true;
      return [item.name, item.series_name, item.category, item.platform, item.author, item.publisher, ...(item.tags || [])].filter(Boolean).join(" ").toLowerCase().includes(q);
    }).sort((a, b) => {
      const aLabel = String(a.series_name || a.name || "").trim();
      const bLabel = String(b.series_name || b.name || "").trim();
      const byInitial = ITEM_NAME_COLLATOR.compare(getItemSortInitial(aLabel), getItemSortInitial(bLabel));
      if (byInitial !== 0) return sortDirection === "desc" ? -byInitial : byInitial;
      const byName = ITEM_NAME_COLLATOR.compare(aLabel, bLabel);
      if (byName !== 0) return sortDirection === "desc" ? -byName : byName;
      const byId = Number(a.id || 0) - Number(b.id || 0);
      return sortDirection === "desc" ? -byId : byId;
    });
  }, [items, statusFilter, categoryFilter, searchQuery, sortDirection]);

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
    if (!payload.name) { notify("请填写名称", "提示", "info"); return; }
    try {
      await apiRequest(editingItemId ? `${API_BASE}/items/${editingItemId}` : `${API_BASE}/items`, { method: editingItemId ? "PUT" : "POST", body: JSON.stringify(payload) });
      setShowItem(false); await refreshAll();
    } catch (e) { notify(e.message, "错误", "error"); }
  };

  const handleExport = async () => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const response = await fetch(`${API_BASE}/export-backup`, { headers });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        if (response.status === 401) { setToken(""); setUser(null); localStorage.removeItem("neko_token"); }
        throw new Error(data.error || `Request failed (${response.status})`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `neko-backup-${new Date().toISOString().split("T")[0]}.zip`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) { notify(e.message, "错误", "error"); }
  };

  const closeBackupPreview = () => {
    pendingBackupBodyRef.current = null;
    setBackupPreview(null);
    setShowBackupPreview(false);
    setIsRestoringBackup(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const countCurrentImageRefs = useMemo(() => {
    const refs = new Set();
    (items || []).forEach(item => {
      if (item?.image_data) refs.add(item.image_data);
      (item?.book_volumes || []).forEach(volume => {
        if (volume?.cover_image_data) refs.add(volume.cover_image_data);
      });
    });
    return refs.size;
  }, [items]);

  const confirmBackupImport = async () => {
    if (!pendingBackupBodyRef.current && backupPreview?.source_type !== "server") {
      closeBackupPreview();
      return;
    }
    try {
      setIsRestoringBackup(true);
      let data;
      if (backupPreview?.source_type === "server" && backupPreview?.file_name) {
        data = await apiRequest(`${API_BASE}/restore-local-backup`, { method: "POST", body: JSON.stringify({ file_name: backupPreview.file_name }) });
      } else {
        const headers = { "Content-Type": "application/zip", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
        const response = await fetch(`${API_BASE}/import-backup`, { method: "POST", headers, body: pendingBackupBodyRef.current });
        data = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (response.status === 401) { setToken(""); setUser(null); localStorage.removeItem("neko_token"); }
          throw new Error(data.error || `请求失败 (${response.status})`);
        }
      }
      closeBackupPreview();
      notify(data.message || "备份已恢复", "成功", "success");
      await refreshAll();
      await refreshBackupFiles();
    } catch (e) {
      setIsRestoringBackup(false);
      notify("恢复失败: " + e.message, "错误", "error");
    }
  };

  const confirmClearData = async () => {
    try {
      setIsClearingData(true);
      const data = await apiRequest(`${API_BASE}/clear-data`, { method: "POST", body: JSON.stringify({}) });
      setShowClearDataConfirm(false);
      setIsClearingData(false);
      notify(data.message || "当前数据已清空", "成功", "success");
      await refreshAll();
    } catch (e) {
      setIsClearingData(false);
      notify("清空失败: " + e.message, "错误", "error");
    }
  };

  const confirmDeleteBackup = async () => {
    if (!backupToDelete?.file_name) {
      setBackupToDelete(null);
      return;
    }
    try {
      setIsDeletingBackup(true);
      const data = await apiRequest(`${API_BASE}/delete-local-backup`, { method: "POST", body: JSON.stringify({ file_name: backupToDelete.file_name }) });
      setBackupToDelete(null);
      setIsDeletingBackup(false);
      notify(data.message || "备份已删除", "成功", "success");
      await refreshBackupFiles();
    } catch (e) {
      setIsDeletingBackup(false);
      notify("删除失败: " + e.message, "错误", "error");
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const body = await file.arrayBuffer();
      const headers = { "Content-Type": "application/zip", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
      const previewResponse = await fetch(`${API_BASE}/preview-backup`, { method: "POST", headers, body });
      const previewData = await previewResponse.json().catch(() => ({}));
      if (!previewResponse.ok) {
        if (previewResponse.status === 401) { setToken(""); setUser(null); localStorage.removeItem("neko_token"); }
        throw new Error(previewData.error || `请求失败 (${previewResponse.status})`);
      }
      const preview = previewData.backup || {};
      pendingBackupBodyRef.current = body;
      setBackupPreview({ ...preview, file_name: file.name, file_size: file.size, source_type: "upload" });
      setShowBackupPreview(true);
    } catch (e) { notify("恢复失败: " + e.message, "错误", "error"); }
    e.target.value = "";
  };

  const openLocalBackupPreview = async (fileName) => {
    try {
      const data = await apiRequest(`${API_BASE}/preview-local-backup`, { method: "POST", body: JSON.stringify({ file_name: fileName }) });
      pendingBackupBodyRef.current = null;
      setBackupPreview({ ...(data.backup || {}), source_type: "server" });
      setShowBackupPreview(true);
    } catch (e) {
      notify("预览失败: " + e.message, "错误", "error");
    }
  };

  const handleUpdateRates = async () => {
    try { await apiRequest(`${API_BASE}/rates/update`, { method: "POST" }); notify("汇率更新成功", "成功", "success"); await refreshAll(); }
    catch (e) { notify(e.message, "错误", "error"); }
  };

  const handleCreateBackup = async () => {
    try {
      setIsCreatingBackup(true);
      const data = await apiRequest(`${API_BASE}/create-backup`, { method: "POST" });
      notify(data.message || "备份成功", "成功", "success");
      await refreshBackupFiles();
    } catch (e) {
      notify("备份失败: " + e.message, "错误", "error");
    } finally {
      setIsCreatingBackup(false);
    }
  };

  const handleDeleteBackup = (fileName) => {
    const file = backupFiles.find(f => f.file_name === fileName);
    if (file) setBackupToDelete(file);
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
    } catch (e) { notify(e.message, "错误", "error"); }
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

  const updateSelectedItemVolumes = async (volumes) => {
    if (!selectedItem) return;
    await apiRequest(`${API_BASE}/items/${selectedItem.id}`, {
      method: "PUT",
      body: JSON.stringify(itemToPayload({ ...selectedItem, book_volumes: volumes }))
    });
    await refreshAll();
  };

  const moveSelectedVolume = async (index, offset) => {
    if (!selectedItem?.book_volumes?.length) return;
    const targetIndex = index + offset;
    if (targetIndex < 0 || targetIndex >= selectedItem.book_volumes.length) return;
    const nextVolumes = [...selectedItem.book_volumes];
    const [moved] = nextVolumes.splice(index, 1);
    nextVolumes.splice(targetIndex, 0, moved);
    try {
      await updateSelectedItemVolumes(nextVolumes);
    } catch (e) {
      notify(e.message, "错误", "error");
    }
  };

  const gridTemplate = colWidths.map(w => `${w}px`).join(' ');

  const triggerLightbox = (src) => { if (src) { setLightboxSrc(src); setShowLightbox(true); } };
  const toggleFilterValue = (currentValues, nextValue, setter) => {
    setter(currentValues.includes(nextValue) ? currentValues.filter(value => value !== nextValue) : [...currentValues, nextValue]);
  };
  const selectedItemPurchaseDate = useMemo(() => {
    if (!selectedItem) return "";
    if (selectedItem.category === "书籍" && selectedItem.is_series) {
      return getEarliestVolumePurchaseDate(selectedItem.book_volumes);
    }
    return String(selectedItem.purchase_date || "").trim();
  }, [selectedItem]);
  const selectedItemVolumeProfitTotal = useMemo(() => {
    if (!selectedItem || selectedItem.category !== "书籍" || !selectedItem.is_series) return null;
    return getVolumeProfitEstimateTotal(selectedItem.book_volumes);
  }, [selectedItem]);

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
                <div className="filter-group-inline"><span className="filter-label-inline">状态</span><div className="status-filters">{["owned", "preorder", "wishlist"].map(s => <button key={s} className={`status-chip ${statusFilter.includes(s) ? "active" : ""}`} onClick={() => toggleFilterValue(statusFilter, s, setStatusFilter)}>{statusLabel(s)}</button>)}</div></div>
                <div className="filter-divider-pipe">|</div>
                <div className="filter-group-inline"><span className="filter-label-inline">分类</span><div className="category-filters">{categoryOptions.map(c => <button key={c} className={`category-chip ${categoryFilter.includes(c) ? "active" : ""}`} onClick={() => toggleFilterValue(categoryFilter, c, setCategoryFilter)}>{c}</button>)}</div></div>
              </div>
              <div className="filter-right">
                <button
                  className="sort-toggle-btn"
                  onClick={() => {
                    const next = sortDirection === "asc" ? "desc" : "asc";
                    setSortDirection(next);
                    localStorage.setItem("neko_sort_direction", next);
                  }}
                  title={sortDirection === "asc" ? "当前按 a-Z 排序，点击切换为 Z-a" : "当前按 Z-a 排序，点击切换为 a-Z"}
                >
                  {sortDirection === "asc" ? "A-Z" : "Z-A"}
                </button>
                <div className="view-toggle">
                  <button 
                    className={`view-toggle-btn ${viewMode === "grid" ? "active" : ""}`} 
                    onClick={() => { setViewMode("grid"); localStorage.setItem("neko_view_mode", "grid"); }}
                    title="网格视图"
                  >
                    田
                  </button>
                  <button 
                    className={`view-toggle-btn ${viewMode === "list" ? "active" : ""}`} 
                    onClick={() => { setViewMode("list"); localStorage.setItem("neko_view_mode", "list"); }}
                    title="列表视图"
                  >
                    ≡
                  </button>
                </div>
                <label className="search-wrap"><input type="search" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="搜索名称 / 标签 / 平台 / 作者 / 出版社" /></label>
              </div>
            </div>
            <div className={viewMode === "grid" ? "collection-grid" : "collection-list"}>
              {!filteredItems.length ? <div className="empty-state">暂无数据</div> : (
                viewMode === "grid" ? (
                  filteredItems.map(item => (
                    <article key={item.id} className="item-card" onClick={async () => { await apiRequest(`${API_BASE}/items/${item.id}`).then(d => { setSelectedItem(d.item); setShowDetail(true); }); }}>
                      <div className="item-image-wrap">
                        {item.image_data ? <img className="item-image" src={item.image_data} alt={item.name} /> : <div className="item-placeholder">N</div>}
                      </div>
                      <div className="item-body">
                        <h3 className="item-title">{item.series_name || item.name}</h3>
                        <div className="category-progress-row">
                          <div className="item-category-group">
                            {item.category === "书籍" ? "📚 " : "✨ "}{item.category}
                          </div>
                          <div className="item-meta-group">
                            {item.is_private && <span className="private-badge">🔒 私密</span>}
                            {item.category === "书籍" && (item.book_volumes || []).length > 0 && (() => {
                              const owned = item.book_volumes.filter(v => v.purchase_status === "owned").length, total = item.book_volumes.length;
                              return (
                                <div className="inline-progress">
                                  <div className="progress-bar-bg"><div className="progress-bar-fill" style={{ width: `${(owned/total)*100}%` }}></div></div>
                                  <span className="progress-text">{owned}/{total}</span>
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                        <div className="price-status-row"><strong>{fmtMoney(item.category === "书籍" ? item.total_spent_cny : item.purchase_price)}</strong><span className={`status-pill ${statusClass(item.status)}`}>{statusLabel(item.status)}</span></div>
                        {item.tags?.length > 0 && (
                          <div className="item-tags-row" style={{ marginTop: "0.25rem" }}>
                            {item.tags.slice(0, 4).map((t, i) => <span key={i} className="item-tag-sm">{t}</span>)}
                            {item.tags.length > 4 && <span className="item-tag-sm">...</span>}
                          </div>
                        )}
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="list-view-table">
                    <div className="list-view-header">
                      <div className="lv-col col-img"></div>
                      <div className="lv-col col-name">名称</div>
                      <div className="lv-col col-tags">标签</div>
                      <div className="lv-col col-price">购买价</div>
                      <div className="lv-col col-list">定价</div>
                      <div className="lv-col col-diff">盈亏</div>
                      <div className="lv-col col-status">状态</div>
                    </div>
                    {filteredItems.map(item => (
                      <div key={item.id} className="list-view-row" onClick={async () => { await apiRequest(`${API_BASE}/items/${item.id}`).then(d => { setSelectedItem(d.item); setShowDetail(true); }); }}>
                        <div className="lv-col col-img">
                          {item.image_data ? <img src={item.image_data} alt={item.name} /> : <div className="lv-img-placeholder">N</div>}
                        </div>
                        <div className="lv-col col-name">
                          <div className="lv-name-wrap">
                            <div className="lv-name-text">{item.series_name || item.name}</div>
                            <div className="item-meta-group inline">
                              {item.is_private && <span className="private-badge mini">🔒 私密</span>}
                              {item.category === "书籍" && (item.book_volumes || []).length > 0 && (() => {
                                const owned = item.book_volumes.filter(v => v.purchase_status === "owned").length, total = item.book_volumes.length;
                                return (
                                  <div className="inline-progress">
                                    <div className="progress-bar-bg"><div className="progress-bar-fill" style={{ width: `${(owned/total)*100}%` }}></div></div>
                                    <span className="progress-text">{owned}/{total}</span>
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                        </div>
                        <div className="lv-col col-tags">
                          {item.tags?.length > 0 ? item.tags.slice(0, 2).map((t, i) => <span key={i} className="item-tag-sm">{t}</span>) : "-"}
                        </div>
                        <div className="lv-col col-price"><strong>{fmtMoney(item.category === "书籍" ? item.total_spent_cny : item.purchase_price)}</strong></div>
                        <div className="lv-col col-list">{fmtMoney(getItemListPriceForDisplay(item))}</div>
                        <div className="lv-col col-diff">
                          {(() => {
                            const diff = getItemProfitEstimate(item);
                            return diff === null ? "-" : <span className={diff >= 0 ? "diff-positive" : "diff-negative"}>{fmtSignedMoney(diff)}</span>;
                          })()}
                        </div>
                        <div className="lv-col col-status"><span className={`status-pill small ${statusClass(item.status)}`}>{statusLabel(item.status)}</span></div>
                      </div>
                    ))}
                  </div>
                )
              )}
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
          <div className="modal-card small" style={{ maxWidth: "720px" }} onMouseDown={e => e.stopPropagation()}>
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
              <section><h4>修改密码</h4><div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}><input type="password" placeholder="新密码" value={newPassword} onChange={e => setNewPassword(e.target.value)} style={{ flex: 1, padding: "0.5rem", borderRadius: "8px", border: "1px solid var(--line)" }} /><button className="btn primary small" onClick={async () => { if (newPassword.length < 6) { notify("至少6位", "提示", "info"); return; } try { await apiRequest(`${API_BASE}/change-password`, { method: "POST", body: JSON.stringify({ new_password: newPassword }) }); notify("修改成功", "成功", "success"); setNewPassword(""); } catch (e) { notify(e.message, "错误", "error"); } }}>修改</button></div></section>
              <section>
                <h4>备份与恢复</h4>
                <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
                  <button className="btn ghost small" onClick={handleExport}>导出 ZIP</button>
                  <button className="btn ghost small" onClick={() => fileInputRef.current?.click()}>导入 ZIP</button>
                  <button className="btn ghost small" onClick={() => setShowServerBackups(true)}>服务器备份</button>
                  <button className="btn danger small" onClick={() => setShowClearDataConfirm(true)}>清空当前数据</button>
                  <input type="file" ref={fileInputRef} hidden accept=".zip,application/zip" onChange={handleImport} />
                </div>
              </section>
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
              <section>
                <h4>网络代理</h4>
                <div style={{ background: "var(--surface-2)", padding: "1.25rem", borderRadius: "16px", border: "1px solid var(--line)", marginTop: "0.75rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontWeight: 700, color: "var(--text)" }}>启用代理</div>
                      <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: "0.2rem" }}>用于图片链接下载与汇率同步</div>
                    </div>
                    <button
                      className={`toggle-btn ${proxyForm.enabled ? "active" : ""}`}
                      onClick={() => setProxyForm(prev => ({ ...prev, enabled: !prev.enabled }))}
                      disabled={isLoadingSettings || isSavingProxy || isTestingProxy}
                    >
                      {proxyForm.enabled ? "已开启" : "已关闭"}
                    </button>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.75rem" }}>
                    <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem", fontSize: "0.85rem", color: "var(--text-soft)" }}>
                      HTTP 代理
                      <input
                        type="text"
                        value={proxyForm.http_proxy}
                        onChange={e => setProxyForm(prev => ({ ...prev, http_proxy: e.target.value }))}
                        placeholder="http://192.168.1.8:7890"
                        disabled={isLoadingSettings || isSavingProxy}
                        style={{ padding: "0.65rem 0.8rem", borderRadius: "10px", border: "1px solid var(--line)", background: "var(--surface)", color: "var(--text)" }}
                      />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem", fontSize: "0.85rem", color: "var(--text-soft)" }}>
                      HTTPS 代理
                      <input
                        type="text"
                        value={proxyForm.https_proxy}
                        onChange={e => setProxyForm(prev => ({ ...prev, https_proxy: e.target.value }))}
                        placeholder="留空则复用 HTTP 代理"
                        disabled={isLoadingSettings || isSavingProxy}
                        style={{ padding: "0.65rem 0.8rem", borderRadius: "10px", border: "1px solid var(--line)", background: "var(--surface)", color: "var(--text)" }}
                      />
                    </label>
                  </div>

                  <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem", fontSize: "0.85rem", color: "var(--text-soft)" }}>
                    绕过地址 (NO_PROXY)
                    <input
                      type="text"
                      value={proxyForm.no_proxy}
                      onChange={e => setProxyForm(prev => ({ ...prev, no_proxy: e.target.value }))}
                      placeholder="127.0.0.1,localhost"
                      disabled={isLoadingSettings || isSavingProxy}
                      style={{ padding: "0.65rem 0.8rem", borderRadius: "10px", border: "1px solid var(--line)", background: "var(--surface)", color: "var(--text)" }}
                    />
                  </label>

                  <div style={{ padding: "0.9rem 1rem", borderRadius: "14px", background: "rgba(74,209,255,0.12)", border: "1px solid rgba(74,209,255,0.28)", color: "var(--text-soft)", lineHeight: 1.65, fontSize: "0.82rem" }}>
                    使用电脑上的 Clash 时，请先在 Clash 开启“允许局域网连接”，然后填写你电脑的局域网 IP 和 HTTP 代理端口，例如 `http://192.168.1.8:7890`。
                    <br />
                    在 NAS 的 Docker 容器里不要填写 `127.0.0.1`，因为那会指向容器自己，而不是你的电脑。
                  </div>

                  <div className="form-actions" style={{ marginTop: 0 }}>
                    <button type="button" className="btn ghost" onClick={handleTestProxySettings} disabled={isLoadingSettings || isSavingProxy || isTestingProxy}>
                      {isTestingProxy ? "测试中..." : "测试代理"}
                    </button>
                    <button type="button" className="btn primary" onClick={handleSaveProxySettings} disabled={isLoadingSettings || isSavingProxy}>
                      {isSavingProxy ? "保存中..." : "保存代理设置"}
                    </button>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {showClearDataConfirm && (
        <div className="modal" style={{ zIndex: 3200 }} onMouseDown={e => e.target === e.currentTarget && !isClearingData && setShowClearDataConfirm(false)}>
          <div className="modal-card small" style={{ maxWidth: "520px" }} onMouseDown={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>清空当前数据</h3>
              <button className="icon-btn" onClick={() => setShowClearDataConfirm(false)} disabled={isClearingData}>×</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ padding: "1rem 1.1rem", borderRadius: "18px", background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.28)", color: "var(--text-soft)", lineHeight: 1.6 }}>
                此操作将永久删除当前所有收藏记录，并清理不再被引用的图片文件。
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.75rem" }}>
                <div style={{ padding: "0.95rem 0.8rem", borderRadius: "16px", background: "var(--surface-2)", border: "1px solid var(--line)", textAlign: "center" }}>
                  <div style={{ fontSize: "0.74rem", color: "var(--muted)", marginBottom: "0.35rem" }}>藏品数量</div>
                  <div style={{ fontSize: "1.55rem", fontWeight: 800, color: "#fb7185" }}>{items.length}</div>
                </div>
                <div style={{ padding: "0.95rem 0.8rem", borderRadius: "16px", background: "var(--surface-2)", border: "1px solid var(--line)", textAlign: "center" }}>
                  <div style={{ fontSize: "0.74rem", color: "var(--muted)", marginBottom: "0.35rem" }}>图片数量</div>
                  <div style={{ fontSize: "1.55rem", fontWeight: 800, color: "#f97316" }}>{countCurrentImageRefs}</div>
                </div>
              </div>
              <div style={{ padding: "1rem 1.1rem", borderRadius: "18px", background: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--text-soft)", lineHeight: 1.6 }}>
                请确认您要清空当前数据集。除非您从备份中恢复，否则此操作无法撤销。
              </div>
              <div className="form-actions">
                <button type="button" className="btn ghost" onClick={() => setShowClearDataConfirm(false)} disabled={isClearingData}>取消</button>
                <button type="button" className="btn danger" onClick={confirmClearData} disabled={isClearingData}>
                  {isClearingData ? "正在清空..." : "确认清空"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {backupToDelete && (
        <div className="modal" style={{ zIndex: 3300 }} onMouseDown={e => e.target === e.currentTarget && !isDeletingBackup && setBackupToDelete(null)}>
          <div className="modal-card small" style={{ maxWidth: "520px" }} onMouseDown={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>删除服务器备份</h3>
              <button className="icon-btn" onClick={() => setBackupToDelete(null)} disabled={isDeletingBackup}>×</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ padding: "1rem 1.1rem", borderRadius: "18px", background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.28)", color: "var(--text-soft)", lineHeight: 1.6 }}>
                此操作将永久删除所选的服务器备份文件。删除后无法恢复。
              </div>
              <div style={{ padding: "1rem 1.1rem", borderRadius: "18px", background: "var(--surface-2)", border: "1px solid var(--line)" }}>
                <div style={{ fontSize: "0.78rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.45rem" }}>备份文件</div>
                <div style={{ fontSize: "1rem", fontWeight: 800, color: "var(--text)", wordBreak: "break-all" }}>{backupToDelete.file_name}</div>
                <div style={{ display: "flex", gap: "0.85rem", flexWrap: "wrap", marginTop: "0.45rem", fontSize: "0.82rem", color: "var(--muted)" }}>
                  <span>{fmtFileSize(backupToDelete.file_size)}</span>
                  <span>{backupToDelete.exported_at || backupToDelete.modified_at || "-"}</span>
                  <span>{backupToDelete.item_count ?? 0} 项</span>
                  <span>{backupToDelete.upload_file_count ?? 0} 图片</span>
                </div>
              </div>
              <div className="form-actions">
                <button type="button" className="btn ghost" onClick={() => setBackupToDelete(null)} disabled={isDeletingBackup}>取消</button>
                <button type="button" className="btn danger" onClick={confirmDeleteBackup} disabled={isDeletingBackup}>
                  {isDeletingBackup ? "正在删除..." : "确认删除"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showBackupPreview && backupPreview && (
        <div className="modal" style={{ zIndex: 3400 }} onMouseDown={e => e.target === e.currentTarget && !isRestoringBackup && closeBackupPreview()}>
          <div className="modal-card small" style={{ maxWidth: "560px" }} onMouseDown={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>备份预览</h3>
              <button className="icon-btn" onClick={closeBackupPreview} disabled={isRestoringBackup}>×</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ padding: "1rem 1.1rem", borderRadius: "18px", background: "linear-gradient(135deg, rgba(74,209,255,0.16), rgba(255,133,161,0.12))", border: "1px solid var(--line)" }}>
                <div style={{ fontSize: "0.78rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.45rem" }}>已选文件</div>
                <div style={{ fontSize: "1rem", fontWeight: 800, color: "var(--text)", wordBreak: "break-all" }}>{backupPreview.file_name || "backup.zip"}</div>
                <div style={{ marginTop: "0.35rem", color: "var(--muted)", fontSize: "0.85rem" }}>{fmtFileSize(backupPreview.file_size)}</div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "0.75rem" }}>
                <div style={{ padding: "0.95rem 0.8rem", borderRadius: "16px", background: "var(--surface-2)", border: "1px solid var(--line)", textAlign: "center" }}>
                  <div style={{ fontSize: "0.74rem", color: "var(--muted)", marginBottom: "0.35rem" }}>藏品总数</div>
                  <div style={{ fontSize: "1.55rem", fontWeight: 800, color: "#4ad1ff" }}>{backupPreview.item_count ?? 0}</div>
                </div>
                <div style={{ padding: "0.95rem 0.8rem", borderRadius: "16px", background: "var(--surface-2)", border: "1px solid var(--line)", textAlign: "center" }}>
                  <div style={{ fontSize: "0.74rem", color: "var(--muted)", marginBottom: "0.35rem" }}>图片数量</div>
                  <div style={{ fontSize: "1.55rem", fontWeight: 800, color: "#ff85a1" }}>{backupPreview.upload_file_count ?? 0}</div>
                </div>
                <div style={{ padding: "0.95rem 0.8rem", borderRadius: "16px", background: "var(--surface-2)", border: "1px solid var(--line)", textAlign: "center" }}>
                  <div style={{ fontSize: "0.74rem", color: "var(--muted)", marginBottom: "0.35rem" }}>版本号</div>
                  <div style={{ fontSize: "1.55rem", fontWeight: 800, color: "#fbbf24" }}>{backupPreview.version ?? 1}</div>
                </div>
              </div>

              <div style={{ padding: "1rem 1.1rem", borderRadius: "18px", background: "var(--surface-2)", border: "1px solid var(--line)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: "0.78rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>备份应用</div>
                    <div style={{ marginTop: "0.35rem", fontWeight: 700, color: "var(--text)" }}>{backupPreview.app || "Neko Collection"}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "0.78rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>备份日期</div>
                    <div style={{ marginTop: "0.35rem", fontWeight: 700, color: "var(--text)" }}>{backupPreview.exported_at || "-"}</div>
                  </div>
                </div>
              </div>

              <div style={{ padding: "0.95rem 1rem", borderRadius: "18px", background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.28)", color: "var(--text-soft)", lineHeight: 1.6 }}>
                恢复此备份将替换当前的收藏数据，并同步压缩包中的相关图片文件。
              </div>

              <div className="form-actions">
                <button type="button" className="btn ghost" onClick={closeBackupPreview} disabled={isRestoringBackup}>取消</button>
                <button type="button" className="btn primary" onClick={confirmBackupImport} disabled={isRestoringBackup}>
                  {isRestoringBackup ? "正在恢复..." : "确认恢复备份"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showServerBackups && (
        <div className="modal" onMouseDown={e => e.target === e.currentTarget && setShowServerBackups(false)}>
          <div className="modal-card small" style={{ maxWidth: "600px" }} onMouseDown={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>服务器备份</h3>
              <button className="icon-btn" onClick={() => setShowServerBackups(false)}>×</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                <button className="btn primary small" onClick={handleCreateBackup} disabled={isCreatingBackup}>
                  {isCreatingBackup ? "备份中..." : "立即备份"}
                </button>
                <button className="btn ghost small" onClick={refreshBackupFiles} disabled={isLoadingBackups}>
                  {isLoadingBackups ? "加载中..." : "刷新列表"}
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxHeight: "60vh", overflowY: "auto", paddingRight: "4px" }}>
                {backupFiles.length ? backupFiles.map(file => (
                  <div key={file.file_name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", padding: "0.95rem 1rem", borderRadius: "16px", background: "var(--surface-2)", border: "1px solid var(--line)" }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 800, color: "var(--text)", wordBreak: "break-all" }}>{file.file_name}</div>
                      <div style={{ display: "flex", gap: "0.85rem", flexWrap: "wrap", marginTop: "0.35rem", fontSize: "0.82rem", color: "var(--muted)" }}>
                        <span>{fmtFileSize(file.file_size)}</span>
                        <span>{file.exported_at || file.modified_at || "-"}</span>
                        <span>{file.item_count ?? 0} 项</span>
                        <span>{file.upload_file_count ?? 0} 图片</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button className="btn primary small" onClick={() => { setShowServerBackups(false); openLocalBackupPreview(file.file_name); }} disabled={Boolean(file.is_broken)}>恢复</button>
                      <button className="btn ghost danger small" onClick={() => handleDeleteBackup(file.file_name)}>删除</button>
                    </div>
                  </div>
                )) : (
                  <div style={{ padding: "1rem 1.1rem", borderRadius: "16px", background: "var(--surface-2)", border: "1px dashed var(--line)", color: "var(--muted)" }}>
                    {isLoadingBackups ? "正在加载服务器备份..." : "尚无服务器备份。"}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showLogin && (
        <div className="modal" onMouseDown={e => e.target === e.currentTarget && setShowLogin(false)}>
          <div className="modal-card small" onMouseDown={e => e.stopPropagation()}>
            <div className="modal-head"><h3>登录</h3><button className="icon-btn" onClick={() => setShowLogin(false)}>×</button></div>
            <form className="form-grid one-col" onSubmit={async e => { 
              e.preventDefault(); 
              try { 
                const d = await apiRequest(`${API_BASE}/login`, { method: "POST", body: JSON.stringify({ password: loginForm.password }) }); 
                setToken(d.token); 
                setUser(d.user); 
                localStorage.setItem("neko_token", d.token); 
                if (loginForm.remember) {
                  localStorage.setItem("neko_remembered_password", loginForm.password);
                } else {
                  localStorage.removeItem("neko_remembered_password");
                }
                setShowLogin(false); 
                setShowPassword(false);
                if (!loginForm.remember) setLoginForm({ ...loginForm, password: "" }); 
              } catch (e) { 
                notify(e.message, "错误", "error"); 
              } 
            }}>
              <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>密码</span>
                <div className="password-input-wrap">
                  <input 
                    type={showPassword ? "text" : "password"} 
                    value={loginForm.password} 
                    onChange={e => setLoginForm({ ...loginForm, password: e.target.value })} 
                    required 
                    placeholder="请输入管理员密码"
                  />
                  <button 
                    type="button" 
                    className="password-toggle-btn"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex="-1"
                  >
                    {showPassword ? <div className="eye-icon"></div> : <div className="eye-off-icon"></div>}
                  </button>
                </div>
              </label>
              <div style={{ marginTop: "0.5rem", width: "100%", display: "flex", justifyContent: "flex-start" }}>
                <label className="checkbox-group" style={{ margin: 0 }}>
                  <input type="checkbox" checked={loginForm.remember} onChange={e => setLoginForm({ ...loginForm, remember: e.target.checked })} />
                  <span>记住密码</span>
                </label>
              </div>
              <div className="form-actions" style={{ marginTop: "1.5rem", width: "100%" }}>
                <button type="submit" className="btn primary" style={{ width: "100%", height: "3.25rem", fontSize: "1.1rem", borderRadius: "14px" }}>登录</button>
              </div>
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
                  {/* 第一组: 基础信息 (独立占行) */}
                  <label className="full">名称 / 系列名
                    <AutocompleteInput 
                      value={itemForm.name} 
                      onChange={val => setItemForm({ ...itemForm, name: val })} 
                      suggestions={suggestions.name}
                      required 
                    />
                  </label>
                  <div className="form-group full">
                    <span className="form-label">分类</span>
                    <OptionGroup
                      options={categoryOptions}
                      value={itemForm.category}
                      onChange={val => setItemForm({ ...itemForm, category: val })}
                      icons={CATEGORY_ICONS}
                    />
                  </div>
                  {itemForm.category === "书籍" && (
                    <div className="form-group full">
                      <span className="form-label">是否系列</span>
                      <div className="option-group">
                        <button type="button" className={`option-item ${itemForm.is_series ? "active" : ""}`} onClick={() => setItemForm({ ...itemForm, is_series: true })}>是 (具有多个分册)</button>
                        <button type="button" className={`option-item ${!itemForm.is_series ? "active" : ""}`} onClick={() => setItemForm({ ...itemForm, is_series: false })}>否 (单本书籍)</button>
                      </div>
                    </div>
                  )}

                  {/* 属性过滤: 系列书籍隐藏状态、平台、定价、日期 */}
                  {!(itemForm.category === "书籍" && itemForm.is_series) && (
                    <>
                      <div className="form-group full">
                        <span className="form-label">状态</span>
                        <OptionGroup
                          options={["owned", "preorder", "wishlist"]}
                          value={itemForm.status}
                          onChange={val => {
                            const update = { ...itemForm, status: val };
                            if (val === "wishlist") { update.purchase_price = ""; update.purchase_date = ""; }
                            setItemForm(update);
                          }}
                          icons={STATUS_ICONS}
                          labelMap={{ owned: "已购", preorder: "预订", wishlist: "未购" }}
                        />
                      </div>
                      <div className="form-group full">
                        <span className="form-label">购买平台</span>
                        <OptionGroup
                          options={PLATFORM_OPTIONS}
                          value={itemForm.platform}
                          onChange={val => setItemForm({ ...itemForm, platform: val })}
                          icons={PLATFORM_ICONS}
                        />
                      </div>
                    </>
                  )}

                  {/* 购买价格: 系列书籍隐藏，其他显示 */}
                  {!(itemForm.category === "书籍" && itemForm.is_series) && (
                    <div className="form-group full">
                      <span className="form-label">购买价格</span>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                        <input type="number" step="0.01" style={{ flex: "1 1 120px" }} value={itemForm.purchase_price} onChange={e => setItemForm({ ...itemForm, purchase_price: e.target.value })} disabled={itemForm.status === "wishlist"} placeholder="金额" />
                        <OptionGroup
                          options={PRICE_CURRENCY_OPTIONS}
                          value={itemForm.purchase_currency}
                          onChange={val => setItemForm({ ...itemForm, purchase_currency: val })}
                          icons={CURRENCY_ICONS}
                          labelMap={{ CNY: "￥CNY", JPY: "¥JPY", TWD: "NT$TWD", HKD: "$HKD" }}
                          hideIcons={true}
                        />
                      </div>
                    </div>
                  )}

                  {!(itemForm.category === "书籍" && itemForm.is_series) && (
                    <div className="form-group full">
                      <span className="form-label">商品定价</span>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                        <input type="number" step="0.01" style={{ flex: "1 1 120px" }} value={itemForm.list_price_amount} onChange={e => setItemForm({ ...itemForm, list_price_amount: e.target.value })} placeholder="金额" />
                        <OptionGroup
                          options={PRICE_CURRENCY_OPTIONS}
                          value={itemForm.list_price_currency}
                          onChange={val => setItemForm({ ...itemForm, list_price_currency: val })}
                          icons={CURRENCY_ICONS}
                          labelMap={{ CNY: "￥CNY", JPY: "¥JPY", TWD: "NT$TWD", HKD: "$HKD" }}
                          hideIcons={true}
                        />
                      </div>
                    </div>
                  )}

                  {/* 书籍特定属性 */}
                  {itemForm.category === "书籍" && (
                    <>
                      {!itemForm.is_series && (
                        <label>版本类型<select value={itemForm.book_edition_type} onChange={e => setItemForm({ ...itemForm, book_edition_type: e.target.value })}><option value="">请选择</option>{BOOK_EDITION_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}</select></label>
                      )}
                      <label>作者
                        <AutocompleteInput 
                          value={itemForm.author || ""} 
                          onChange={val => setItemForm({ ...itemForm, author: val })} 
                          suggestions={suggestions.author}
                        />
                      </label>
                      <label>出版社
                        <AutocompleteInput 
                          value={itemForm.publisher || ""} 
                          onChange={val => setItemForm({ ...itemForm, publisher: val })} 
                          suggestions={suggestions.publisher}
                        />
                      </label>
                    </>
                  )}

                  {(itemForm.category === "手办" || itemForm.category === "周边") && (
                    <label className="full">厂商
                      <AutocompleteInput 
                        value={itemForm.manufacturer || ""} 
                        onChange={val => setItemForm({ ...itemForm, manufacturer: val })} 
                        suggestions={suggestions.manufacturer}
                        placeholder="输入厂商名称..." 
                      />
                    </label>
                  )}

                  {/* 日期与标签并列 */}
                  {!(itemForm.category === "书籍" && itemForm.is_series) && itemForm.status !== "wishlist" ? (
                    <label>购买日期 (必填)
                      <input
                        type="date"
                        value={itemForm.purchase_date}
                        onChange={e => setItemForm({ ...itemForm, purchase_date: e.target.value })}
                        required={itemForm.status === "owned" || itemForm.status === "preorder"}
                      />
                    </label>
                  ) : <div style={{ display: "none" }}></div>}
                  
                  <div className="form-group">
                    <span className="form-label">标签 (输入后回车添加)</span>
                    <div className="tag-input-container">
                      {(itemForm.tags || []).map((t, i) => (
                        <span key={i} className="tag-capsule">{t}<span className="tag-remove" onClick={() => setItemForm({ ...itemForm, tags: itemForm.tags.filter((_, idx) => idx !== i) })}>×</span></span>
                      ))}
                      <AutocompleteInput
                        className="tag-inner-input"
                        style={{ border: "none", background: "transparent", flex: 1, minWidth: "120px", outline: "none", padding: "0.25rem" }}
                        value={tagInputValue}
                        onChange={setTagInputValue}
                        suggestions={suggestions.tags}
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

                  {/* 备注独立占行 */}
                  <label className="full">备注<textarea rows="2" value={itemForm.notes} onChange={e => setItemForm({ ...itemForm, notes: e.target.value })}></textarea></label>
                  
                  {/* 私密模式按钮 */}
                  <div className="full" style={{ marginTop: "0.5rem" }}>
                    <button
                      type="button"
                      className={`private-toggle-btn ${itemForm.is_private ? "active" : ""}`}
                      onClick={() => setItemForm({ ...itemForm, is_private: !itemForm.is_private })}
                    >
                      {itemForm.is_private ? "🔒 私密藏品" : "🔓 公开藏品"}
                    </button>
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
                  {selectedItem.category !== "书籍" && selectedItem.manufacturer && <div className="detail-line"><strong>厂商</strong> {selectedItem.manufacturer}</div>}
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
                      <div className="detail-line"><strong>购买时间</strong> {selectedItemPurchaseDate || "-"}</div>
                      {selectedItem.is_series && <div className="detail-line"><strong>盈亏估算</strong> <span className={(selectedItemVolumeProfitTotal || 0) >= 0 ? "diff-positive" : "diff-negative"}>{fmtSignedMoney(selectedItemVolumeProfitTotal || 0)}</span></div>}
                    </>
                  ) : (
                    <>
                      <div className="detail-line"><strong>购买价格</strong> {fmtMoney(selectedItem.purchase_price)}</div>
                      <div className="detail-line"><strong>购买时间</strong> {selectedItemPurchaseDate || "-"}</div>
                    </>
                  )}
                  {["owned", "preorder"].includes(selectedItem.status) && selectedItem.list_price_cny > 0 && (selectedItem.purchase_price > 0 || (selectedItem.category === "书籍" && selectedItem.total_spent_cny > 0)) && (
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
                      {["owned", "preorder"].includes(v.purchase_status) && v.list_price_cny > 0 ? (
                        <span className={v.list_price_cny - v.purchase_price_cny >= 0 ? "diff-positive" : "diff-negative"}>
                          {fmtSignedMoney(v.list_price_cny - v.purchase_price_cny)}
                        </span>
                      ) : "-"}
                    </div>
                    <div className="volume-cell">{fmtPlatform(v.platform)}</div>
                    <div className="volume-cell"><span className={`status-badge ${statusClass(v.purchase_status)}`}>{statusLabel(v.purchase_status)}</span></div>
                    <div className="volume-cell volume-row-actions" onClick={e => e.stopPropagation()}>
                      {loggedIn && <>
                        <button
                          className="action-icon-btn"
                          title="上移"
                          onClick={() => moveSelectedVolume(i, -1)}
                          disabled={i === 0}
                        >
                          ↑
                        </button>
                        <button
                          className="action-icon-btn"
                          title="下移"
                          onClick={() => moveSelectedVolume(i, 1)}
                          disabled={i === selectedItem.book_volumes.length - 1}
                        >
                          ↓
                        </button>
                        <button className="action-icon-btn" title="编辑" onClick={() => openVolumeModal(i)}>✎</button>
                        <button className="action-icon-btn danger" title="删除" onClick={() => askConfirm("确定要删除这个分册吗？", async () => { const nv = [...selectedItem.book_volumes]; nv.splice(i, 1); await updateSelectedItemVolumes(nv); })}>🗑</button>
                      </>}
                    </div>
                  </div>
                ))}

                  {loggedIn && <button className="btn ghost small top-gap" onClick={() => openVolumeModal(null)}>+ 新增分册</button>}
                </div>
              )}
            </div>
            <div className="item-actions top-gap">{loggedIn && <><button className="btn ghost" onClick={() => { setShowDetail(false); openEditItem(selectedItem); }}>编辑</button><button className="btn ghost danger" onClick={() => askConfirm("确定要永久删除这个藏品吗？", async () => { await apiRequest(`${API_BASE}/items/${selectedItem.id}`, { method: "DELETE" }); setShowDetail(false); await refreshAll(); })}>删除</button></>}</div>
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
                  {["owned", "preorder"].includes(selectedVolume.purchase_status) && selectedVolume.list_price_cny > 0 && selectedVolume.purchase_price_cny > 0 && (
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
                  <label className="full">分册名
                    <AutocompleteInput 
                      value={volumeForm.volume_title} 
                      onChange={val => setVolumeForm({ ...volumeForm, volume_title: val })} 
                      suggestions={suggestions.volume_title}
                      required 
                    />
                  </label>
                  <label className="full">版本类型<select value={volumeForm.edition_type} onChange={e => setVolumeForm({ ...volumeForm, edition_type: e.target.value })}>{BOOK_EDITION_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}</select></label>
                  <div className="form-group full">
                    <span className="form-label">购买状态</span>
                    <OptionGroup
                      options={["owned", "preorder", "wishlist"]}
                      value={volumeForm.purchase_status}
                      onChange={val => {
                        const update = { ...volumeForm, purchase_status: val };
                        if (val === "wishlist") { update.purchase_price = ""; update.purchase_date = ""; }
                        setVolumeForm(update);
                      }}
                      icons={STATUS_ICONS}
                      labelMap={{ owned: "已购", preorder: "预订", wishlist: "未购" }}
                    />
                  </div>
                  <div className="form-group full">
                    <span className="form-label">购买价格</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                      <input type="number" step="0.01" style={{ flex: "1 1 120px" }} value={volumeForm.purchase_price} onChange={e => setVolumeForm({ ...volumeForm, purchase_price: e.target.value })} disabled={volumeForm.purchase_status === "wishlist"} placeholder="金额" />
                      <OptionGroup
                        options={PRICE_CURRENCY_OPTIONS}
                        value={volumeForm.purchase_currency}
                        onChange={val => setVolumeForm({ ...volumeForm, purchase_currency: val })}
                        icons={CURRENCY_ICONS}
                        labelMap={{ CNY: "￥CNY", JPY: "¥JPY", TWD: "NT$TWD", HKD: "$HKD" }}
                        hideIcons={true}
                      />
                    </div>
                  </div>
                  <div className="form-group full">
                    <span className="form-label">商品定价</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                      <input type="number" step="0.01" style={{ flex: "1 1 120px" }} value={volumeForm.list_price_amount} onChange={e => setVolumeForm({ ...volumeForm, list_price_amount: e.target.value })} placeholder="金额" />
                      <OptionGroup
                        options={PRICE_CURRENCY_OPTIONS}
                        value={volumeForm.list_price_currency}
                        onChange={val => setVolumeForm({ ...volumeForm, list_price_currency: val })}
                        icons={CURRENCY_ICONS}
                        labelMap={{ CNY: "￥CNY", JPY: "¥JPY", TWD: "NT$TWD", HKD: "$HKD" }}
                        hideIcons={true}
                      />
                    </div>
                  </div>
                  <div className="form-group full">
                    <span className="form-label">购买平台</span>
                    <OptionGroup
                      options={PLATFORM_OPTIONS}
                      value={volumeForm.platform}
                      onChange={val => setVolumeForm({ ...volumeForm, platform: val })}
                      icons={PLATFORM_ICONS}
                    />
                  </div>
                  {volumeForm.purchase_status !== "wishlist" && (
                    <label className="full">购买日期 (必填)
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
      
      {showNotification && (
        <div className="modal" style={{ zIndex: 4000 }} onMouseDown={e => e.target === e.currentTarget && setShowNotification(false)}>
          <div className="modal-card small notification-modal" style={{ maxWidth: "420px" }} onMouseDown={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3 style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                {notificationConfig.type === "success" && "✅"}
                {notificationConfig.type === "error" && "❌"}
                {notificationConfig.type === "info" && "ℹ️"}
                {notificationConfig.title}
              </h3>
              <button className="icon-btn" onClick={() => setShowNotification(false)}>×</button>
            </div>
            <div style={{ padding: "1rem 0", color: "var(--text-soft)", lineHeight: 1.6, textAlign: "center", fontSize: "1.05rem" }}>
              {notificationConfig.message}
            </div>
            <div className="form-actions" style={{ justifyContent: "center", marginTop: "1rem" }}>
              <button className="btn primary" onClick={() => setShowNotification(false)} style={{ minWidth: "100px" }}>确定</button>
            </div>
          </div>
        </div>
      )}
      {confirmConfig.show && (
        <div className="modal" style={{ zIndex: 5000 }} onMouseDown={e => e.target === e.currentTarget && setConfirmConfig({ ...confirmConfig, show: false })}>
          <div className="modal-card small" style={{ maxWidth: "420px" }} onMouseDown={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{confirmConfig.title}</h3>
              <button className="icon-btn" onClick={() => setConfirmConfig({ ...confirmConfig, show: false })}>×</button>
            </div>
            <div style={{ padding: "1.5rem 0", color: "var(--text-soft)", lineHeight: 1.6, textAlign: "center", fontSize: "1.05rem" }}>
              {confirmConfig.message}
            </div>
            <div className="form-actions" style={{ justifyContent: "center", gap: "1rem" }}>
              <button className="btn ghost" onClick={() => setConfirmConfig({ ...confirmConfig, show: false })} style={{ minWidth: "100px" }}>取消</button>
              <button className="btn primary" onClick={() => { confirmConfig.onConfirm?.(); setConfirmConfig({ ...confirmConfig, show: false }); }} style={{ minWidth: "100px" }}>确定</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);
