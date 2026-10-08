const colors = {
  green: "#7daf89",
  greenDark: "#4d8565",
  lilac: "#a99ee3",
  orange: "#e4a172",
  yellow: "#d9bd70",
  blue: "#91b4c3",
  rose: "#cf8e8c",
  grid: "#edf0ec",
};

let months = ["Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out"];
let cashflow = {
  income: [8200, 8450, 8200, 8750, 8750, 8950, 8900, 9200],
  personal: [2480, 2670, 2520, 2890, 2530, 2610, 2380, 2510],
  home: [1650, 1780, 1640, 1820, 1700, 1930, 1750, 1860],
  pending: [0, 0, 190, 0, 310, 0, 420, 320],
};
let categories = [
  { name: "Alimentação", value: 6180, color: colors.green },
  { name: "Casa", value: 4530, color: colors.lilac },
  { name: "Transporte", value: 3500, color: colors.orange },
  { name: "Bem-estar", value: 2470, color: colors.yellow },
  { name: "Outros", value: 3910, color: colors.blue },
];
let homeSectors = [
  { name: "Moradia", value: 19200, color: colors.green },
  { name: "Mercado", value: 10240, color: colors.lilac },
  { name: "Contas", value: 6480, color: colors.orange },
  { name: "Transporte", value: 4080, color: colors.yellow },
  { name: "Pets e outros", value: 3940, color: colors.blue },
];
let homeCosts = [5150, 5350, 4920, 5680, 5450, 5790, 5620, 5980];
let householdPaid = {
  andre: [2900, 3100, 2750, 3220, 3150, 3330, 3080, 3460],
  ju: [2050, 2250, 2170, 2460, 2300, 2460, 2540, 2520],
};
let settlementHistory = [-1820, -2040, -1960, -2310, -2470, -2690, -3120, -3480];
const scenarios = {
  base: { label: "Base", monthly: 290, months: 12, color: colors.greenDark },
  optimistic: { label: "Otimista", monthly: 435, months: 9, color: "#82ad88" },
  conservative: { label: "Conservador", monthly: 218, months: 16, color: colors.orange },
};

let supabaseClient = null;
let currentUser = null;
let currentSpace = null;
let currentMembers = [];
let liveTransactions = [];
let usingLiveData = false;
let currentBalance = -3480;
let authMode = "signin";
let loadedUserId = null;
let sessionLoadUserId = null;
let sessionLoadPromise = null;
let authSubscription = null;
let sessionGeneration = 0;

const brl = (value) => new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
}).format(value);
const svgEl = (name, attrs = {}, text = "") => {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, value));
  if (text) element.textContent = text;
  return element;
};
const append = (parent, name, attrs, text) => {
  const node = svgEl(name, attrs, text);
  parent.appendChild(node);
  return node;
};
const setupSvg = (svg, width, height) => {
  svg.replaceChildren();
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
};
const shortMoney = (value) => {
  if (value === 0) return "0";
  const thousands = value / 1000;
  return `${Number.isInteger(thousands) ? thousands : thousands.toLocaleString("pt-BR")}k`;
};

function renderSummary() {
  const spend = cashflow.personal.reduce((sum, value) => sum + value, 0);
  const homeAverage = homeCosts.length ? homeCosts.reduce((sum, value) => sum + value, 0) / homeCosts.length : 0;
  const balance = settlementHistory.at(-1) ?? 0;
  document.querySelector("#individual-total").textContent = brl(spend);
  document.querySelector("#home-average").textContent = brl(homeAverage);
  document.querySelector("#settlement-total").textContent = `${balance > 0 ? "+ " : balance < 0 ? "− " : ""}${brl(Math.abs(balance))}`;
  document.querySelector("#settlement-total").classList.toggle("negative", balance < 0);
  document.querySelector("#settlement-current").textContent = `${balance > 0 ? "+ " : balance < 0 ? "− " : ""}${brl(Math.abs(balance))}`;
  document.querySelector("#settlement-current").classList.toggle("negative", balance < 0);
  currentBalance = balance;
  document.querySelector("#forecast-average").textContent = brl(homeAverage * 1.025);
}

function renderCashflowLegend() {
  const entries = [
    ["Entradas", colors.green],
    ["Gastos individuais", colors.lilac],
    ["Pagamentos do lar", colors.orange],
  ];
  if (!usingLiveData) entries.push(["A identificar", colors.blue]);
  const legend = document.querySelector("#cashflow-legend");
  legend.replaceChildren(...entries.map(([name, color]) => {
    const item = document.createElement("span");
    item.className = "legend-item";
    const swatch = document.createElement("i");
    swatch.className = "legend-swatch";
    swatch.style.backgroundColor = color;
    item.append(swatch, document.createTextNode(name));
    return item;
  }));
}

function renderCashflow(period = "all") {
  const svg = document.querySelector("#cashflow-chart");
  const startIndex = period === "recent" ? Math.max(0, months.length - 3) : 0;
  const labels = months.slice(startIndex).map((month) => typeof month === "string" ? month : month.label);
  const series = [
    { values: cashflow.income.slice(startIndex), color: colors.green },
    { values: cashflow.personal.slice(startIndex), color: colors.lilac },
    { values: cashflow.home.slice(startIndex), color: colors.orange },
    { values: cashflow.pending.slice(startIndex), color: colors.blue },
  ];
  const width = 660, height = 190, left = 37, right = 8, top = 12, bottom = 25;
  const chartHeight = height - top - bottom;
  const max = Math.max(10000, Math.ceil(Math.max(...series.flatMap((item) => item.values), 0) / 10000) * 10000);
  setupSvg(svg, width, height);
  [0, 1, 2, 3, 4].forEach((step) => {
    const tick = max * step / 4;
    const y = top + chartHeight * (1 - tick / max);
    append(svg, "line", { x1: left, y1: y, x2: width - right, y2: y, class: "gridline" });
    append(svg, "text", { x: left - 7, y: y + 3, "text-anchor": "end" }, shortMoney(tick));
  });
  const groupWidth = (width - left - right) / labels.length;
  const barWidth = Math.min(10, groupWidth / 6);
  const gap = 3;
  labels.forEach((label, index) => {
    const groupCenter = left + groupWidth * (index + .5);
    const firstX = groupCenter - (series.length * barWidth + (series.length - 1) * gap) / 2;
    series.forEach((item, seriesIndex) => {
      const value = item.values[index];
      const barHeight = chartHeight * value / max;
      append(svg, "rect", {
        x: firstX + seriesIndex * (barWidth + gap),
        y: top + chartHeight - barHeight,
        width: barWidth,
        height: Math.max(1, barHeight),
        rx: 3,
        fill: item.color,
        opacity: seriesIndex === 0 ? .88 : .82,
      });
    });
    append(svg, "text", { x: groupCenter, y: height - 5, "text-anchor": "middle" }, label);
  });
}

function renderDonut(target, data, centerLines, size = 180) {
  const svg = document.querySelector(target);
  setupSvg(svg, size, size);
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const cx = size / 2, cy = size / 2, radius = size * .36, stroke = size * .105;
  append(svg, "circle", { cx, cy, r: radius, fill: "none", stroke: "#f0f2ef", "stroke-width": stroke });
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  data.forEach((item) => {
    const segment = circumference * item.value / total;
    append(svg, "circle", {
      cx, cy, r: radius, fill: "none", stroke: item.color, "stroke-width": stroke,
      "stroke-dasharray": `${Math.max(0, segment - 2)} ${circumference - Math.max(0, segment - 2)}`,
      "stroke-dashoffset": -offset, transform: `rotate(-90 ${cx} ${cy})`,
      "stroke-linecap": "round",
    });
    offset += segment;
  });
  const lines = centerLines;
  append(svg, "text", { x: cx, y: cy - (lines.length === 2 ? 4 : 12), "text-anchor": "middle", fill: "#9ba49e", "font-size": 8 }, lines[0]);
  append(svg, "text", { x: cx, y: cy + (lines.length === 2 ? 14 : 8), "text-anchor": "middle", fill: "#3d4a42", "font-size": 14, "font-weight": 700 }, lines[1]);
}

function renderCategoryLegend() {
  const total = categories.reduce((sum, item) => sum + item.value, 0);
  const legend = document.querySelector("#category-legend");
  legend.replaceChildren(...categories.map((item) => {
    const row = document.createElement("div");
    row.className = "category-legend-row";
    const dot = document.createElement("i");
    dot.className = "legend-swatch";
    dot.style.backgroundColor = item.color;
    const name = document.createElement("span");
    name.textContent = item.name;
    const value = document.createElement("strong");
    value.textContent = `${Math.round(item.value / total * 100)}%`;
    row.append(dot, name, value);
    return row;
  }));
  renderDonut("#category-chart", categories, ["Total no período", brl(total)]);
}

function renderProgress(target, rows, oldLabel, newLabel) {
  const container = document.querySelector(target);
  container.replaceChildren(...rows.map((row) => {
    const item = document.createElement("div");
    item.className = "progress-row";
    const name = document.createElement("span");
    name.className = "progress-name";
    name.textContent = row.name;
    const track = document.createElement("span");
    track.className = "progress-track";
    const fill = document.createElement("span");
    fill.className = `progress-fill${row.direction === "down" ? "" : " warm"}`;
    fill.style.width = `${Math.max(12, Math.min(100, row.ratio * 100))}%`;
    track.append(fill);
    const meta = document.createElement("span");
    meta.className = "progress-meta";
    const amount = document.createElement("strong");
    const change = Math.abs(row.change).toLocaleString("pt-BR", {
      minimumFractionDigits: Number.isInteger(row.change) ? 0 : 1,
      maximumFractionDigits: 1,
    });
    amount.textContent = `${row.direction === "down" ? "↓" : "↑"} ${change}%`;
    const label = document.createElement("span");
    label.textContent = `${oldLabel} → ${newLabel}`;
    meta.append(amount, label);
    item.append(name, track, meta);
    return item;
  }));
}

function renderPayers() {
  const svg = document.querySelector("#payer-chart");
  const width = 600, height = 156, left = 35, right = 8, top = 7, bottom = 23;
  const chartHeight = height - top - bottom;
  const max = Math.max(7000, Math.ceil(Math.max(...months.map((_, index) => (householdPaid[Object.keys(householdPaid)[0]]?.[index] ?? 0) + (householdPaid[Object.keys(householdPaid)[1]]?.[index] ?? 0)), 0) / 1000) * 1000);
  setupSvg(svg, width, height);
  [0, 1, 2, 3].forEach((step) => {
    const tick = max * step / 3;
    const y = top + chartHeight * (1 - tick / max);
    append(svg, "line", { x1: left, y1: y, x2: width - right, y2: y, class: "gridline" });
    append(svg, "text", { x: left - 7, y: y + 3, "text-anchor": "end" }, shortMoney(tick));
  });
  const groupWidth = (width - left - right) / months.length;
  const memberIds = Object.keys(householdPaid);
  const firstMember = householdPaid[memberIds[0]] ?? [];
  const secondMember = householdPaid[memberIds[1]] ?? [];
  months.forEach((month, index) => {
    const barWidth = 22, x = left + groupWidth * (index + .5) - barWidth / 2;
    const firstHeight = chartHeight * (firstMember[index] ?? 0) / max;
    const secondHeight = chartHeight * (secondMember[index] ?? 0) / max;
    append(svg, "rect", { x, y: top + chartHeight - firstHeight, width: barWidth, height: firstHeight, rx: 3, fill: "#a5c8ab" });
    append(svg, "rect", { x, y: top + chartHeight - firstHeight - secondHeight, width: barWidth, height: secondHeight, rx: 3, fill: "#b3a8e7" });
    append(svg, "text", { x: x + barWidth / 2, y: height - 4, "text-anchor": "middle" }, typeof month === "string" ? month : month.label);
  });
}

function renderSettlement(scenarioKey = "base") {
  const svg = document.querySelector("#settlement-chart");
  const scenario = scenarios[scenarioKey];
  const width = 900, height = 195, left = 46, right = 15, top = 12, bottom = 25;
  const plotW = width - left - right, plotH = height - top - bottom;
  const balance = settlementHistory.at(-1) ?? 0;
  const projected = Array.from({ length: 13 }, (_, index) => balance < 0
    ? Math.min(0, balance + scenario.monthly * index)
    : Math.max(0, balance - scenario.monthly * index));
  const min = Math.min(-5000, ...settlementHistory, ...projected) - 250;
  const max = Math.max(1200, ...settlementHistory, ...projected) + 250;
  setupSvg(svg, width, height);
  const yScale = (value) => top + plotH * (1 - (value - min) / (max - min));
  const xScale = (index) => left + plotW * index / 19;
  [-4000, -2000, 0, 1000].forEach((tick) => {
    const y = yScale(tick);
    append(svg, "line", { x1: left, y1: y, x2: width - right, y2: y, class: tick === 0 ? "axisline" : "gridline", "stroke-dasharray": tick === 0 ? "0" : "3 4" });
    append(svg, "text", { x: left - 8, y: y + 3, "text-anchor": "end" }, tick === 0 ? "R$ 0" : `${tick < 0 ? "−" : ""}${Math.abs(tick) / 1000}k`);
  });
  settlementHistory.forEach((value, index) => {
    const x = xScale(index);
    const month = months[index];
    append(svg, "text", { x, y: height - 5, "text-anchor": "middle" }, typeof month === "string" ? month : month?.label ?? "");
  });
  [8, 10, 12, 14, 16, 18, 19].forEach((index) => {
    const lastMonth = months.at(-1);
    const lastDate = typeof lastMonth === "string"
      ? new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      : new Date(`${lastMonth.key}-01T12:00:00`);
    const date = new Date(lastDate.getFullYear(), lastDate.getMonth() + index - 7, 1);
    const label = new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(date).replace(".", "");
    append(svg, "text", { x: xScale(index), y: height - 5, "text-anchor": "middle" }, label);
  });
  const historyPoints = settlementHistory.map((value, index) => `${xScale(index)},${yScale(value)}`).join(" ");
  append(svg, "polyline", { points: historyPoints, fill: "none", stroke: "#a99ee3", "stroke-width": 2.5, "stroke-linecap": "round", "stroke-linejoin": "round" });
  append(svg, "circle", { cx: xScale(7), cy: yScale(balance), r: 4, fill: "#a99ee3", stroke: "#fff", "stroke-width": 2 });
  const projectionPoints = projected.map((value, index) => `${xScale(index + 7)},${yScale(value)}`).join(" ");
  append(svg, "polyline", {
    points: projectionPoints,
    fill: "none",
    stroke: scenario.color,
    "stroke-width": 2.5,
    "stroke-dasharray": "5 5",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
  });
  projected.forEach((value, index) => {
    if (index === 0 || index === 12 || Math.abs(value) < scenario.monthly) {
      append(svg, "circle", { cx: xScale(index + 7), cy: yScale(value), r: 3, fill: scenario.color });
    }
  });
  const zeroMonth = Math.ceil(Math.abs(balance) / scenario.monthly);
  const monthName = new Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric" }).format(new Date(new Date().getFullYear(), new Date().getMonth() + zeroMonth, 1));
  document.querySelector("#settlement-zero").textContent = balance === 0 ? "Acerto em dia" : monthName.replace(".", "").replace(/^\w/, (char) => char.toUpperCase());
}

function renderHomeSectors() {
  const container = document.querySelector("#home-sectors");
  const maximum = Math.max(1, ...homeSectors.map((item) => item.value));
  container.replaceChildren(...homeSectors.map((item) => {
    const row = document.createElement("div");
    row.className = "sector-row";
    const name = document.createElement("span");
    name.className = "sector-name";
    const dot = document.createElement("i");
    dot.style.backgroundColor = item.color;
    name.append(dot, document.createTextNode(item.name));
    const track = document.createElement("span");
    track.className = "sector-track";
    const fill = document.createElement("span");
    fill.style.width = `${item.value / maximum * 100}%`;
    fill.style.backgroundColor = item.color;
    track.append(fill);
    const value = document.createElement("span");
    value.className = "sector-values";
    const total = document.createElement("strong");
    total.textContent = brl(item.value);
    const average = document.createElement("span");
    average.textContent = `${brl(item.value / Math.max(1, months.length))}/mês`;
    value.append(total, average);
    row.append(name, track, value);
    return row;
  }));
}

function renderHomeForecast() {
  const svg = document.querySelector("#home-forecast-chart");
  const width = 600, height = 154, left = 34, right = 8, top = 9, bottom = 23;
  const plotH = height - top - bottom, base = homeCosts.at(-1) ?? 0, values = Array.from({ length: 12 }, (_, index) => Math.round(base * (1 + index * .0021)));
  const max = Math.max(6800, ...values.map((value) => Math.ceil(value / 1000) * 1000));
  setupSvg(svg, width, height);
  [3000, 4500, 6000].forEach((tick) => {
    const y = top + plotH * (1 - tick / max);
    append(svg, "line", { x1: left, y1: y, x2: width - right, y2: y, class: "gridline" });
    append(svg, "text", { x: left - 6, y: y + 3, "text-anchor": "end" }, shortMoney(tick));
  });
  const groupWidth = (width - left - right) / values.length;
  values.forEach((value, index) => {
    const barH = plotH * value / max, barW = Math.min(20, groupWidth * .52);
    const x = left + groupWidth * (index + .5) - barW / 2;
    append(svg, "rect", { x, y: top + plotH - barH, width: barW, height: barH, rx: 3, fill: index < 2 ? "#b5cdb6" : "#dce9db" });
    if (index % 2 === 0) {
      const date = new Date(new Date().getFullYear(), new Date().getMonth() + index + 1, 1);
      const label = new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(date).replace(".", "");
      append(svg, "text", { x: x + barW / 2, y: height - 4, "text-anchor": "middle" }, label);
    }
  });
}

function setNotice(message, type = "info") {
  const notice = document.querySelector("#backend-notice");
  notice.textContent = message;
  notice.className = `backend-notice${type === "error" ? " error" : type === "success" ? " success" : type === "warning" ? " warning" : ""}`;
}

function setFormMessage(id, message, type = "error") {
  const target = document.querySelector(id);
  target.textContent = message;
  target.className = `form-message${type === "success" ? " success" : ""}`;
}

function getBackendConfig() {
  try {
    return JSON.parse(localStorage.getItem("finance-supabase-config") || "null");
  } catch {
    return null;
  }
}

function getDisplayName() {
  const metadataName = currentUser?.user_metadata?.display_name;
  const emailName = currentUser?.email?.split("@")[0];
  const value = typeof metadataName === "string" ? metadataName : emailName;
  return (typeof value === "string" && value.trim() ? value.trim() : "Pessoa").slice(0, 80);
}

function updateAccountControls() {
  document.querySelector("#account-button").textContent = currentUser ? "Sair" : "Entrar";
  document.querySelector("#invite-button").hidden = !currentSpace || currentMembers.length >= 2;
  document.querySelector("#backend-button").textContent = supabaseClient ? "Backend ativo" : "Conectar";
  document.querySelector("#add-transaction-button").disabled = !currentSpace;
  document.querySelector("#footer-mode").textContent = usingLiveData
    ? "Dados protegidos pelo Supabase"
    : "Protótipo · valores fictícios";
  if (currentUser) {
    document.querySelector(".profile strong").textContent = getDisplayName();
    document.querySelector(".profile small").textContent = currentSpace?.name ?? "Sem espaço compartilhado";
    document.querySelector(".profile-avatar").textContent = getDisplayName().slice(0, 1).toUpperCase();
    document.querySelector(".welcome-row h1").firstChild.textContent = `Oi, ${getDisplayName()}`;
  } else {
    document.querySelector(".profile strong").textContent = "Ju";
    document.querySelector(".profile small").textContent = "Plano pessoal";
    document.querySelector(".profile-avatar").textContent = "J";
    document.querySelector(".welcome-row h1").firstChild.textContent = "Oi, Ju";
  }
}

function renderTransactionList(entries = []) {
  const container = document.querySelector("#transaction-list");
  container.replaceChildren();
  if (!usingLiveData) {
    const empty = document.createElement("p");
    empty.className = "empty-transactions";
    empty.textContent = "Conecte o Supabase e entre na sua conta para registrar dados reais. Os valores dos gráficos acima são apenas exemplos.";
    container.append(empty);
    return;
  }
  if (entries.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-transactions";
    empty.textContent = currentSpace
      ? "Ainda não há lançamentos neste período. Adicione o primeiro pelo botão acima."
      : "Crie um espaço ou entre com um convite para começar a registrar seus dados.";
    container.append(empty);
    return;
  }
  const formatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });
  entries.slice().sort((left, right) => right.occurred_on.localeCompare(left.occurred_on)).slice(0, 8).forEach((entry) => {
    const row = document.createElement("div");
    row.className = "transaction-row";
    const icon = document.createElement("span");
    icon.className = `transaction-icon ${entry.visibility}`;
    icon.textContent = entry.visibility === "shared" ? "⌂" : "◷";
    const detail = document.createElement("span");
    detail.className = "transaction-detail";
    const title = document.createElement("strong");
    title.textContent = entry.description || entry.category;
    const subtitle = document.createElement("small");
    subtitle.textContent = `${entry.category} · ${entry.visibility === "shared" ? "Conjunto" : "Individual"} · ${formatter.format(new Date(`${entry.occurred_on}T12:00:00`))}`;
    detail.append(title, subtitle);
    const amount = document.createElement("strong");
    amount.className = `transaction-amount ${entry.direction === "income" ? "income" : ""}`;
    amount.textContent = `${entry.direction === "income" ? "+" : "−"} ${brl(Number(entry.amount))}`;
    row.append(icon, detail, amount);
    container.append(row);
  });
}

function renderDashboard() {
  renderSummary();
  renderCashflowLegend();
  renderCashflow(document.querySelector("#period-select").value);
  renderCategoryLegend();
  renderPayers();
  renderSettlement(document.querySelector(".scenario-button.active")?.dataset.scenario ?? "base");
  renderHomeSectors();
  renderHomeForecast();
  renderTransactionList(liveTransactions);
  const setTrend = (selector, change) => {
    const trend = document.querySelector(selector);
    trend.textContent = `${change < 0 ? "↓" : change > 0 ? "↑" : "→"} ${Math.abs(change).toLocaleString("pt-BR")}%`;
    trend.className = `trend${change < 0 ? " down" : change > 0 ? " up" : " neutral"}`;
  };
  if (usingLiveData) {
    const currentExpenses = liveTransactions.filter((entry) => entry.direction === "expense");
    const personalExpenses = currentExpenses.filter((entry) => entry.visibility === "personal" && entry.user_id === currentUser.id);
    const sharedExpenses = currentExpenses.filter((entry) => entry.visibility === "shared");
    const previousMonths = months.slice(0, 4);
    const latestMonths = months.slice(4);
    const totalFor = (entries, selectedMonths) => entries.filter((entry) => selectedMonths.some((month) => month.key === entry.occurred_on.slice(0, 7))).reduce((sum, entry) => sum + Number(entry.amount), 0);
    const personalPrevious = totalFor(personalExpenses, previousMonths);
    const personalRecent = totalFor(personalExpenses, latestMonths);
    const homePrevious = totalFor(sharedExpenses, previousMonths);
    const homeRecent = totalFor(sharedExpenses, latestMonths);
    const pct = (before, after) => before === 0 ? (after === 0 ? 0 : 100) : Math.round((after - before) / before * 100);
    const personalChange = pct(personalPrevious, personalRecent);
    const homeChange = pct(homePrevious, homeRecent);
    const labels = `${previousMonths[0]?.label ?? "—"}–${previousMonths.at(-1)?.label ?? "—"}`;
    const recentLabels = `${latestMonths[0]?.label ?? "—"}–${latestMonths.at(-1)?.label ?? "—"}`;
    setTrend(".summary-card:nth-child(1) .trend", personalChange);
    setTrend(".summary-card:nth-child(2) .trend", homeChange);
    document.querySelector(".summary-card:nth-child(1) .summary-foot span:last-child").textContent = `vs. ${labels}`;
    document.querySelector(".summary-card:nth-child(2) .summary-foot span:last-child").textContent = `vs. ${labels}`;
    const partnerName = currentMembers.find((member) => member.user_id !== currentUser.id)?.display_name ?? "parceiro(a)";
    document.querySelector(".settlement-summary .summary-foot span:last-child").textContent = currentBalance < 0
      ? `${getDisplayName()} deve a ${partnerName}`
      : currentBalance > 0 ? `${partnerName} deve a ${getDisplayName()}` : "Acerto em dia";
    document.querySelector("#settlement-panel-subtitle").textContent = `Abaixo de zero = ${getDisplayName()} deve a ${partnerName}`;
    const range = `${months[0]?.label ?? ""}–${months.at(-1)?.label ?? ""} · R$`.toLocaleUpperCase("pt-BR");
    document.querySelector("#cashflow-range").textContent = range;
    document.querySelector("#category-range").textContent = range;
    document.querySelector("#home-sector-range").textContent = range;
    document.querySelector("#category-footnote").textContent = "Gastos individuais · visíveis só para você";
    const currentMonth = months.at(-1);
    const currentMonthIncome = cashflow.income.at(-1) ?? 0;
    const currentMonthOutflow = (cashflow.personal.at(-1) ?? 0) + (cashflow.home.at(-1) ?? 0);
    document.querySelector("#cashflow-insight").textContent = `Em ${currentMonth?.label ?? "este mês"}, foram registrados ${brl(currentMonthIncome)} em entradas e ${brl(currentMonthOutflow)} em saídas.`;
    renderProgress("#personal-progress", [
      { name: "Gastos pessoais", direction: personalChange < 0 ? "down" : "up", change: Math.abs(personalChange), ratio: personalPrevious ? personalRecent / personalPrevious : 1 },
      ...categories.slice(0, 2).map((category) => {
        const before = totalFor(personalExpenses.filter((entry) => entry.category === category.name), previousMonths);
        const after = totalFor(personalExpenses.filter((entry) => entry.category === category.name), latestMonths);
        const change = pct(before, after);
        return { name: category.name, direction: change < 0 ? "down" : "up", change: Math.abs(change), ratio: before ? after / before : 1 };
      }),
    ], labels, recentLabels);
    renderProgress("#home-progress", [
      { name: "Custo total", direction: homeChange < 0 ? "down" : "up", change: Math.abs(homeChange), ratio: homePrevious ? homeRecent / homePrevious : 1 },
      ...homeSectors.slice(0, 2).map((sector) => {
        const before = totalFor(sharedExpenses.filter((entry) => entry.category === sector.name), previousMonths);
        const after = totalFor(sharedExpenses.filter((entry) => entry.category === sector.name), latestMonths);
        const change = pct(before, after);
        return { name: sector.name, direction: change < 0 ? "down" : "up", change: Math.abs(change), ratio: before ? after / before : 1 };
      }),
    ], labels, recentLabels);
  } else {
    setTrend(".summary-card:nth-child(1) .trend", -8.4);
    setTrend(".summary-card:nth-child(2) .trend", 3.2);
    document.querySelector(".summary-card:nth-child(1) .summary-foot span:last-child").textContent = "vs. período anterior";
    document.querySelector(".summary-card:nth-child(2) .summary-foot span:last-child").textContent = "vs. quadrimestre anterior";
    document.querySelector(".settlement-summary .summary-foot span:last-child").textContent = "abaixo de zero = Ju deve ao André";
    document.querySelector("#settlement-panel-subtitle").textContent = "Abaixo de zero = Ju deve ao André";
    document.querySelector("#cashflow-range").textContent = "MARÇO A OUTUBRO · R$";
    document.querySelector("#category-range").textContent = "MARÇO A OUTUBRO · R$";
    document.querySelector("#home-sector-range").textContent = "JANEIRO A AGOSTO · R$";
    document.querySelector("#category-footnote").textContent = "Gastos individuais da Ju · visíveis só para você";
    document.querySelector("#cashflow-insight").textContent = "Em outubro, suas entradas cobriram os gastos individuais e a parte do lar.";
    renderProgress("#personal-progress", [
      { name: "Gastos pessoais", direction: "down", change: 8.4, ratio: .78 },
      { name: "Alimentação", direction: "up", change: 5.2, ratio: .52 },
      { name: "Transporte", direction: "down", change: 12.1, ratio: .68 },
    ], "Abr–Jun", "Set–Out");
    renderProgress("#home-progress", [
      { name: "Custo total", direction: "up", change: 6.8, ratio: .76 },
      { name: "Contas fixas", direction: "down", change: 2.4, ratio: .62 },
      { name: "Mercado", direction: "up", change: 9.1, ratio: .85 },
    ], "Jan–Abr", "Mai–Ago");
  }
}

function setDemoData() {
  usingLiveData = false;
  currentSpace = null;
  currentMembers = [];
  liveTransactions = [];
  months = ["Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out"];
  cashflow = {
    income: [8200, 8450, 8200, 8750, 8750, 8950, 8900, 9200],
    personal: [2480, 2670, 2520, 2890, 2530, 2610, 2380, 2510],
    home: [1650, 1780, 1640, 1820, 1700, 1930, 1750, 1860],
    pending: [0, 0, 190, 0, 310, 0, 420, 320],
  };
  categories = [
    { name: "Alimentação", value: 6180, color: colors.green },
    { name: "Casa", value: 4530, color: colors.lilac },
    { name: "Transporte", value: 3500, color: colors.orange },
    { name: "Bem-estar", value: 2470, color: colors.yellow },
    { name: "Outros", value: 3910, color: colors.blue },
  ];
  homeSectors = [
    { name: "Moradia", value: 19200, color: colors.green },
    { name: "Mercado", value: 10240, color: colors.lilac },
    { name: "Contas", value: 6480, color: colors.orange },
    { name: "Transporte", value: 4080, color: colors.yellow },
    { name: "Pets e outros", value: 3940, color: colors.blue },
  ];
  homeCosts = [5150, 5350, 4920, 5680, 5450, 5790, 5620, 5980];
  householdPaid = { andre: [2900, 3100, 2750, 3220, 3150, 3330, 3080, 3460], ju: [2050, 2250, 2170, 2460, 2300, 2460, 2540, 2520] };
  settlementHistory = [-1820, -2040, -1960, -2310, -2470, -2690, -3120, -3480];
  document.querySelector("#settlement-summary-label").firstChild.textContent = "Acerto acumulado da Ju ";
  document.querySelector("#settlement-panel-title").textContent = "Acerto acumulado da Ju";
  document.querySelector("#settlement-panel-subtitle").textContent = "Abaixo de zero = Ju deve ao André";
  document.querySelector("#pending-stat strong").textContent = "8 lançamentos · R$ 1.240";
  document.querySelector("#member-one-label").textContent = "André";
  document.querySelector("#member-two-label").textContent = "Ju";
  document.querySelector(".space-copy strong").textContent = "Ju + André";
  document.querySelector(".space-copy small").textContent = "Espaço do casal";
  document.querySelector(".avatar-ju").textContent = "J";
  document.querySelector(".avatar-andre").textContent = "A";
  document.querySelector("#backend-notice").className = "backend-notice";
  setNotice(supabaseClient
    ? "Entre na sua conta para carregar somente os lançamentos autorizados pelo banco."
    : "Modo de demonstração: os lançamentos não são salvos. Conecte seu projeto Supabase para usar dados reais.");
  updateAccountControls();
  renderDashboard();
}

function setEmptyAccountData() {
  usingLiveData = true;
  currentSpace = null;
  currentMembers = [];
  liveTransactions = [];
  const today = new Date();
  months = Array.from({ length: 8 }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth() - 7 + index, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const label = new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(date).replace(".", "");
    return { key, label };
  });
  cashflow = { income: Array(8).fill(0), personal: Array(8).fill(0), home: Array(8).fill(0), pending: Array(8).fill(0) };
  categories = [];
  homeSectors = [];
  homeCosts = Array(8).fill(0);
  householdPaid = {};
  settlementHistory = Array(8).fill(0);
  document.querySelector("#pending-stat strong").textContent = "Sem lançamentos";
  document.querySelector("#settlement-summary-label").firstChild.textContent = "Acerto acumulado ";
  document.querySelector("#settlement-panel-title").textContent = "Acerto acumulado";
  document.querySelector("#member-one-label").textContent = getDisplayName();
  document.querySelector("#member-two-label").textContent = "Parceiro(a)";
  document.querySelector(".space-copy strong").textContent = "Seu espaço";
  document.querySelector(".space-copy small").textContent = "Nenhum lar conectado";
  setNotice("Conta conectada: crie um espaço ou use um convite. Nenhum dado de demonstração é exibido na sua conta.", "success");
  updateAccountControls();
  renderDashboard();
}

function renderLiveData(entries, allTimeBalance) {
  usingLiveData = true;
  liveTransactions = entries;
  const today = new Date();
  months = Array.from({ length: 8 }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth() - 7 + index, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const label = new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(date).replace(".", "");
    return { key, label, income: 0, personal: 0, home: 0 };
  });
  const monthlyBalances = new Map();
  const colorByCategory = [colors.green, colors.lilac, colors.orange, colors.yellow, colors.blue, colors.rose];
  const categoryTotals = new Map();
  const sectorTotals = new Map();
  const memberIds = currentMembers.map((member) => member.user_id);
  const paidByMember = Object.fromEntries(memberIds.map((id) => [id, Array(8).fill(0)]));
  entries.forEach((entry) => {
    const monthIndex = months.findIndex((month) => month.key === entry.occurred_on.slice(0, 7));
    const amount = Number(entry.amount);
    if (entry.direction === "income" && entry.user_id === currentUser.id && monthIndex >= 0) months[monthIndex].income += amount;
    if (entry.direction !== "expense") return;
    if (entry.visibility === "shared") {
      if (monthIndex >= 0) {
        months[monthIndex].home += amount;
        sectorTotals.set(entry.category, (sectorTotals.get(entry.category) ?? 0) + amount);
        if (paidByMember[entry.user_id]) paidByMember[entry.user_id][monthIndex] += amount;
      }
      const delta = (entry.user_id === currentUser.id ? amount : -amount) / 2;
      monthlyBalances.set(entry.occurred_on.slice(0, 7), (monthlyBalances.get(entry.occurred_on.slice(0, 7)) ?? 0) + delta);
    } else if (entry.user_id === currentUser.id && monthIndex >= 0) {
      months[monthIndex].personal += amount;
      categoryTotals.set(entry.category, (categoryTotals.get(entry.category) ?? 0) + amount);
    }
  });
  cashflow = {
    income: months.map((month) => month.income),
    personal: months.map((month) => month.personal),
    home: months.map((month) => month.home),
    pending: Array(8).fill(0),
  };
  categories = [...categoryTotals.entries()].sort((left, right) => right[1] - left[1]).slice(0, 5).map(([name, value], index) => ({ name, value, color: colorByCategory[index % colorByCategory.length] }));
  homeSectors = [...sectorTotals.entries()].sort((left, right) => right[1] - left[1]).slice(0, 5).map(([name, value], index) => ({ name, value, color: colorByCategory[index % colorByCategory.length] }));
  homeCosts = months.map((month) => month.home);
  householdPaid = Object.fromEntries(memberIds.slice(0, 2).map((id) => [id, paidByMember[id] ?? Array(8).fill(0)]));
  let runningBalance = allTimeBalance - [...monthlyBalances.values()].reduce((sum, value) => sum + value, 0);
  const balanceByMonth = new Map();
  [...monthlyBalances.keys()].sort().forEach((key) => {
    runningBalance += monthlyBalances.get(key);
    balanceByMonth.set(key, runningBalance);
  });
  let latestKnownBalance = allTimeBalance - [...monthlyBalances.values()].reduce((sum, value) => sum + value, 0);
  settlementHistory = months.map((month) => {
    if (balanceByMonth.has(month.key)) latestKnownBalance = balanceByMonth.get(month.key);
    return latestKnownBalance;
  });
  setNotice(entries.length >= 5000
    ? "Os gráficos atingiram o limite de 5.000 lançamentos dos últimos 24 meses; o acerto acumulado continua sendo calculado no banco."
    : "Dados carregados do Supabase. Lançamentos individuais são filtrados por usuário e despesas do lar são compartilhadas.",
  entries.length >= 5000 ? "warning" : "success");
  updateAccountControls();
  document.querySelector("#member-one-label").textContent = currentMembers[0]?.display_name ?? "Você";
  document.querySelector("#member-two-label").textContent = currentMembers[1]?.display_name ?? "Parceiro(a)";
  document.querySelector("#pending-stat strong").textContent = "Nenhuma pendência";
  document.querySelector("#settlement-summary-label").firstChild.textContent = "Acerto acumulado ";
  document.querySelector(".space-copy strong").textContent = currentSpace.name;
  document.querySelector(".space-copy small").textContent = currentMembers.length === 2 ? "Espaço do casal" : "Aguardando parceiro(a)";
  document.querySelector(".avatar-ju").textContent = (currentMembers[0]?.display_name ?? "V").slice(0, 1).toUpperCase();
  document.querySelector(".avatar-andre").textContent = (currentMembers[1]?.display_name ?? "+").slice(0, 1).toUpperCase();
  document.querySelector("#transactions-title").textContent = "Lançamentos recentes";
  renderDashboard();
}

async function loadSpaceAndData() {
  if (!supabaseClient || !currentUser) return;
  const loadingUserId = currentUser.id;
  const { data: member, error: memberError } = await supabaseClient
    .from("space_members")
    .select("space_id, user_id, display_name")
    .eq("user_id", currentUser.id)
    .maybeSingle();
  if (memberError) throw memberError;
  if (currentUser?.id !== loadingUserId) return;
  if (!member) {
    setEmptyAccountData();
    resetSpaceDialog();
    document.querySelector("#space-dialog").showModal();
    return;
  }
  const [{ data: space, error: spaceError }, { data: members, error: membersError }] = await Promise.all([
    supabaseClient.from("couple_spaces").select("id, name").eq("id", member.space_id).single(),
    supabaseClient.from("space_members").select("user_id, display_name").eq("space_id", member.space_id),
  ]);
  if (spaceError) throw spaceError;
  if (membersError) throw membersError;
  if (currentUser?.id !== loadingUserId) return;
  currentSpace = space;
  currentMembers = members.sort((left, right) => left.user_id === currentUser.id ? -1 : right.user_id === currentUser.id ? 1 : 0);
  const start = new Date();
  start.setMonth(start.getMonth() - 23, 1);
  const startDate = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-01`;
  const today = new Date();
  const endDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const [
    { data: entries, error: entriesError },
    { data: settlementBalance, error: balanceError },
  ] = await Promise.all([
    supabaseClient
      .from("transactions")
      .select("id, direction, visibility, amount, category, description, occurred_on, user_id")
      .eq("space_id", space.id)
      .gte("occurred_on", startDate)
      .lte("occurred_on", endDate)
      .order("occurred_on", { ascending: false })
      .limit(5000),
    supabaseClient.rpc("get_settlement_balance", { p_space_id: space.id }),
  ]);
  if (entriesError) throw entriesError;
  if (balanceError) throw balanceError;
  if (currentUser?.id !== loadingUserId) return;
  renderLiveData([...entries].reverse(), Number(settlementBalance));
}

async function handleSession(session) {
  const nextUser = session?.user ?? null;
  if (!nextUser) {
    sessionGeneration += 1;
    currentUser = null;
    loadedUserId = null;
    sessionLoadUserId = null;
    sessionLoadPromise = null;
    currentSpace = null;
    currentMembers = [];
    setDemoData();
    return;
  }
  const userChanged = currentUser?.id !== nextUser.id;
  currentUser = nextUser;
  if (userChanged) {
    loadedUserId = null;
    currentSpace = null;
    currentMembers = [];
    liveTransactions = [];
    setEmptyAccountData();
  }
  updateAccountControls();
  if (loadedUserId === currentUser.id) return;
  if (sessionLoadUserId === currentUser.id && sessionLoadPromise) {
    await sessionLoadPromise;
    return;
  }
  sessionLoadUserId = currentUser.id;
  const generation = ++sessionGeneration;
  sessionLoadPromise = loadSpaceAndData();
  try {
    await sessionLoadPromise;
    if (generation === sessionGeneration) loadedUserId = currentUser.id;
  } catch (error) {
    if (generation === sessionGeneration) setNotice(`Não foi possível carregar seus dados: ${error.message}`, "error");
  } finally {
    if (generation === sessionGeneration) {
      sessionLoadUserId = null;
      sessionLoadPromise = null;
    }
  }
}

async function ensureSupabaseSdk() {
  if (window.supabase?.createClient) return window.supabase;
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Não foi possível carregar o SDK Supabase. Verifique sua conexão com a internet."));
    document.head.append(script);
  });
  if (!window.supabase?.createClient) throw new Error("O SDK do Supabase foi carregado, mas não está disponível.");
  return window.supabase;
}

async function connectSupabase(config) {
  const clientLibrary = await ensureSupabaseSdk();
  if (authSubscription) await authSubscription.unsubscribe();
  loadedUserId = null;
  sessionLoadUserId = null;
  sessionLoadPromise = null;
  sessionGeneration += 1;
  currentUser = null;
  currentSpace = null;
  currentMembers = [];
  liveTransactions = [];
  setDemoData();
  supabaseClient = clientLibrary.createClient(config.projectUrl, config.publishableKey);
  const { data: subscriptionData } = supabaseClient.auth.onAuthStateChange((_event, session) => {
    queueMicrotask(() => handleSession(session).catch((error) => setNotice(`Erro ao atualizar sessão: ${error.message}`, "error")));
  });
  authSubscription = subscriptionData.subscription;
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) throw error;
  document.querySelector("#backend-dialog").close();
  setNotice("Backend conectado. Entre na sua conta para carregar seus dados.", "success");
  await handleSession(data.session);
}

function updateAuthMode() {
  const signup = authMode === "signup";
  document.querySelector("#auth-dialog-title").textContent = signup ? "Criar sua conta" : "Entrar na sua conta";
  document.querySelector("#auth-submit").textContent = signup ? "Criar conta" : "Entrar";
  document.querySelector("#toggle-auth-mode").textContent = signup ? "Já tenho uma conta" : "Criar uma conta";
  document.querySelector(".signup-only").hidden = !signup;
  document.querySelector("#auth-form [name='password']").autocomplete = signup ? "new-password" : "current-password";
}

async function createSpace(formData) {
  const { data, error } = await supabaseClient.rpc("create_space", {
    p_name: formData.get("spaceName").trim(),
    p_display_name: getDisplayName(),
  });
  if (error) throw error;
  const result = Array.isArray(data) ? data[0] : data;
  await displayInviteCode(result.invite_code);
  await loadSpaceAndData();
  setFormMessage("#space-message", "Espaço criado. Envie o código acima; ele é de uso único e expira em 7 dias.", "success");
}

async function joinSpace(formData) {
  const { error } = await supabaseClient.rpc("join_space", {
    p_invite_code: formData.get("inviteCode").trim(),
    p_display_name: getDisplayName(),
  });
  if (error) throw error;
  document.querySelector("#space-dialog").close();
  await loadSpaceAndData();
  setNotice("Você entrou no espaço. Despesas conjuntas agora aparecem para o casal.", "success");
}

async function issueSpaceInvite() {
  const { data: inviteCode, error } = await supabaseClient.rpc("create_space_invite");
  if (error) throw error;
  document.querySelector("#create-space-form").hidden = true;
  document.querySelector(".dialog-divider").hidden = true;
  document.querySelector("#join-space-form").hidden = true;
  await displayInviteCode(inviteCode);
  document.querySelector("#space-dialog-title").textContent = "Convidar parceiro(a)";
  setFormMessage("#space-message", "Esse código de uso único expira em 7 dias.", "success");
  document.querySelector("#space-dialog").showModal();
}

async function displayInviteCode(inviteCode) {
  const invite = document.createElement("div");
  invite.className = "invite-code";
  const label = document.createElement("strong");
  label.textContent = "Código de convite — compartilhe com seu parceiro:";
  const code = document.createElement("code");
  code.textContent = inviteCode;
  const copy = document.createElement("button");
  copy.className = "secondary-button";
  copy.type = "button";
  copy.textContent = "Copiar código";
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(inviteCode);
      copy.textContent = "Copiado";
    } catch (error) {
      setFormMessage("#space-message", `Não foi possível copiar automaticamente: ${error.message}. Selecione o código e copie manualmente.`);
    }
  });
  invite.append(label, code, copy);
  const resultNode = document.querySelector("#invite-result");
  resultNode.replaceChildren(invite);
  resultNode.hidden = false;
}

function resetSpaceDialog() {
  document.querySelector("#space-dialog-title").textContent = "Crie ou conecte o lar";
  document.querySelector("#create-space-form").hidden = false;
  document.querySelector(".dialog-divider").hidden = false;
  document.querySelector("#join-space-form").hidden = false;
  document.querySelector("#invite-result").hidden = true;
  document.querySelector("#invite-result").replaceChildren();
  setFormMessage("#space-message", "");
}

async function submitTransaction(formData) {
  const entry = {
    space_id: currentSpace.id,
    user_id: currentUser.id,
    direction: formData.get("direction"),
    visibility: formData.get("direction") === "income" ? "personal" : formData.get("visibility"),
    amount: Number(formData.get("amount")),
    category: formData.get("category").trim(),
    description: formData.get("description").trim() || null,
    occurred_on: formData.get("occurredOn"),
  };
  const { error } = await supabaseClient.from("transactions").insert(entry);
  if (error) throw error;
  document.querySelector("#transaction-dialog").close();
  document.querySelector("#transaction-form").reset();
  await loadSpaceAndData();
  setNotice("Lançamento salvo com segurança.", "success");
}

function attachInteractions() {
  document.querySelector("#period-select").addEventListener("change", (event) => renderCashflow(event.target.value));
  document.querySelectorAll(".scenario-button").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelector(".scenario-button.active")?.classList.remove("active");
      button.classList.add("active");
      renderSettlement(button.dataset.scenario);
    });
  });
  document.querySelectorAll(".nav-link").forEach((link) => {
    link.addEventListener("click", () => {
      document.querySelector(".nav-link.active")?.classList.remove("active");
      link.classList.add("active");
    });
  });
  document.querySelector("#export-button").addEventListener("click", () => {
    const content = [
      [`Painel Financeiro Ju — ${usingLiveData ? "dados da sua conta" : "resumo fictício"}`, ""],
      [usingLiveData ? "Gastos individuais (últimos 8 meses)" : "Gastos individuais (março–outubro)", document.querySelector("#individual-total").textContent],
      ["Custo mensal médio do lar", document.querySelector("#home-average").textContent],
      ["Acerto acumulado da Ju", document.querySelector("#settlement-total").textContent],
      ["Observação", usingLiveData ? "Despesas individuais só são visíveis pela conta correspondente." : "Valores de demonstração; não são dados financeiros reais."],
    ].map((row) => row.join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = usingLiveData ? "resumo-financeiro.csv" : "resumo-financeiro-demo.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  });
  document.querySelector("#backend-button").addEventListener("click", () => {
    const config = getBackendConfig();
    const form = document.querySelector("#backend-config-form");
    form.elements.projectUrl.value = config?.projectUrl ?? "";
    form.elements.publishableKey.value = config?.publishableKey ?? "";
    setFormMessage("#backend-config-message", "");
    document.querySelector("#backend-dialog").showModal();
  });
  document.querySelector("#backend-config-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const projectUrl = form.elements.projectUrl.value.trim().replace(/\/+$/, "");
    const publishableKey = form.elements.publishableKey.value.trim();
    let parsedUrl;
    try {
      parsedUrl = new URL(projectUrl);
    } catch {
      setFormMessage("#backend-config-message", "Informe uma URL válida do Supabase.");
      return;
    }
    if (!["https:", "http:"].includes(parsedUrl.protocol) || (parsedUrl.protocol === "http:" && !["localhost", "127.0.0.1"].includes(parsedUrl.hostname))) {
      setFormMessage("#backend-config-message", "A URL deve usar HTTPS (HTTP só é aceito para Supabase local).");
      return;
    }
    if (/service[_-]?role|^sb_secret_/i.test(publishableKey)) {
      setFormMessage("#backend-config-message", "Essa parece ser uma chave administrativa. Use somente a chave publicável (anon/publishable).");
      return;
    }
    try {
      localStorage.setItem("finance-supabase-config", JSON.stringify({ projectUrl, publishableKey }));
      setFormMessage("#backend-config-message", "Conectando...", "success");
      await connectSupabase({ projectUrl, publishableKey });
    } catch (error) {
      setFormMessage("#backend-config-message", `Falha na conexão: ${error.message}`);
    }
  });
  document.querySelector("#account-button").addEventListener("click", async () => {
    if (currentUser && supabaseClient) {
      try {
        const { error } = await supabaseClient.auth.signOut();
        if (error) setNotice(`Não foi possível sair: ${error.message}`, "error");
      } catch (error) {
        setNotice(`Não foi possível sair: ${error.message}`, "error");
      }
      return;
    }
    if (!supabaseClient) {
      document.querySelector("#backend-button").click();
      return;
    }
    setFormMessage("#auth-message", "");
    document.querySelector("#auth-dialog").showModal();
  });
  document.querySelector("#invite-button").addEventListener("click", async () => {
    resetSpaceDialog();
    try {
      await issueSpaceInvite();
    } catch (error) {
      setNotice(`Não foi possível gerar o convite: ${error.message}`, "error");
    }
  });
  document.querySelector("#toggle-auth-mode").addEventListener("click", () => {
    authMode = authMode === "signup" ? "signin" : "signup";
    setFormMessage("#auth-message", "");
    updateAuthMode();
  });
  document.querySelector("#auth-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const email = form.elements.email.value.trim();
    const password = form.elements.password.value;
    try {
      const result = authMode === "signup"
        ? await supabaseClient.auth.signUp({
          email,
          password,
          options: { data: { display_name: form.elements.displayName.value.trim() || email.split("@")[0] } },
        })
        : await supabaseClient.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      if (authMode === "signup" && !result.data.session) {
        setFormMessage("#auth-message", "Conta criada. Confirme o e-mail enviado pelo Supabase e depois entre.", "success");
      } else {
        document.querySelector("#auth-dialog").close();
        await handleSession(result.data.session);
      }
    } catch (error) {
      setFormMessage("#auth-message", `Não foi possível autenticar: ${error.message}`);
    }
  });
  document.querySelector("#create-space-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await createSpace(new FormData(event.currentTarget));
    } catch (error) {
      setFormMessage("#space-message", `Não foi possível criar o espaço: ${error.message}`);
    }
  });
  document.querySelector("#join-space-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await joinSpace(new FormData(event.currentTarget));
    } catch (error) {
      setFormMessage("#space-message", `Não foi possível entrar: ${error.message}`);
    }
  });
  document.querySelector("#add-transaction-button").addEventListener("click", () => {
    if (!currentSpace) return;
    const form = document.querySelector("#transaction-form");
    form.reset();
    form.elements.visibility.closest("label").hidden = false;
    document.querySelector("#transaction-visibility-hint").textContent = "Gastos individuais são privados. Apenas lançamentos do lar aparecem para ambas as pessoas.";
    const today = new Date();
    form.elements.occurredOn.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    form.elements.occurredOn.max = form.elements.occurredOn.value;
    setFormMessage("#transaction-message", "");
    document.querySelector("#transaction-dialog").showModal();
  });
  document.querySelector("#transaction-form [name='direction']").addEventListener("change", (event) => {
    const visibility = document.querySelector("#transaction-form [name='visibility']");
    const income = event.target.value === "income";
    if (income) visibility.value = "personal";
    visibility.closest("label").hidden = income;
    document.querySelector("#transaction-visibility-hint").textContent = income
      ? "Entradas são individuais e privadas por padrão."
      : "Despesas individuais são privadas. Em despesas do lar, quem registra é considerado pagador.";
  });
  document.querySelector("#transaction-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await submitTransaction(new FormData(event.currentTarget));
    } catch (error) {
      setFormMessage("#transaction-message", `Não foi possível salvar: ${error.message}`);
    }
  });
}

setDemoData();
updateAuthMode();
attachInteractions();
const savedBackendConfig = getBackendConfig();
if (savedBackendConfig?.projectUrl && savedBackendConfig?.publishableKey) {
  connectSupabase(savedBackendConfig).catch((error) => setNotice(`Não foi possível conectar ao Supabase: ${error.message}`, "error"));
}
