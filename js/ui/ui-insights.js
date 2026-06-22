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
function yAxisTicks(yMax, count) {
  const ticks = [];
  const n = Math.max(2, count);
  for (let i = 0; i < n; i++) {
    ticks.push((yMax * i) / (n - 1));
  }
  return ticks;
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

function renderTrendDots(series, seriesClass) {
  return series
    .map(
      (p) =>
        `<circle class="daybars-trend__dot daybars-trend__dot--${seriesClass}" cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="5" aria-hidden="true" />`,
    )
    .join("");
}

/** End labels at the right of the plot (shift vertically if they overlap). */
function renderEndLabels(items, labelX) {
  const minGap = 15;
  const sorted = items.map((it) => ({ ...it, y: it.y }));
  sorted.sort((a, b) => a.y - b.y);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].y - sorted[i - 1].y < minGap) {
      sorted[i].y = sorted[i - 1].y + minGap;
    }
  }
  return sorted
    .map(
      (it) =>
        `<text class="daybars-trend__endlabel daybars-trend__endlabel--${it.cls}" x="${labelX.toFixed(2)}" y="${it.y.toFixed(2)}" dominant-baseline="middle">${escapeHtml(it.text)}</text>`,
    )
    .join("");
}

const TREND_CHART_H = 280;
const TREND_PAD_T = 14;
const TREND_PAD_B = 36;
const TREND_PAD_L = 28;
const TREND_PAD_R = 120;
const TREND_PLOT_W = 572;

function buildTrendPlot(dayLabels, yMax) {
  const innerH = TREND_CHART_H - TREND_PAD_T - TREND_PAD_B;
  const svgW = TREND_PAD_L + TREND_PLOT_W + TREND_PAD_R;
  const n = dayLabels.length;
  const xAt = (i) =>
    n <= 1 ? TREND_PAD_L + TREND_PLOT_W / 2 : TREND_PAD_L + (i / (n - 1)) * TREND_PLOT_W;
  const yAt = (v) => {
    const clamped = Math.max(0, Math.min(yMax, v));
    return TREND_PAD_T + innerH - (clamped / yMax) * innerH;
  };
  const yBottom = TREND_PAD_T + innerH;
  const endLabelX = TREND_PAD_L + TREND_PLOT_W + 10;
  return { innerH, svgW, n, xAt, yAt, yBottom, endLabelX };
}

function renderTrendGrid(yMax, mode) {
  const ticks = yAxisTicks(yMax, mode === "meals" ? 4 : 5);
  const innerH = TREND_CHART_H - TREND_PAD_T - TREND_PAD_B;
  const gridLines = ticks
    .map((t) => {
      const y = TREND_PAD_T + innerH - (t / yMax) * innerH;
      const isBase = t === 0;
      return `<line class="daybars-trend__grid${isBase ? " daybars-trend__grid--base" : ""}" x1="${TREND_PAD_L}" y1="${y}" x2="${TREND_PAD_L + TREND_PLOT_W}" y2="${y}" />`;
    })
    .join("");
  return { ticks, gridLines };
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

  const { svgW, xAt, yAt, yBottom, endLabelX } = buildTrendPlot(dayLabels, yMax);

  const series1 = u1Arr.map((v, i) => ({ x: xAt(i), y: yAt(v), v }));
  const series2 = u2Arr.map((v, i) => ({ x: xAt(i), y: yAt(v), v }));
  const path1d = pointsToLinePath(series1);
  const path2d = pointsToLinePath(series2);
  const dots1 = renderTrendDots(series1, "a");
  const dots2 = renderTrendDots(series2, "b");

  const last1 = series1[series1.length - 1];
  const last2 = series2[series2.length - 1];
  const endLabels = renderEndLabels(
    [
      { y: last1.y, text: `${name1}: ${yFmt(last1.v)}`, cls: "a" },
      { y: last2.y, text: `${name2}: ${yFmt(last2.v)}`, cls: "b" },
    ],
    endLabelX,
  );

  const { ticks, gridLines } = renderTrendGrid(yMax, mode);

  const yLabelsHtml = ticks
    .map((t) => `<span class="daybars-yaxis-labels__tick">${escapeHtml(yFmt(t))}</span>`)
    .join("");

  const xLabels = dayLabels
    .map((lab, i) => {
      const x = xAt(i);
      return `<text class="daybars-trend__xlabel" x="${x}" y="${TREND_CHART_H - 8}" text-anchor="middle">${escapeHtml(lab)}</text>`;
    })
    .join("");

  const aria =
    mode === "kcal"
      ? `Calories per day for ${name1} and ${name2}, Mon–Sun`
      : `Meals per day for ${name1} and ${name2}, Mon–Sun`;

  const svg = `
    <svg class="daybars-trend-svg" viewBox="0 0 ${svgW} ${TREND_CHART_H}" width="100%" height="100%" preserveAspectRatio="xMinYMid meet" role="img" aria-label="${escapeHtml(aria)}">
      <line class="daybars-trend__yaxis" x1="${TREND_PAD_L}" y1="${TREND_PAD_T}" x2="${TREND_PAD_L}" y2="${yBottom}" />
      ${gridLines}
      ${path1d ? `<path class="daybars-trend__path daybars-trend__path--a" d="${path1d}" />` : ""}
      ${path2d ? `<path class="daybars-trend__path daybars-trend__path--b" d="${path2d}" />` : ""}
      ${dots1}${dots2}
      ${endLabels}
      ${xLabels}
    </svg>`;

  return `
    <div class="daybars-card">
      <div class="insight-graph-header">
        <h4 class="daybars-card__title">${title}</h4>
        <div class="daybars-legend">
          <span><span class="daybars-legend__swatch daybars-legend__swatch--a"></span>${escapeHtml(name1)}</span>
          <span><span class="daybars-legend__swatch daybars-legend__swatch--b"></span>${escapeHtml(name2)}</span>
        </div>
      </div>
      <div class="insight-graph-body">
        <div class="daybars-chart daybars-chart--${mode === "kcal" ? "kcal" : "meals"}" style="--trend-pad-t: ${TREND_PAD_T}px; --trend-pad-b: ${TREND_PAD_B}px;">
          <div class="daybars-chart-inner">
            <div class="daybars-yaxis-labels" aria-hidden="true">${yLabelsHtml}</div>
            <div class="daybars-plot-surface">
              <div class="daybars-svg-frame">${svg}</div>
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

  const { svgW, xAt, yAt, yBottom, endLabelX } = buildTrendPlot(dayLabels, yMax);

  const series = arr.map((v, i) => ({ x: xAt(i), y: yAt(v), v }));
  const pathD = pointsToLinePath(series);
  const dots = renderTrendDots(series, seriesClass);

  const last = series[series.length - 1];
  const endLabels = renderEndLabels(
    [{ y: last.y, text: `${name}: ${yFmt(last.v)}`, cls: seriesClass }],
    endLabelX,
  );

  const { ticks, gridLines } = renderTrendGrid(yMax, mode);

  const yLabelsHtml = ticks
    .map((t) => `<span class="daybars-yaxis-labels__tick">${escapeHtml(yFmt(t))}</span>`)
    .join("");

  const xLabels = dayLabels
    .map((lab, i) => {
      const x = xAt(i);
      return `<text class="daybars-trend__xlabel" x="${x}" y="${TREND_CHART_H - 8}" text-anchor="middle">${escapeHtml(lab)}</text>`;
    })
    .join("");

  const aria =
    mode === "kcal"
      ? `Calories per day for ${name}, Mon–Sun`
      : `Meals per day for ${name}, Mon–Sun`;

  const svg = `
    <svg class="daybars-trend-svg" viewBox="0 0 ${svgW} ${TREND_CHART_H}" width="100%" height="100%" preserveAspectRatio="xMinYMid meet" role="img" aria-label="${escapeHtml(aria)}">
      <line class="daybars-trend__yaxis" x1="${TREND_PAD_L}" y1="${TREND_PAD_T}" x2="${TREND_PAD_L}" y2="${yBottom}" />
      ${gridLines}
      ${pathD ? `<path class="daybars-trend__path daybars-trend__path--${seriesClass}" d="${pathD}" />` : ""}
      ${dots}
      ${endLabels}
      ${xLabels}
    </svg>`;

  return `
    <div class="daybars-card">
      <div class="insight-graph-header">
        <h4 class="daybars-card__title">${title}</h4>
        <div class="daybars-legend">
          <span><span class="daybars-legend__swatch daybars-legend__swatch--${seriesClass}"></span>${escapeHtml(name)}</span>
        </div>
      </div>
      <div class="insight-graph-body">
        <div class="daybars-chart daybars-chart--${mode === "kcal" ? "kcal" : "meals"}" style="--trend-pad-t: ${TREND_PAD_T}px; --trend-pad-b: ${TREND_PAD_B}px;">
          <div class="daybars-chart-inner">
            <div class="daybars-yaxis-labels" aria-hidden="true">${yLabelsHtml}</div>
            <div class="daybars-plot-surface">
              <div class="daybars-svg-frame">${svg}</div>
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
