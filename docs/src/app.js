/* Stdlib versions across Julia releases: a run-length "swimlane" matrix.
 *
 * Rows are stdlibs, columns are the Julia releases tracked in version_map.jl.
 * Consecutive columns with the same stdlib version are merged into one bar.
 * Everything is rendered into four SVGs (corner / header / labels / chart) so the
 * header and row labels can stay sticky while the grid scrolls.
 */
(function () {
  "use strict";

  const DATA = window.HSV_DATA;
  const SVG_NS = "http://www.w3.org/2000/svg";

  // Column width depends on the density setting; "fit" sizes it to the viewport.
  const DENSITY_W = { compact: 40, wide: 64 };
  const MIN_COL_W = 22;
  let COL_W = DENSITY_W.compact;
  const ROW_H = 24;
  const LABEL_W = 168;
  const GROUP_H = 20;
  const BAR_PAD = 4;
  const RAMP_STEPS = 10;

  const $ = (id) => document.getElementById(id);
  const el = (tag, attrs, parent) => {
    const n = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  };
  const h = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  // ---------- data prep ----------
  const versions = DATA.julia_versions;
  const NCOL = versions.length;
  const minorOf = (v) => v.split(".").slice(0, 2).join(".");
  const byName = new Map();

  const stdlibs = DATA.stdlibs.map((s) => {
    const runs = [];
    let cur = null;
    s.entries.forEach((e, i) => {
      if (!e) { cur = null; return; }
      if (cur && cur.v === e.v && cur.u === e.u) { cur.end = i; return; }
      cur = { start: i, end: i, v: e.v, u: !!e.u };
      runs.push(cur);
    });
    const versioned = runs.filter((r) => r.v !== null);
    versioned.forEach((r, k) => {
      r.ramp = versioned.length === 1 ? 4 : Math.round((k * (RAMP_STEPS - 1)) / (versioned.length - 1));
    });
    let bumps = 0;
    for (let i = 1; i < NCOL; i++) {
      const a = s.entries[i - 1], b = s.entries[i];
      if (a && b && a.v !== null && b.v !== null && a.v !== b.v) bumps++;
    }
    const present = s.entries.map((e, i) => (e ? i : -1)).filter((i) => i >= 0);
    const out = {
      ...s, runs, bumps,
      firstCol: present[0],
      lastCol: present[present.length - 1],
      removed: present[present.length - 1] < NCOL - 1,
    };
    byName.set(s.name, out);
    return out;
  });

  // Per-column diff against the previous tracked release.
  const diffs = versions.map((v, i) => {
    const d = { added: [], removed: [], bumped: [], upgradable: [] };
    if (i === 0) return d;
    for (const s of stdlibs) {
      const a = s.entries[i - 1], b = s.entries[i];
      if (!a && b) d.added.push(s);
      else if (a && !b) d.removed.push(s);
      else if (a && b && a.v !== b.v) d.bumped.push({ s, from: a.v, to: b.v });
      if (a && b && !!a.u !== !!b.u) d.upgradable.push({ s, now: !!b.u });
    }
    return d;
  });

  const dependents = (name, col) => stdlibs.filter((s) => {
    const e = s.entries[col];
    return e && (e.d.includes(name) || e.w.includes(name));
  });

  // Minor-series groups for the header bands.
  const groups = [];
  versions.forEach((v, i) => {
    const m = minorOf(v);
    const g = groups[groups.length - 1];
    if (g && g.minor === m) g.end = i; else groups.push({ minor: m, start: i, end: i });
  });

  // ---------- state ----------
  const state = {
    query: "",
    kind: "all",
    sort: "name",
    onlyChanged: false,
    view: "chart",
    density: "fit",  // fit | compact | wide
    release: null,   // column index
    stdlib: null,    // stdlib name
  };

  function visibleRows() {
    const q = state.query.trim().toLowerCase();
    let rows = stdlibs.filter((s) => {
      if (state.kind === "lib" && s.jll) return false;
      if (state.kind === "jll" && !s.jll) return false;
      // Upgradable as of the newest tracked release.
      if (state.kind === "upgradable" && !(s.entries[NCOL - 1] && s.entries[NCOL - 1].u)) return false;
      if (q && !s.name.toLowerCase().includes(q)) return false;
      if (state.onlyChanged && state.release !== null) {
        const d = diffs[state.release];
        const hit = d.added.includes(s) || d.removed.includes(s) || d.bumped.some((b) => b.s === s) || d.upgradable.some((b) => b.s === s);
        if (!hit) return false;
      }
      return true;
    });
    const byNameCmp = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    const cmp = {
      name: byNameCmp,
      added: (a, b) => a.firstCol - b.firstCol || byNameCmp(a, b),
      bumps: (a, b) => b.bumps - a.bumps || byNameCmp(a, b),
      removed: (a, b) => (b.removed - a.removed) || (a.lastCol - b.lastCol) || byNameCmp(a, b),
    }[state.sort];
    rows.sort(cmp);
    // Keep libraries and JLLs as two blocks when both are shown and sorted by name.
    if (state.kind === "all" && state.sort === "name") {
      rows = rows.filter((s) => !s.jll).concat(rows.filter((s) => s.jll));
    }
    return rows;
  }

  // ---------- rendering ----------
  const corner = $("corner"), header = $("header"), labels = $("labels"), chart = $("chart");
  const textW = (s, px) => s.length * px * 0.58;

  function updateColumnWidth() {
    if (state.density === "fit") {
      const avail = $("matrix-scroll").clientWidth - LABEL_W;
      COL_W = Math.max(MIN_COL_W, Math.floor(avail / NCOL));
    } else {
      COL_W = DENSITY_W[state.density];
    }
  }

  function renderHeader() {
    header.innerHTML = "";
    corner.innerHTML = "";
    const W = NCOL * COL_W;

    // Minor-series labels ("1.x"; the corner cell says these are Julia versions). Labels that
    // would overlap a neighbour drop to a second tier; if that is taken too, they
    // are left out (the column tooltip still names the release).
    const short = COL_W < 56;
    const font = short ? 11 : 12;
    const tiers = [[], []];
    const placed = groups.map((g) => {
      const x = g.start * COL_W, w = (g.end - g.start + 1) * COL_W;
      const text = g.minor;
      const lw = textW(text, font) + 6;
      const cx = x + w / 2;
      const span = [cx - lw / 2, cx + lw / 2];
      let tier = -1;
      for (let t = 0; t < tiers.length && tier < 0; t++) {
        const last = tiers[t][tiers[t].length - 1];
        if (!last || last[1] <= span[0]) { tiers[t].push(span); tier = t; }
      }
      return { g, x, w, text, cx, tier };
    });
    const twoTier = placed.some((p) => p.tier === 1);
    const groupH = twoTier ? GROUP_H + 13 : GROUP_H;
    const headerH = groupH + 24;
    header.setAttribute("width", W);
    header.setAttribute("height", headerH);
    corner.setAttribute("width", LABEL_W);
    corner.setAttribute("height", headerH);
    // Axis names in the corner: the column axis on the band row, the row axis under it.
    el("text", { x: LABEL_W - 10, y: 14, "text-anchor": "end", class: "group-label" }, corner).textContent = "julia version";
    el("text", { x: 16, y: headerH - 8, class: "group-label" }, corner).textContent = "stdlib";

    placed.forEach((p, gi) => {
      el("rect", { x: p.x, y: 0, width: p.w, height: groupH, class: "hdr-band" + (gi % 2 ? " alt" : "") }, header);
      if (p.tier >= 0) {
        const t = el("text", { x: p.cx, y: 14 + p.tier * 13, "text-anchor": "middle", class: "hdr-group", "font-size": font }, header);
        t.textContent = p.text;
      }
      el("line", { x1: p.x + 0.5, y1: 0, x2: p.x + 0.5, y2: headerH, class: "col-sep" }, header);
    });
    el("line", { x1: 0, y1: headerH - 0.5, x2: W, y2: headerH - 0.5, class: "hdr-underline" }, header);

    versions.forEach((v, i) => {
      const x = i * COL_W;
      if (state.release === i) el("rect", { x, y: groupH, width: COL_W, height: headerH - groupH, class: "hdr-sel" }, header);
      const t = el("text", { x: x + COL_W / 2, y: headerH - 8, "text-anchor": "middle", class: "hdr-col" + (state.release === i ? " selected" : "") }, header);
      // Narrow columns only have room for the patch number; the band above names the minor series.
      t.textContent = short ? "." + v.split(".")[2] : v;
      const hit = el("rect", { x, y: 0, width: COL_W, height: headerH, class: "hdr-hit" }, header);
      hit.addEventListener("click", () => selectRelease(state.release === i ? null : i));
      hit.addEventListener("mouseenter", (ev) => showTip(ev, releaseTip(i)));
      hit.addEventListener("mousemove", moveTip);
      hit.addEventListener("mouseleave", hideTip);
    });
  }

  // Colours resolved from the active theme, read once per render.
  function readTheme() {
    const cs = getComputedStyle(document.documentElement);
    const get = (n) => cs.getPropertyValue(n).trim();
    return {
      ramp: Array.from({ length: RAMP_STEPS }, (_, k) => get("--r" + k)),
      unversioned: get("--unversioned"),
      unversionedInk: get("--unversioned-ink"),
      inkDark: get("--ramp-ink-light"),
      inkLight: get("--ramp-ink-dark"),
    };
  }
  let theme = null;
  const luminance = (hex) => {
    const c = hex.replace("#", "");
    const [r, g, b] = [0, 2, 4].map((i) => {
      const v = parseInt(c.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  // Whichever of the two inks reads better on this background.
  function inkFor(bg) {
    const l = luminance(bg);
    return contrast(l, luminance(theme.inkLight)) >= contrast(l, luminance(theme.inkDark)) ? theme.inkLight : theme.inkDark;
  }

  function renderRows(rows) {
    labels.innerHTML = "";
    chart.innerHTML = "";
    theme = readTheme();
    const H = Math.max(rows.length * ROW_H, ROW_H);
    const W = NCOL * COL_W;
    labels.setAttribute("width", LABEL_W);
    labels.setAttribute("height", H);
    chart.setAttribute("width", W);
    chart.setAttribute("height", H);

    const selected = state.stdlib ? byName.get(state.stdlib) : null;
    const selCol = state.release !== null ? state.release : (selected ? selected.lastCol : null);
    const depSet = new Set();
    if (selected && selCol !== null && selected.entries[selCol]) {
      selected.entries[selCol].d.forEach((n) => depSet.add(n));
      selected.entries[selCol].w.forEach((n) => depSet.add(n));
    }

    // Hatch overlay marks upgradable stdlibs (shipped with Julia, resolved from the registry).
    const defs = el("defs", {}, chart);
    const pat = el("pattern", { id: "hatch", width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, defs);
    el("line", { x1: 0, y1: 0, x2: 0, y2: 6, class: "hatch-line" }, pat);

    // Background: row bands, group separators, selected column wash.
    const bg = el("g", {}, chart);
    rows.forEach((s, r) => {
      if (r % 2 === 1) el("rect", { x: 0, y: r * ROW_H, width: W, height: ROW_H, class: "row-band" }, bg);
    });
    groups.forEach((g) => el("line", { x1: g.start * COL_W + 0.5, y1: 0, x2: g.start * COL_W + 0.5, y2: H, class: "col-sep" }, bg));
    if (state.release !== null) {
      el("rect", { x: state.release * COL_W, y: 0, width: COL_W, height: H, class: "col-sel" }, bg);
    }

    const fg = el("g", {}, chart);
    let prevJll = null;
    rows.forEach((s, r) => {
      const y = r * ROW_H;

      // Row label
      const isSel = s.name === state.stdlib;
      const hit = el("rect", { x: 0, y, width: LABEL_W, height: ROW_H, class: "row-hit" + (isSel ? " selected" : "") }, labels);
      hit.addEventListener("click", () => selectStdlib(isSel ? null : s.name));
      hit.addEventListener("mouseenter", (ev) => showTip(ev, stdlibTip(s)));
      hit.addEventListener("mousemove", moveTip);
      hit.addEventListener("mouseleave", hideTip);
      const t = el("text", { x: 16, y: y + ROW_H / 2 + 4.5, class: "row-label" + (s.jll ? " jll" : "") + (isSel ? " selected" : ""), "pointer-events": "none" }, labels);
      t.textContent = s.name;
      if (!s.registered) {
        el("line", { x1: 16, y1: y + ROW_H / 2 + 8.5, x2: 16 + Math.min(textW(s.name, 12.5), LABEL_W - 40), y2: y + ROW_H / 2 + 8.5, stroke: "var(--muted)", "stroke-width": 1, "stroke-dasharray": "1.5 2.5", "pointer-events": "none" }, labels);
      }
      if (depSet.has(s.name)) {
        el("text", { x: LABEL_W - 12, y: y + ROW_H / 2 + 4, "text-anchor": "end", class: "dep-badge", "pointer-events": "none" }, labels).textContent = "dep";
      }
      if (state.kind === "all" && state.sort === "name" && prevJll === false && s.jll) {
        el("line", { x1: 0, y1: y + 0.5, x2: LABEL_W, y2: y + 0.5, class: "hdr-underline" }, labels);
        el("line", { x1: 0, y1: y + 0.5, x2: W, y2: y + 0.5, class: "hdr-underline" }, bg);
      }
      prevJll = s.jll;

      // Runs
      for (const run of s.runs) {
        const x = run.start * COL_W + 1;
        const w = (run.end - run.start + 1) * COL_W - 2;
        const cls = run.v === null ? "run unversioned" : "run r" + run.ramp;
        el("rect", { x, y: y + BAR_PAD, width: w, height: ROW_H - BAR_PAD * 2, class: cls }, fg);
        if (run.u) el("rect", { x, y: y + BAR_PAD, width: w, height: ROW_H - BAR_PAD * 2, class: "run-hatch", fill: "url(#hatch)" }, fg);
        const label = run.v === null ? "–" : run.v;
        const fontPx = COL_W < 48 ? 10.5 : 11.5;
        if (textW(label, fontPx) + 8 <= w) {
          // Ink is chosen per bar from the bar colour's contrast, and the label wears a halo
          // in that colour so the hatch on upgradable bars does not cut through the digits.
          const bg = run.v === null ? theme.unversioned : theme.ramp[run.ramp];
          const ink = run.v === null ? theme.unversionedInk : inkFor(bg);
          const tl = el("text", { x: x + w / 2, y: y + ROW_H / 2 + 4, "text-anchor": "middle", class: "run-label", "font-size": fontPx, fill: ink, stroke: bg }, fg);
          tl.textContent = label;
        }
        const outline = el("rect", { x: x + 0.5, y: y + BAR_PAD + 0.5, width: w - 1, height: ROW_H - BAR_PAD * 2 - 1, class: "run-outline" }, fg);
        const rh = el("rect", { x, y, width: w, height: ROW_H, class: "run-hit" }, fg);
        fg.insertBefore(rh, outline);
        rh.addEventListener("mouseenter", (ev) => { outline.classList.add("hover"); showTip(ev, runTip(s, run, colAt(ev))); });
        rh.addEventListener("mousemove", (ev) => { moveTip(ev); setTipHTML(runTip(s, run, colAt(ev))); });
        rh.addEventListener("mouseleave", () => { outline.classList.remove("hover"); hideTip(); });
        rh.addEventListener("click", (ev) => selectRelease(colAt(ev)));
      }
    });

    if (state.release !== null) {
      el("rect", { x: state.release * COL_W + 0.75, y: 0.75, width: COL_W - 1.5, height: H - 1.5, class: "col-sel-outline" }, chart);
    }

    if (rows.length === 0) {
      el("text", { x: 16, y: 18, class: "empty-svg", fill: "var(--muted)", "font-size": 13 }, labels).textContent = "No stdlibs match.";
    }
  }

  function colAt(ev) {
    const rect = chart.getBoundingClientRect();
    return Math.max(0, Math.min(NCOL - 1, Math.floor((ev.clientX - rect.left) / COL_W)));
  }

  // ---------- tooltip ----------
  const tip = $("tooltip");
  let tipHTML = "";
  function setTipHTML(html) { if (html !== tipHTML) { tipHTML = html; tip.innerHTML = html; } }
  function showTip(ev, html) { setTipHTML(html); tip.hidden = false; moveTip(ev); }
  function hideTip() { tip.hidden = true; tipHTML = ""; }
  function moveTip(ev) {
    const pad = 14;
    const w = tip.offsetWidth, hgt = tip.offsetHeight;
    let x = ev.clientX + pad, y = ev.clientY + pad;
    if (x + w > window.innerWidth - 8) x = ev.clientX - w - pad;
    if (y + hgt > window.innerHeight - 8) y = ev.clientY - hgt - pad;
    tip.style.left = x + "px";
    tip.style.top = y + "px";
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const releaseRange = (start, end) => {
    const a = versions[start], b = versions[end];
    if (start === end) return "Julia " + a;
    return "Julia " + a + " – " + b;
  };
  const untilNext = (end) => (end + 1 < NCOL ? " (through releases before " + versions[end + 1] + ")" : " (latest tracked)");

  function runTip(s, run, col) {
    const e = s.entries[col];
    const n = run.end - run.start + 1;
    let html = "<b>" + esc(s.name) + "</b> in Julia " + esc(versions[col]) + "<br>";
    html += '<span class="tt-ver">' + (run.v === null ? "unversioned" : esc(run.v)) + "</span><br>";
    html += '<span class="tt-sub">' + esc(releaseRange(run.start, run.end)) + (n > 1 ? " · " + n + " tracked releases" : "") + esc(untilNext(run.end)) + "</span>";
    if (e && e.u) html += '<div class="tt-deps">ships with Julia, upgradable from the General registry</div>';
    if (e) {
      if (e.d.length) html += '<div class="tt-deps">deps: ' + esc(e.d.join(", ")) + "</div>";
      if (e.w.length) html += '<div class="tt-deps">weakdeps: ' + esc(e.w.join(", ")) + "</div>";
    }
    if (!s.registered) html += '<div class="tt-deps">never registered in General</div>';
    return html;
  }
  function releaseTip(i) {
    const d = diffs[i];
    const n = stdlibs.filter((s) => s.entries[i]).length;
    let html = "<b>Julia " + esc(versions[i]) + "</b> · " + n + " stdlibs<br>";
    if (i === 0) html += '<span class="tt-sub">first tracked release</span>';
    else html += '<span class="tt-sub">vs ' + esc(versions[i - 1]) + ": +" + d.added.length + " / −" + d.removed.length + " / " + d.bumped.length + " bumped</span>";
    html += '<div class="tt-deps">click to see what changed</div>';
    return html;
  }
  function stdlibTip(s) {
    let html = "<b>" + esc(s.name) + "</b><br>";
    html += '<span class="tt-sub">' + esc(releaseRange(s.firstCol, s.lastCol)) + (s.removed ? " · removed after " + esc(versions[s.lastCol]) : "") + "</span><br>";
    html += '<span class="tt-sub">' + s.bumps + " version bump" + (s.bumps === 1 ? "" : "s") + (s.registered ? "" : " · never registered") + "</span>";
    html += '<div class="tt-deps">click for full history</div>';
    return html;
  }

  // ---------- details panel ----------
  const panel = $("panel"), panelTitle = $("panel-title"), panelBody = $("panel-body");

  function chip(s, extra, cls, onClick) {
    const c = h("button", "chip" + (cls ? " " + cls : ""));
    c.type = "button";
    if (cls) c.appendChild(h("span", "dot"));
    c.appendChild(h("span", null, s.name));
    if (extra) c.appendChild(extra);
    c.addEventListener("click", onClick || (() => selectStdlib(s.name)));
    return c;
  }
  const verSpan = (from, to) => {
    const sp = h("span", "v");
    sp.append((from === null ? "–" : from), " ");
    sp.appendChild(h("span", "arrow", "→"));
    sp.append(" ", (to === null ? "–" : to));
    return sp;
  };

  function renderPanel() {
    panelBody.innerHTML = "";
    if (state.stdlib) {
      const s = byName.get(state.stdlib);
      panelTitle.textContent = s.name;
      const meta = h("p", "meta-line");
      meta.append(s.jll ? "JLL binary wrapper" : "Standard library", " · ");
      meta.append(releaseRange(s.firstCol, s.lastCol), s.removed ? " (removed after " + versions[s.lastCol] + ")" : "");
      meta.append(" · ", s.registered ? "registered in General" : "never registered (always treated as a stdlib)");
      meta.append(" · uuid ");
      meta.appendChild(h("code", null, s.uuid));
      panelBody.appendChild(meta);

      const cols = h("div", "cols-2");
      const left = h("div"), right = h("div");
      cols.append(left, right);
      panelBody.appendChild(cols);

      left.appendChild(h("h3", null, "Version history"));
      const hist = h("div", "hist");
      s.runs.forEach((run) => {
        const hv = h("div", "hv");
        const sw = h("span", "swatch");
        sw.style.background = run.v === null ? "var(--unversioned)" : "var(--r" + run.ramp + ")";
        hv.appendChild(sw);
        hv.append(run.v === null ? "unversioned" : run.v);
        if (run.u) hv.appendChild(h("span", "hu", "upgradable"));
        const hr = h("div", "hr", releaseRange(run.start, run.end) + untilNext(run.end));
        hist.append(hv, hr);
      });
      left.appendChild(hist);

      const col = state.release !== null && s.entries[state.release] ? state.release : s.lastCol;
      const e = s.entries[col];
      right.appendChild(h("h3", null, "Depends on (Julia " + versions[col] + ")"));
      const dl = h("div", "chips");
      e.d.forEach((n) => dl.appendChild(chip(byName.get(n))));
      e.w.forEach((n) => { const c = chip(byName.get(n)); c.appendChild(h("span", "v", "weak")); dl.appendChild(c); });
      if (!e.d.length && !e.w.length) dl.appendChild(h("span", "empty", "No stdlib dependencies."));
      right.appendChild(dl);

      right.appendChild(h("h3", null, "Depended on by (Julia " + versions[col] + ")"));
      const rl = h("div", "chips");
      const deps = dependents(s.name, col);
      deps.forEach((d) => {
        const c = chip(d);
        if (d.entries[col].w.includes(s.name)) c.appendChild(h("span", "v", "weak"));
        rl.appendChild(c);
      });
      if (!deps.length) rl.appendChild(h("span", "empty", "Nothing depends on it."));
      right.appendChild(rl);
    } else if (state.release !== null) {
      const i = state.release, d = diffs[i];
      panelTitle.textContent = "Julia " + versions[i];
      const n = stdlibs.filter((s) => s.entries[i]).length;
      const meta = h("p", "meta-line");
      meta.append(n + " stdlibs. ");
      if (i === 0) meta.append("First tracked release.");
      else meta.append("Changes relative to Julia " + versions[i - 1] + ", the previous tracked release.");
      if (i + 1 < NCOL) meta.append(" Releases up to but not including " + versions[i + 1] + " share this stdlib set.");
      panelBody.appendChild(meta);

      const section = (title, items, build) => {
        panelBody.appendChild(h("h3", null, title + " (" + items.length + ")"));
        const wrap = h("div", "chips");
        if (!items.length) wrap.appendChild(h("span", "empty", "None."));
        items.forEach((it) => wrap.appendChild(build(it)));
        panelBody.appendChild(wrap);
      };
      section("Version bumps", d.bumped, (b) => chip(b.s, verSpan(b.from, b.to), "bumped"));
      section("Added", d.added, (s) => chip(s, h("span", "v", s.entries[i].v === null ? "" : s.entries[i].v), "added"));
      section("Removed", d.removed, (s) => chip(s, null, "removed"));
      if (d.upgradable.length) {
        section("Upgradability changed", d.upgradable, (b) => chip(b.s, h("span", "v", b.now ? "now upgradable from General" : "no longer upgradable"), "bumped"));
      }
    } else {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
  }

  // ---------- table view ----------
  function renderTable(rows) {
    const tv = $("table-view");
    tv.innerHTML = "";
    const table = h("table");
    const thead = h("thead"), tr = h("tr");
    tr.appendChild(h("th", null, "stdlib"));
    versions.forEach((v) => tr.appendChild(h("th", null, v)));
    thead.appendChild(tr);
    table.appendChild(thead);
    const tbody = h("tbody");
    rows.forEach((s) => {
      const r = h("tr");
      r.appendChild(h("th", null, s.name));
      s.entries.forEach((e, i) => {
        const prev = s.entries[i - 1];
        let td;
        if (!e) td = h("td", "absent", "·");
        else if (e.v === null) td = h("td", "unversioned", "–");
        else td = h("td", prev && prev.v !== e.v ? "changed" : null, e.v);
        if (e && e.u) { td.classList.add("upgradable"); td.title = "ships with Julia, upgradable from General"; }
        r.appendChild(td);
      });
      tbody.appendChild(r);
    });
    table.appendChild(tbody);
    tv.appendChild(table);
  }

  // ---------- dependency graph ----------
  // Laid out once over the union of every release's edges, so a stdlib keeps its place
  // while the slider moves and only appears, disappears, or gains and loses edges.
  const graphSvg = $("graph");
  // The gap between ranks flexes between these bounds so the graph fits the viewport height.
  const RANK_GAP_MIN = 22, RANK_GAP_MAX = 64, NODE_H = 20, LINE_GAP = 5, XGAP = 8, GPAD = 12;
  let graph = null;

  function buildGraphLayout() {
    const edgeKeys = new Map();
    for (const s of stdlibs) for (const e of s.entries) {
      if (!e) continue;
      for (const d of e.d) edgeKeys.set(d + "|" + s.name, { from: d, to: s.name, weak: false });
      for (const d of e.w) if (!edgeKeys.has(d + "|" + s.name)) edgeKeys.set(d + "|" + s.name, { from: d, to: s.name, weak: true });
    }
    const edges = [...edgeKeys.values()];
    // Rank is the longest chain of dependencies below a node; leaves are rank 0, drawn at the bottom.
    const depsOf = new Map(stdlibs.map((s) => [s.name, []]));
    edges.forEach((e) => depsOf.get(e.to).push(e.from));
    const rank = new Map(), visiting = new Set();
    const rankOf = (n) => {
      if (rank.has(n)) return rank.get(n);
      if (visiting.has(n)) return 0;
      visiting.add(n);
      const r = depsOf.get(n).reduce((m, d) => Math.max(m, rankOf(d) + 1), 0);
      visiting.delete(n);
      rank.set(n, r);
      return r;
    };
    stdlibs.forEach((s) => rankOf(s.name));
    const layers = Array.from({ length: Math.max(...rank.values()) + 1 }, () => []);
    stdlibs.forEach((s) => layers[rank.get(s.name)].push(s.name));
    // Each rank is a band of pills packed left to right and wrapped at the card width, with
    // leaves at the bottom. Ranks are ordered by their neighbours' horizontal positions over a
    // few sweeps to reduce crossings.
    const width = Math.max(600, graphSvg.parentElement.clientWidth) - GPAD * 2;
    const pillW = (n) => Math.ceil(textW(n, 12)) + 14;
    const nbrs = new Map(stdlibs.map((s) => [s.name, []]));
    edges.forEach((e) => { nbrs.get(e.from).push(e.to); nbrs.get(e.to).push(e.from); });
    const cx = new Map();
    const pack = (l) => {
      const rows = [[]];
      let x = 0;
      for (const n of l) {
        if (x + pillW(n) > width && rows[rows.length - 1].length) { rows.push([]); x = 0; }
        rows[rows.length - 1].push(n);
        x += pillW(n) + XGAP;
      }
      for (const row of rows) {
        const total = row.reduce((a, n) => a + pillW(n), 0) + XGAP * (row.length - 1);
        let xx = (width - total) / 2;
        for (const n of row) { cx.set(n, xx + pillW(n) / 2); xx += pillW(n) + XGAP; }
      }
      return rows;
    };
    layers.forEach((l) => pack(l.sort()));
    for (let sweep = 0; sweep < 8; sweep++) {
      for (const l of (sweep % 2 ? [...layers].reverse() : layers)) {
        const bc = new Map(l.map((n) => {
          const ns = nbrs.get(n);
          return [n, ns.length ? ns.reduce((a, m) => a + cx.get(m), 0) / ns.length : cx.get(n)];
        }));
        l.sort((a, b) => bc.get(a) - bc.get(b) || a.localeCompare(b));
        pack(l);
      }
    }
    const rowsByLayer = layers.map(pack);
    // Spread the ranks over whatever height is left below the graph's top edge in the viewport.
    const nRows = rowsByLayer.reduce((a, rows) => a + rows.length, 0);
    const top = graphSvg.parentElement.getBoundingClientRect().top + window.scrollY;
    const avail = window.innerHeight - top - 64 - GPAD * 2;
    const rankGap = Math.max(RANK_GAP_MIN, Math.min(RANK_GAP_MAX,
      (avail - nRows * NODE_H - (nRows - layers.length) * LINE_GAP) / Math.max(1, layers.length - 1)));
    const geom = new Map();
    let y = GPAD;
    for (let r = layers.length - 1; r >= 0; r--) {
      for (const row of rowsByLayer[r]) {
        for (const n of row) geom.set(n, { x: GPAD + cx.get(n) - pillW(n) / 2, y, w: pillW(n) });
        y += NODE_H + LINE_GAP;
      }
      y += rankGap - LINE_GAP;
    }
    return { edges, geom, W: width + GPAD * 2, H: y - rankGap + LINE_GAP + GPAD };
  }

  function buildGraphDom() {
    graph = buildGraphLayout();
    graphSvg.innerHTML = "";
    graphSvg.setAttribute("viewBox", "0 0 " + graph.W + " " + graph.H);
    const defs = el("defs", {}, graphSvg);
    const pat = el("pattern", { id: "ghatch", width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, defs);
    el("line", { x1: 0, y1: 0, x2: 0, y2: 6, class: "hatch-line" }, pat);
    const marker = el("marker", { id: "arrow", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: "auto" }, defs);
    el("path", { d: "M0 0L10 5 0 10z", class: "arrow-head" }, marker);
    const eg = el("g", {}, graphSvg), ng = el("g", {}, graphSvg);
    graph.edgeEls = graph.edges.map((e) => {
      // From the top of the dependency up to the bottom of the stdlib that depends on it.
      const a = graph.geom.get(e.from), b = graph.geom.get(e.to);
      const x1 = a.x + a.w / 2, y1 = a.y, x2 = b.x + b.w / 2, y2 = b.y + NODE_H, my = (y1 + y2) / 2;
      return el("path", { d: "M" + x1 + " " + y1 + " C" + x1 + " " + my + " " + x2 + " " + my + " " + x2 + " " + y2, class: "edge" + (e.weak ? " weak" : ""), "marker-end": "url(#arrow)" }, eg);
    });
    graph.nodeEls = new Map();
    for (const s of stdlibs) {
      const p = graph.geom.get(s.name);
      const g = el("g", { class: "node", transform: "translate(" + p.x + "," + p.y + ")" }, ng);
      el("rect", { width: p.w, height: NODE_H, rx: 10, ry: 10, class: "node-bg" + (s.registered ? "" : " unregistered") }, g);
      el("rect", { width: p.w, height: NODE_H, rx: 10, ry: 10, class: "node-hatch", fill: "url(#ghatch)" }, g);
      el("text", { x: p.w / 2, y: NODE_H / 2 + 4, "text-anchor": "middle", class: "node-label" }, g).textContent = s.name;
      g.addEventListener("mouseenter", (ev) => { focusGraph(s.name); showTip(ev, graphTip(s)); });
      g.addEventListener("mousemove", moveTip);
      g.addEventListener("mouseleave", () => { focusGraph(null); hideTip(); });
      g.addEventListener("click", () => selectStdlib(s.name));
      graph.nodeEls.set(s.name, g);
    }
  }

  const graphCol = () => (state.release !== null ? state.release : NCOL - 1);

  function updateGraph() {
    if (!graph) buildGraphDom();
    theme = readTheme();
    const col = graphCol();
    const visible = new Set(visibleRows().map((s) => s.name));
    const shown = new Set();
    for (const s of stdlibs) {
      const e = s.entries[col];
      const g = graph.nodeEls.get(s.name);
      const on = !!e && visible.has(s.name);
      g.classList.toggle("off", !on);
      if (!on) continue;
      shown.add(s.name);
      const run = s.runs.find((r) => r.start <= col && col <= r.end);
      const bg = run.v === null ? theme.unversioned : theme.ramp[run.ramp];
      g.querySelector(".node-bg").setAttribute("fill", bg);
      g.querySelector(".node-hatch").style.display = e.u ? "" : "none";
      const t = g.querySelector(".node-label");
      t.setAttribute("fill", run.v === null ? theme.unversionedInk : inkFor(bg));
      t.setAttribute("stroke", bg);
    }
    graph.edges.forEach((e, i) => {
      const t = byName.get(e.to).entries[col];
      const on = shown.has(e.from) && shown.has(e.to) && !!t && (t.d.includes(e.from) || t.w.includes(e.from));
      graph.edgeEls[i].classList.toggle("off", !on);
    });
    $("release-slider").max = NCOL - 1;
    $("release-slider").value = col;
    $("slider-release").textContent = "Julia " + versions[col];
    const d = diffs[col];
    $("slider-delta").textContent = col === 0
      ? "first tracked release"
      : "+" + d.added.length + " −" + d.removed.length + " · " + d.bumped.length + " bumped since " + versions[col - 1];
    $("release-prev").disabled = col === 0;
    $("release-next").disabled = col === NCOL - 1;
    focusGraph(null);
  }

  // Light up a node's full upstream and downstream chains at the current release.
  function focusGraph(name) {
    if (!name) {
      graphSvg.classList.remove("focus");
      graphSvg.querySelectorAll(".lit").forEach((n) => n.classList.remove("lit"));
      return;
    }
    const col = graphCol();
    const up = new Set(), down = new Set();
    const walkUp = (n) => {
      const e = byName.get(n).entries[col];
      if (e) for (const d of e.d.concat(e.w)) if (!up.has(d)) { up.add(d); walkUp(d); }
    };
    const walkDown = (n) => {
      for (const s of stdlibs) {
        const e = s.entries[col];
        if (e && (e.d.includes(n) || e.w.includes(n)) && !down.has(s.name)) { down.add(s.name); walkDown(s.name); }
      }
    };
    walkUp(name);
    walkDown(name);
    graphSvg.classList.add("focus");
    graph.nodeEls.forEach((g, n) => g.classList.toggle("lit", n === name || up.has(n) || down.has(n)));
    // An edge is part of the chain if it feeds the node from upstream or leads from it downstream.
    const chain = (a, b) => (up.has(a) && (b === name || up.has(b))) || (down.has(b) && (a === name || down.has(a)));
    graph.edges.forEach((e, i) => graph.edgeEls[i].classList.toggle("lit", chain(e.from, e.to)));
  }

  function graphTip(s) {
    const col = graphCol();
    const e = s.entries[col];
    if (!e) return "<b>" + esc(s.name) + "</b>";
    const dependents = stdlibs.filter((t) => { const x = t.entries[col]; return x && (x.d.includes(s.name) || x.w.includes(s.name)); }).length;
    let html = "<b>" + esc(s.name) + "</b> in Julia " + esc(versions[col]) + "<br>";
    html += '<span class="tt-ver">' + (e.v === null ? "unversioned" : esc(e.v)) + "</span><br>";
    html += '<span class="tt-sub">depends on ' + (e.d.length + e.w.length) + " · depended on by " + dependents + "</span>";
    if (e.u) html += '<div class="tt-deps">ships with Julia, upgradable from the General registry</div>';
    html += '<div class="tt-deps">click for details</div>';
    return html;
  }

  function setGraphRelease(i) {
    state.release = Math.max(0, Math.min(NCOL - 1, i));
    render();
  }
  $("release-slider").addEventListener("input", (ev) => setGraphRelease(+ev.target.value));
  $("release-prev").addEventListener("click", () => setGraphRelease(graphCol() - 1));
  $("release-next").addEventListener("click", () => setGraphRelease(graphCol() + 1));
  document.addEventListener("keydown", (ev) => {
    if (state.view !== "graph" || /INPUT|SELECT|TEXTAREA/.test(ev.target.tagName)) return;
    if (ev.key === "ArrowLeft") { setGraphRelease(graphCol() - 1); ev.preventDefault(); }
    if (ev.key === "ArrowRight") { setGraphRelease(graphCol() + 1); ev.preventDefault(); }
  });

  // ---------- top-level ----------
  function render() {
    const rows = visibleRows();
    $("matrix-scroll").hidden = state.view !== "chart";
    $("table-view").hidden = state.view !== "table";
    $("graph-view").hidden = state.view !== "graph";
    document.body.classList.toggle("view-graph", state.view === "graph");
    document.body.dataset.view = state.view;
    if (state.view === "chart") {
      updateColumnWidth();
      renderHeader();
      renderRows(rows);
      const sc = $("matrix-scroll");
      sc.classList.toggle("overflowing", LABEL_W + NCOL * COL_W > sc.clientWidth);
    } else if (state.view === "table") {
      renderTable(rows);
    } else {
      updateGraph();
    }
    renderPanel();
    writeHash();
  }

  function selectRelease(i) {
    state.release = i;
    if (i !== null) state.stdlib = null;
    render();
    if (i !== null) scrollColumnIntoView(i);
  }
  function selectStdlib(name) {
    state.stdlib = name;
    if (name) { state.release = null; state.onlyChanged = false; $("only-changed").checked = false; }
    render();
    if (name) panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  function scrollColumnIntoView(i) {
    const sc = $("matrix-scroll");
    const x = LABEL_W + i * COL_W;
    if (x < sc.scrollLeft + LABEL_W || x + COL_W > sc.scrollLeft + sc.clientWidth) {
      sc.scrollTo({ left: Math.max(0, x - sc.clientWidth / 2), behavior: "smooth" });
    }
  }

  // Shareable state in the URL hash: #release=1.6.0 or #stdlib=Pkg
  function writeHash() {
    let hsh = "";
    if (state.stdlib) hsh = "#stdlib=" + encodeURIComponent(state.stdlib);
    else if (state.release !== null) hsh = "#release=" + versions[state.release];
    if (hsh !== location.hash) history.replaceState(null, "", hsh || location.pathname + location.search);
  }
  function readHash() {
    const m = /^#(stdlib|release)=(.+)$/.exec(location.hash);
    if (!m) return;
    const val = decodeURIComponent(m[2]);
    if (m[1] === "stdlib" && byName.has(val)) state.stdlib = val;
    if (m[1] === "release" && versions.includes(val)) state.release = versions.indexOf(val);
  }

  // ---------- KPIs and footer ----------
  function renderMeta() {
    const meta = [];
    if (DATA.package_version) meta.push("HistoricalStdlibVersions v" + DATA.package_version);
    if (DATA.data_updated) meta.push("data updated " + DATA.data_updated);
    if (DATA.commit) meta.push("commit " + DATA.commit);
    $("foot-meta").textContent = meta.join(" · ");
  }

  // ---------- controls ----------
  $("search").addEventListener("input", (ev) => { state.query = ev.target.value; render(); });
  document.querySelectorAll(".seg [data-kind]").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll(".seg [data-kind]").forEach((x) => x.classList.toggle("on", x === b));
    state.kind = b.dataset.kind;
    render();
  }));
  document.querySelectorAll(".seg [data-view]").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll(".seg [data-view]").forEach((x) => x.classList.toggle("on", x === b));
    state.view = b.dataset.view;
    render();
  }));
  document.querySelectorAll(".seg [data-density]").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll(".seg [data-density]").forEach((x) => x.classList.toggle("on", x === b));
    state.density = b.dataset.density;
    try { localStorage.setItem("hsv-density", state.density); } catch (_) { /* ignore */ }
    render();
  }));
  try {
    const d = localStorage.getItem("hsv-density");
    if (d && (d === "fit" || DENSITY_W[d])) {
      state.density = d;
      document.querySelectorAll(".seg [data-density]").forEach((x) => x.classList.toggle("on", x.dataset.density === d));
    }
  } catch (_) { /* storage unavailable */ }
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (state.view === "graph") { graph = null; render(); }
      else if (state.view === "chart" && state.density === "fit") render();
    }, 120);
  });
  $("sort").addEventListener("change", (ev) => { state.sort = ev.target.value; render(); });
  $("only-changed").addEventListener("change", (ev) => {
    state.onlyChanged = ev.target.checked;
    if (state.onlyChanged && state.release === null) {
      state.release = NCOL - 1;
      state.stdlib = null;
    }
    render();
  });
  $("panel-close").addEventListener("click", () => { state.stdlib = null; state.release = null; state.onlyChanged = false; $("only-changed").checked = false; render(); });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && !panel.hidden) $("panel-close").click();
  });
  window.addEventListener("hashchange", () => { state.stdlib = null; state.release = null; readHash(); render(); });

  // Theme toggle: explicit choice wins over the OS setting and is remembered per browser.
  const root = document.documentElement;
  function applyTheme(t) {
    if (t) root.setAttribute("data-theme", t); else root.removeAttribute("data-theme");
  }
  try { applyTheme(localStorage.getItem("hsv-theme")); } catch (_) { /* storage unavailable */ }
  $("theme-toggle").addEventListener("click", () => {
    const dark = root.getAttribute("data-theme") === "dark" ||
      (!root.getAttribute("data-theme") && window.matchMedia("(prefers-color-scheme: dark)").matches);
    const next = dark ? "light" : "dark";
    applyTheme(next);
    try { localStorage.setItem("hsv-theme", next); } catch (_) { /* ignore */ }
    render();
  });

  readHash();
  renderMeta();
  render();
  if (state.release !== null) requestAnimationFrame(() => scrollColumnIntoView(state.release));
})();
