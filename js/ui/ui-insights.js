/**
 * Dashboard-embedded insights: week trend lines, heatmap, week compare, summary + PNG.
 */
import {
  weekDailyByPerson,
  weekHealthRatingCounts,
  compareWeekPair,
  wellnessScore,
  aggregateWeek,
  dateKeyLocal,
} from "../analytics.js";

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

/** Rounded ceiling for a readable Y-axis max (avoids awkward ticks like 673). */
function niceYMax(rawMax) {
  if (rawMax <= 0) return 1;
  const x = rawMax * 1.08;
  const pow10 = 10 ** Math.floor(Math.log10(x));
  const n = x / pow10;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return nice * pow10;
}

/** Evenly spaced tick values from 0 to yMax (inclusive). */
function yAxisTicks(yMax, mode) {
  if (mode === "meals" || yMax <= 6) {
    const max = Math.max(1, Math.round(yMax));
    if (max <= 5) {
      const ticks = [];
      for (let i = 0; i <= max; i++) ticks.push(i);
      return ticks;
    }
    const step = Math.max(1, Math.ceil(max / 4));
    const ticks = [0];
    for (let v = step; v < max; v += step) ticks.push(v);
    if (ticks[ticks.length - 1] !== max) ticks.push(max);
    return ticks;
  }
  const n = 5;
  const ticks = [];
  for (let i = 0; i < n; i++) ticks.push((yMax * i) / (n - 1));
  return ticks;
}

function isTrendMobile() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches;
}

/** Responsive plot dimensions — tuned for phone screens. */
function getTrendLayout() {
  const mobile = isTrendMobile();
  return {
    H: mobile ? 268 : 300,
    padT: mobile ? 16 : 18,
    padB: mobile ? 42 : 38,
    padL: mobile ? 32 : 28,
    padR: mobile ? 10 : 14,
    plotW: mobile ? 296 : 556,
    xFont: mobile ? 12 : 11,
    dotR: mobile ? 5 : 5,
  };
}

function buildTrendPlot(dayLabels, yMax, layout) {
  const { H, padT, padB, padL, padR, plotW } = layout;
  const innerH = H - padT - padB;
  const svgW = padL + plotW + padR;
  const n = dayLabels.length;
  const xAt = (i) =>
    n <= 1 ? padL + plotW / 2 : padL + (i / (n - 1)) * plotW;
  const yAt = (v) => {
    const clamped = Math.max(0, Math.min(yMax, v));
    return padT + innerH - (clamped / yMax) * innerH;
  };
  const yBottom = padT + innerH;
  return { innerH, svgW, n, xAt, yAt, yBottom, layout };
}

function renderTrendGrid(yMax, mode, layout) {
  const { H, padT, padB, padL, plotW } = layout;
  const ticks = yAxisTicks(yMax, mode);
  const innerH = H - padT - padB;
  const gridLines = ticks
    .map((t) => {
      const y = padT + innerH - (t / yMax) * innerH;
      const isBase = t === 0;
      return `<line class="daybars-trend__grid${isBase ? " daybars-trend__grid--base" : ""}" x1="${padL}" y1="${y}" x2="${padL + plotW}" y2="${y}" />`;
    })
    .join("");
  return { ticks, gridLines };
}

function legendEntry(name, seriesClass, lastDayLabel, lastValue, mode) {
  const unit = mode === "kcal" ? " kcal" : "";
  const val =
    mode === "kcal" ? Number(lastValue).toLocaleString() + unit : String(Math.round(lastValue));
  return `<span class="daybars-legend__item"><span class="daybars-legend__swatch daybars-legend__swatch--${seriesClass}"></span><span class="daybars-legend__name">${escapeHtml(name)}</span><span class="daybars-legend__val">${escapeHtml(lastDayLabel)} · ${escapeHtml(val)}</span></span>`;
}

/** Straight line segments through points (ECharts-style line chart). */
function pointsToLinePath(pts) {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${pts[i].x} ${pts[i].y}`;
  }
  return d;
}

/** User 1 = red (a), User 2 = blue (b) — fixed across all charts. */
function seriesClassForUser(userId) {
  return userId === "u2" ? "b" : "a";
}

function renderTrendDots(series, seriesClass, dotR) {
  return series
    .map(
      (p) =>
        `<circle class="daybars-trend__dot daybars-trend__dot--${seriesClass}" cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="${dotR}" aria-hidden="true" />`,
    )
    .join("");
}

function renderXLabels(dayLabels, xAt, layout) {
  const { H, padB, xFont } = layout;
  return dayLabels
    .map((lab, i) => {
      const x = xAt(i);
      return `<text class="daybars-trend__xlabel" x="${x}" y="${H - 10}" text-anchor="middle" font-size="${xFont}">${escapeHtml(lab)}</text>`;
    })
    .join("");
}

function renderTrendSvg({ aria, layout, yBottom, gridLines, paths, dots, xLabels }) {
  const { svgW, H, padL, padT } = layout;
  return `
    <svg class="daybars-trend-svg" viewBox="0 0 ${svgW} ${H}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeHtml(aria)}">
      <line class="daybars-trend__yaxis" x1="${padL}" y1="${padT}" x2="${padL}" y2="${yBottom}" />
      ${gridLines}
      ${paths}
      ${dots}
      ${xLabels}
    </svg>`;
}

/**
 * Dual trend lines for the selected week (Mon–Sun): calories or meal counts per person.
 * ECharts-style: straight segments, dot per day, end labels on the right.
 * @param {"kcal" | "meals"} mode
 */
function renderPairedWeekTrendLines(weekData, mode, name1, name2) {
  const { dayLabels, u1Cal, u2Cal, u1N, u2N } = weekData;
  const u1Arr = mode === "kcal" ? u1Cal : u1N;
  const u2Arr = mode === "kcal" ? u2Cal : u2N;
  const dataMax = Math.max(0, ...u1Arr, ...u2Arr);
  const yMax = niceYMax(dataMax <= 0 ? (mode === "meals" ? 3 : 200) : dataMax);

  const title = mode === "kcal" ? "Calories / Day" : "Meals / Day";
  const yFmt = (t) => {
    const r = Math.round(t);
    return mode === "kcal" ? r.toLocaleString() : String(r);
  };

  const layout = getTrendLayout();
  const { svgW, xAt, yAt, yBottom } = buildTrendPlot(dayLabels, yMax, layout);
  const lastDay = dayLabels[dayLabels.length - 1] || "Sun";

  const series1 = u1Arr.map((v, i) => ({ x: xAt(i), y: yAt(v), v }));
  const series2 = u2Arr.map((v, i) => ({ x: xAt(i), y: yAt(v), v }));
  const path1d = pointsToLinePath(series1);
  const path2d = pointsToLinePath(series2);
  const dots1 = renderTrendDots(series1, "a", layout.dotR);
  const dots2 = renderTrendDots(series2, "b", layout.dotR);

  const { ticks, gridLines } = renderTrendGrid(yMax, mode, layout);

  const yLabelsHtml = ticks
    .map((t) => `<span class="daybars-yaxis-labels__tick">${escapeHtml(yFmt(t))}</span>`)
    .join("");

  const xLabels = renderXLabels(dayLabels, xAt, layout);

  const aria =
    mode === "kcal"
      ? `Calories per day for ${name1} and ${name2}, Mon–Sun`
      : `Meals per day for ${name1} and ${name2}, Mon–Sun`;

  const paths = [
    path1d ? `<path class="daybars-trend__path daybars-trend__path--a" d="${path1d}" />` : "",
    path2d ? `<path class="daybars-trend__path daybars-trend__path--b" d="${path2d}" />` : "",
  ].join("");

  const svg = renderTrendSvg({
    aria,
    layout: { ...layout, svgW },
    yBottom,
    gridLines,
    paths,
    dots: dots1 + dots2,
    xLabels,
  });

  const last1 = u1Arr[u1Arr.length - 1] ?? 0;
  const last2 = u2Arr[u2Arr.length - 1] ?? 0;

  return `
    <div class="daybars-card">
      <div class="insight-graph-header insight-graph-header--trend">
        <h4 class="daybars-card__title">${title}</h4>
        <div class="daybars-legend daybars-legend--values">
          ${legendEntry(name1, "a", lastDay, last1, mode)}
          ${legendEntry(name2, "b", lastDay, last2, mode)}
        </div>
      </div>
      <div class="insight-graph-body">
        <div class="daybars-chart daybars-chart--${mode === "kcal" ? "kcal" : "meals"}" style="--trend-pad-t: ${layout.padT}px; --trend-pad-b: ${layout.padB}px;">
          <div class="daybars-chart-inner">
            <div class="daybars-yaxis-labels" aria-hidden="true">${yLabelsHtml}</div>
            <div class="daybars-plot-surface">
              <div class="daybars-svg-frame" style="aspect-ratio: ${svgW} / ${layout.H}">${svg}</div>
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

/**
 * Single trend line for selected person (Mon–Sun).
 * @param {"kcal" | "meals"} mode
 * @param {"u1" | "u2"} userId
 */
function renderSingleWeekTrendLine(weekData, mode, userId, name) {
  const { dayLabels, u1Cal, u2Cal, u1N, u2N } = weekData;
  const userCal = userId === "u2" ? u2Cal : u1Cal;
  const userMeals = userId === "u2" ? u2N : u1N;
  const arr = mode === "kcal" ? userCal : userMeals;
  const seriesClass = seriesClassForUser(userId);
  const dataMax = Math.max(0, ...arr);
  const yMax = niceYMax(dataMax <= 0 ? (mode === "meals" ? 3 : 200) : dataMax);

  const title = mode === "kcal" ? "Calories / Day" : "Meals / Day";
  const yFmt = (t) => {
    const r = Math.round(t);
    return mode === "kcal" ? r.toLocaleString() : String(r);
  };

  const layout = getTrendLayout();
  const { svgW, xAt, yAt, yBottom } = buildTrendPlot(dayLabels, yMax, layout);
  const lastDay = dayLabels[dayLabels.length - 1] || "Sun";

  const series = arr.map((v, i) => ({ x: xAt(i), y: yAt(v), v }));
  const pathD = pointsToLinePath(series);
  const dots = renderTrendDots(series, seriesClass, layout.dotR);

  const { ticks, gridLines } = renderTrendGrid(yMax, mode, layout);

  const yLabelsHtml = ticks
    .map((t) => `<span class="daybars-yaxis-labels__tick">${escapeHtml(yFmt(t))}</span>`)
    .join("");

  const xLabels = renderXLabels(dayLabels, xAt, layout);

  const aria =
    mode === "kcal"
      ? `Calories per day for ${name}, Mon–Sun`
      : `Meals per day for ${name}, Mon–Sun`;

  const svg = renderTrendSvg({
    aria,
    layout: { ...layout, svgW },
    yBottom,
    gridLines,
    paths: pathD ? `<path class="daybars-trend__path daybars-trend__path--${seriesClass}" d="${pathD}" />` : "",
    dots,
    xLabels,
  });

  const lastVal = arr[arr.length - 1] ?? 0;

  return `
    <div class="daybars-card">
      <div class="insight-graph-header insight-graph-header--trend">
        <h4 class="daybars-card__title">${title}</h4>
        <div class="daybars-legend daybars-legend--values">
          ${legendEntry(name, seriesClass, lastDay, lastVal, mode)}
        </div>
      </div>
      <div class="insight-graph-body">
        <div class="daybars-chart daybars-chart--${mode === "kcal" ? "kcal" : "meals"}" style="--trend-pad-t: ${layout.padT}px; --trend-pad-b: ${layout.padB}px;">
          <div class="daybars-chart-inner">
            <div class="daybars-yaxis-labels" aria-hidden="true">${yLabelsHtml}</div>
            <div class="daybars-plot-surface">
              <div class="daybars-svg-frame" style="aspect-ratio: ${svgW} / ${layout.H}">${svg}</div>
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

function healthPiePolar(cx, cy, r, angleRad) {
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

/** Donut sector from angle a1 → a2 (radians, increasing). */
function healthPieDonutPath(cx, cy, rOuter, rInner, a1, a2) {
  const p1o = healthPiePolar(cx, cy, rOuter, a1);
  const p2o = healthPiePolar(cx, cy, rOuter, a2);
  const p2i = healthPiePolar(cx, cy, rInner, a2);
  const p1i = healthPiePolar(cx, cy, rInner, a1);
  const largeArc = a2 - a1 > Math.PI ? 1 : 0;
  return [
    `M ${p1o.x} ${p1o.y}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${p2o.x} ${p2o.y}`,
    `L ${p2i.x} ${p2i.y}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${p1i.x} ${p1i.y}`,
    `Z`,
  ].join(" ");
}

/**
 * Household rated meals for the week as a donut: Healthy / Neutral / Unhealthy.
 */
function renderHealthMixPieChart(counts) {
  const { healthy, neutral, unhealthy } = counts;
  const slices = [
    { n: healthy, cls: "health-pie__slice--healthy", ringCls: "health-pie__ring--healthy" },
    { n: neutral, cls: "health-pie__slice--neutral", ringCls: "health-pie__ring--neutral" },
    { n: unhealthy, cls: "health-pie__slice--unhealthy", ringCls: "health-pie__ring--unhealthy" },
  ];
  const total = healthy + neutral + unhealthy;
  const cx = 100;
  const cy = 100;
  const r = 88;
  const rHole = 46;
  const title = "Health mix";

  let paths = "";
  let cumulative = 0;
  if (total > 0) {
    const active = slices.filter((s) => s.n > 0);
    if (active.length === 1) {
      const s = active[0];
      const midR = (r + rHole) / 2;
      const sw = r - rHole;
      paths = `<circle class="health-pie__ring ${s.ringCls}" cx="${cx}" cy="${cy}" r="${midR}" fill="none" stroke-width="${sw}" />`;
    } else {
      for (const s of slices) {
        if (s.n <= 0) continue;
        const a1 = -Math.PI / 2 + (cumulative / total) * 2 * Math.PI;
        const a2 = -Math.PI / 2 + ((cumulative + s.n) / total) * 2 * Math.PI;
        paths += `<path class="health-pie__slice ${s.cls}" d="${healthPieDonutPath(cx, cy, r, rHole, a1, a2)}" />`;
        cumulative += s.n;
      }
    }
  }

  const aria =
    total === 0
      ? "No rated meals this week"
      : `Rated meals this week: ${healthy} healthy, ${neutral} neutral, ${unhealthy} unhealthy`;

  const center =
    total === 0
      ? `<text class="health-pie__empty" x="100" y="104" text-anchor="middle">No rated meals</text>`
      : `<text class="health-pie__total" x="100" y="104" text-anchor="middle">${total}</text>`;

  const emptyRing =
    total === 0
      ? `<circle class="health-pie__track" cx="${cx}" cy="${cy}" r="${(r + rHole) / 2}" fill="none" />`
      : "";

  return `
    <div class="daybars-card">
      <div class="insight-graph-header">
        <h4 class="daybars-card__title">${title}</h4>
        <div class="health-pie-legend">
          <span class="health-pie-legend__item"><span class="health-pie-legend__sw health-pie-legend__sw--healthy"></span>Healthy <span class="health-pie-legend__n">${healthy}</span></span>
          <span class="health-pie-legend__item"><span class="health-pie-legend__sw health-pie-legend__sw--neutral"></span>Neutral <span class="health-pie-legend__n">${neutral}</span></span>
          <span class="health-pie-legend__item"><span class="health-pie-legend__sw health-pie-legend__sw--unhealthy"></span>Unhealthy <span class="health-pie-legend__n">${unhealthy}</span></span>
        </div>
      </div>
      <div class="insight-graph-body">
        <div class="health-pie-wrap">
          <svg class="health-pie-svg" viewBox="0 0 200 200" width="100%" height="100%" role="img" aria-label="${escapeHtml(aria)}">
            ${emptyRing}
            ${paths}
            ${center}
          </svg>
        </div>
      </div>
    </div>`;
}

/** Legend swatches — sits in `.insight-graph-header` next to the panel title */
function heatmapLegendHtml() {
  return `<div class="heatmap-legend">
      <span class="heatmap-swatch heatmap-swatch--healthy"></span>
      <span>Healthy</span>
      <span class="heatmap-swatch heatmap-swatch--neutral"></span>
      <span>Neutral</span>
      <span class="heatmap-swatch heatmap-swatch--unhealthy"></span>
      <span>Unhealthy</span>
      <span class="heatmap-legend-gap">Unrated</span>
      <span class="heatmap-swatch heatmap-swatch--unrated"></span>
    </div>`;
}

function dayStatusFromAverage(avg) {
  if (avg >= 77.5) return "healthy";
  if (avg >= 37.5) return "neutral";
  return "unhealthy";
}

function dayStatusLabel(kind) {
  if (kind === "healthy") return "Healthy";
  if (kind === "neutral") return "Neutral";
  if (kind === "unhealthy") return "Unhealthy";
  return "No rated meals";
}

function dayScoresMap(meals) {
  const map = new Map();
  for (const m of meals || []) {
    const d = new Date(m.datetime);
    const key = dateKeyLocal(d);
    if (!map.has(key)) map.set(key, []);
    if (m.health === "healthy") map.get(key).push(100);
    else if (m.health === "okay") map.get(key).push(55);
    else if (m.health === "unhealthy") map.get(key).push(20);
  }
  return map;
}

function dayStatusFromMap(scoresMap, date) {
  const scores = scoresMap.get(dateKeyLocal(date)) || [];
  if (!scores.length) return "unrated";
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return dayStatusFromAverage(avg);
}

/** Monthly calendar grid (Sun-first) */
function renderMonthCalendarBody(meals, monthCursor) {
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const scoresMap = dayScoresMap(meals);
  const monthStart = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
  const monthEnd = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0);
  const firstWeekday = monthStart.getDay();
  const totalDays = monthEnd.getDate();
  const rows = [];
  let dayNum = 1;
  while (dayNum <= totalDays) {
    const week = [];
    for (let col = 0; col < 7; col++) {
      if ((rows.length === 0 && col < firstWeekday) || dayNum > totalDays) {
        week.push({ kind: "empty", day: "" });
      } else {
        const d = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), dayNum);
        const kind = dayStatusFromMap(scoresMap, d);
        week.push({ kind, day: dayNum, title: `${d.toDateString()}: ${dayStatusLabel(kind)}` });
        dayNum += 1;
      }
    }
    rows.push(week);
  }
  const body = rows
    .map((week) => {
      const cellsHtml = week
        .map((c) => {
          const cls = `heatmap-cell heatmap-cell--${c.kind}`;
          return `<div class="${cls}" title="${escapeHtml(c.title || "")}"><span class="heatmap-cell__day">${c.day || ""}</span></div>`;
        })
        .join("");
      return `<div class="heatmap-row">${cellsHtml}</div>`;
    })
    .join("");
  const weekdayHeader = weekday.map((d) => `<span class="heatmap-weekday">${d}</span>`).join("");
  return `<div class="insight-graph-body"><div class="heatmap-grid"><div class="heatmap-weekdays">${weekdayHeader}</div>${body}</div></div>`;
}

/** Renders into #dashboard-insights-mount on Overview. */
export function renderDashboardInsights(mount, state, weekCursor, showToast, dashboardScope) {
  if (!mount) return;

  const u1 = state.users.find((x) => x.id === "u1");
  const u2 = state.users.find((x) => x.id === "u2");
  const name1 = u1?.name || "User 1";
  const name2 = u2?.name || "User 2";
  const isHouseholdScope = dashboardScope === "all";
  const scopedUserId = dashboardScope === "u2" ? "u2" : "u1";
  const scopedName = scopedUserId === "u2" ? name2 : name1;
  const scopedMeals = isHouseholdScope
    ? state.meals
    : (state.meals || []).filter((m) => (m.userId === "u2" ? "u2" : "u1") === scopedUserId);

  const weekDaily = weekDailyByPerson(scopedMeals, weekCursor);
  const healthCounts = isHouseholdScope
    ? weekHealthRatingCounts(state.meals, weekCursor)
    : (() => {
        const agg = aggregateWeek(scopedMeals, weekCursor);
        return {
          healthy: agg.health.healthy,
          neutral: agg.health.okay,
          unhealthy: agg.health.unhealthy,
        };
      })();

  const cmp = isHouseholdScope
    ? compareWeekPair(state.meals, weekCursor)
    : (() => {
        const thisWeek = aggregateWeek(scopedMeals, weekCursor);
        const prevStart = new Date(weekCursor);
        prevStart.setDate(prevStart.getDate() - 7);
        const prevWeek = aggregateWeek(scopedMeals, prevStart);
        return { thisWeek, prevWeek };
      })();
  const thisAgg = cmp.thisWeek;
  const prevAgg = cmp.prevWeek;
  const wsThis = wellnessScore(thisAgg.health, thisAgg.rated);
  const wsPrev = wellnessScore(prevAgg.health, prevAgg.rated);
  const todayStatus = dayStatusFromMap(dayScoresMap(scopedMeals), new Date());
  const monthLabel = weekCursor.toLocaleDateString(undefined, { month: "short", year: "numeric" });

  mount.innerHTML = `
    <div class="dashboard-insights-inner">
      <h3 class="dashboard-insights-title">Trends &amp; patterns</h3>

      <div class="dashboard-insights-charts">
        <div class="insight-panel insight-panel--daybars">
          ${
            isHouseholdScope
              ? renderPairedWeekTrendLines(weekDaily, "kcal", name1, name2)
              : renderSingleWeekTrendLine(weekDaily, "kcal", scopedUserId, scopedName)
          }
        </div>
        <div class="insight-panel insight-panel--daybars">
          ${
            isHouseholdScope
              ? renderPairedWeekTrendLines(weekDaily, "meals", name1, name2)
              : renderSingleWeekTrendLine(weekDaily, "meals", scopedUserId, scopedName)
          }
        </div>
        <div class="dashboard-insights-health-row">
          <div class="insight-panel insight-panel--daybars">
            ${renderHealthMixPieChart(healthCounts)}
          </div>
          <div class="insight-panel insight-panel--heatmap insight-panel--heatmap-bottom insight-panel--stack">
            <div class="insight-graph-header">
              <div class="insight-panel__title-wrap">
                <h4 class="insight-panel__title">Health calendar</h4>
                <p class="insight-panel__meta">${escapeHtml(monthLabel)}</p>
              </div>
              ${heatmapLegendHtml()}
            </div>
            <div class="today-status-card" role="status" aria-live="polite">
              <p class="today-status-card__label">Today's Status</p>
              <p class="today-status-card__value">${escapeHtml(dayStatusLabel(todayStatus))}</p>
            </div>
            ${renderMonthCalendarBody(scopedMeals, weekCursor)}
          </div>
        </div>
      </div>

      <div class="dashboard-insights-columns dashboard-insights-columns--compare">
        <div class="insight-panel insight-panel--stack">
          <div class="insight-graph-header">
            <h4 class="insight-panel__title">This week</h4>
          </div>
          <ul class="insights-compare-list">
            <li><strong>Meals</strong> ${thisAgg.totalMeals}</li>
            <li><strong>Total kcal</strong> ${thisAgg.caloriesSum || "—"}</li>
            <li><strong>Avg kcal / meal</strong> ${thisAgg.avgCalories ?? "—"}</li>
            <li><strong>Wellness</strong> ${wsThis ?? "—"}</li>
          </ul>
        </div>
        <div class="insight-panel insight-panel--stack">
          <div class="insight-graph-header">
            <h4 class="insight-panel__title">Last week</h4>
          </div>
          <ul class="insights-compare-list">
            <li><strong>Meals</strong> ${prevAgg.totalMeals}</li>
            <li><strong>Total kcal</strong> ${prevAgg.caloriesSum || "—"}</li>
            <li><strong>Avg kcal / meal</strong> ${prevAgg.avgCalories ?? "—"}</li>
            <li><strong>Wellness</strong> ${wsPrev ?? "—"}</li>
          </ul>
        </div>
      </div>

    </div>
  `;
}
