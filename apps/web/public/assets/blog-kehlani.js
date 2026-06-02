(function () {
  const root = document.querySelector("[data-kehlani-visuals]");
  if (!root || typeof d3 === "undefined") return;

  const colors = {
    kehlani: "#a6382a",
    khaleesi: "#465d75",
    nevaeh: "#a96720",
    leilani: "#22745d",
    kailani: "#6fa58e",
    aaliyah: "#9270a7",
    kalani: "#6d6f7c",
  };

  const series = {
    Kehlani: [
      [2015, 50],
      [2016, 325],
      [2017, 598],
      [2018, 914],
      [2019, 1311],
      [2020, 1713],
      [2021, 1877],
      [2022, 1875],
      [2023, 1864],
      [2024, 1973],
      [2025, 1981],
    ],
    Khaleesi: [
      [2011, 28],
      [2012, 147],
      [2013, 243],
      [2014, 369],
      [2015, 342],
      [2016, 378],
      [2017, 470],
      [2018, 565],
      [2019, 524],
      [2020, 373],
      [2021, 411],
      [2022, 444],
      [2023, 399],
      [2024, 434],
      [2025, 410],
    ],
    Nevaeh: [
      [2010, 6446],
      [2011, 5791],
      [2012, 5322],
      [2013, 4764],
      [2014, 4376],
      [2015, 4028],
      [2016, 3825],
      [2017, 3623],
      [2018, 3410],
      [2019, 3127],
      [2020, 3132],
      [2021, 3071],
      [2022, 2808],
      [2023, 2342],
      [2024, 2200],
      [2025, 1828],
    ],
    Leilani: [
      [2010, 1240],
      [2011, 1384],
      [2012, 1432],
      [2013, 1530],
      [2014, 1687],
      [2015, 1807],
      [2016, 1971],
      [2017, 2284],
      [2018, 2519],
      [2019, 2703],
      [2020, 2892],
      [2021, 3485],
      [2022, 3868],
      [2023, 3562],
      [2024, 3365],
      [2025, 3792],
    ],
  };

  const soundFamily = [
    { name: "Leilani", count: 3792, color: colors.leilani },
    { name: "Aaliyah", count: 2607, color: colors.aaliyah },
    { name: "Kehlani", count: 1981, color: colors.kehlani },
    { name: "Kailani", count: 1215, color: colors.kailani },
    { name: "Kalani", count: 800, color: colors.kalani },
  ];

  function asPoints(rows) {
    return rows.map(([year, count]) => ({ year, count }));
  }

  const tooltip = d3
    .select(document.body)
    .append("div")
    .attr("class", "kehlani-tooltip")
    .style("position", "fixed")
    .style("z-index", "20")
    .style("pointer-events", "none")
    .style("opacity", "0")
    .style("background", "var(--ink)")
    .style("color", "var(--paper)")
    .style("border", "1px solid var(--rule)")
    .style("border-radius", "6px")
    .style("padding", "0.45rem 0.6rem")
    .style("font", "0.78rem var(--mono)")
    .style("box-shadow", "var(--shadow)");

  function showTip(event, rows) {
    tooltip
      .html(rows.join("<br>"))
      .style("left", `${Math.min(event.clientX + 12, window.innerWidth - 220)}px`)
      .style("top", `${Math.max(event.clientY - 12, 12)}px`)
      .style("opacity", "1");
  }

  function hideTip() {
    tooltip.style("opacity", "0");
  }

  function chartSize(node, fallbackHeight) {
    return {
      width: Math.max(320, Math.floor(node.getBoundingClientRect().width || 680)),
      height: fallbackHeight,
    };
  }

  function formatCount(value) {
    if (value >= 1000) return `${(value / 1000).toFixed(value >= 2000 ? 1 : 0)}k`;
    return d3.format(",")(value);
  }

  function drawLineChart(node, config) {
    const { width, height } = chartSize(node, config.height || 340);
    const margin = { top: 22, right: config.right || 92, bottom: 34, left: 54 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;
    const all = config.series.flatMap((item) => item.data);

    d3.select(node).selectAll("*").remove();

    const svg = d3
      .select(node)
      .append("svg")
      .attr("role", "img")
      .attr("aria-label", config.label)
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("width", width)
      .attr("height", height);

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
    const x = d3.scaleLinear().domain(d3.extent(all, (d) => d.year)).range([0, innerW]);
    const y = d3
      .scaleLinear()
      .domain([0, d3.max(all, (d) => d.count) * 1.12])
      .nice()
      .range([innerH, 0]);

    g.append("g")
      .attr("class", "kehlani-grid")
      .call(d3.axisLeft(y).tickSize(-innerW).tickFormat("").ticks(5))
      .call((axis) => axis.select(".domain").remove())
      .call((axis) => axis.selectAll("line").attr("stroke", "var(--rule)").attr("stroke-dasharray", "2 5"));

    g.append("g")
      .attr("transform", `translate(0,${innerH})`)
      .call(d3.axisBottom(x).ticks(6).tickFormat(d3.format("d")))
      .call((axis) => {
        axis.select(".domain").attr("stroke", "var(--rule)");
        axis.selectAll("line").attr("stroke", "var(--rule)");
        axis.selectAll("text").attr("fill", "var(--muted)").attr("font-family", "var(--mono)");
      });

    g.append("g")
      .call(d3.axisLeft(y).ticks(5).tickFormat(formatCount))
      .call((axis) => {
        axis.select(".domain").remove();
        axis.selectAll("line").remove();
        axis.selectAll("text").attr("fill", "var(--muted)").attr("font-family", "var(--mono)");
      });

    const line = d3
      .line()
      .x((d) => x(d.year))
      .y((d) => y(d.count))
      .curve(d3.curveMonotoneX);

    const area = d3
      .area()
      .x((d) => x(d.year))
      .y0(innerH)
      .y1((d) => y(d.count))
      .curve(d3.curveMonotoneX);

    config.series.forEach((item) => {
      if (item.fill) {
        g.append("path")
          .datum(item.data)
          .attr("d", area)
          .attr("fill", item.color)
          .attr("opacity", 0.12);
      }

      g.append("path")
        .datum(item.data)
        .attr("d", line)
        .attr("fill", "none")
        .attr("stroke", item.color)
        .attr("stroke-width", item.weight || 2.4)
        .attr("stroke-linecap", "round");

      const last = item.data[item.data.length - 1];
      g.append("text")
        .attr("x", Math.min(x(last.year) + 8, innerW + 4))
        .attr("y", y(last.count))
        .attr("dy", "0.35em")
        .attr("fill", item.color)
        .attr("font-family", "var(--sans)")
        .attr("font-size", "12")
        .attr("font-weight", "700")
        .text(item.name);
    });

    if (config.note) {
      g.append("line")
        .attr("x1", x(config.note.year))
        .attr("x2", x(config.note.year))
        .attr("y1", 0)
        .attr("y2", innerH)
        .attr("stroke", "var(--rule)")
        .attr("stroke-dasharray", "4 4");

      g.append("text")
        .attr("x", x(config.note.year) + 6)
        .attr("y", 12)
        .attr("fill", "var(--muted)")
        .attr("font-family", "var(--sans)")
        .attr("font-size", "11")
        .text(config.note.label);
    }

    const hoverLine = g
      .append("line")
      .attr("y1", 0)
      .attr("y2", innerH)
      .attr("stroke", "var(--ink)")
      .attr("opacity", 0);

    g.append("rect")
      .attr("width", innerW)
      .attr("height", innerH)
      .attr("fill", "transparent")
      .on("mousemove", (event) => {
        const [mx] = d3.pointer(event);
        const year = Math.round(x.invert(mx));
        hoverLine.attr("x1", x(year)).attr("x2", x(year)).attr("opacity", 0.22);
        const rows = config.series
          .map((item) => {
            const point = item.data.find((d) => d.year === year);
            if (!point) return null;
            return `<span style="color:${item.color}">${item.name}: ${d3.format(",")(point.count)}</span>`;
          })
          .filter(Boolean);
        if (rows.length) showTip(event, [`<strong>${year}</strong>`, ...rows]);
      })
      .on("mouseleave", () => {
        hoverLine.attr("opacity", 0);
        hideTip();
      });
  }

  function drawBars(node) {
    const { width } = chartSize(node, 250);
    const rowH = 38;
    const margin = { top: 10, right: 68, bottom: 18, left: 82 };
    const height = margin.top + margin.bottom + soundFamily.length * rowH;
    const innerW = width - margin.left - margin.right;

    d3.select(node).selectAll("*").remove();

    const svg = d3
      .select(node)
      .append("svg")
      .attr("role", "img")
      .attr("aria-label", "2025 birth counts for names in Kehlani's sound family")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("width", width)
      .attr("height", height);

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
    const x = d3.scaleLinear().domain([0, d3.max(soundFamily, (d) => d.count)]).range([0, innerW]);
    const y = d3.scaleBand().domain(soundFamily.map((d) => d.name)).range([0, soundFamily.length * rowH]).padding(0.22);

    g.selectAll("rect.bg")
      .data(soundFamily)
      .join("rect")
      .attr("x", 0)
      .attr("y", (d) => y(d.name))
      .attr("width", innerW)
      .attr("height", y.bandwidth())
      .attr("rx", 5)
      .attr("fill", "color-mix(in srgb, var(--rule) 70%, transparent)");

    g.selectAll("rect.bar")
      .data(soundFamily)
      .join("rect")
      .attr("x", 0)
      .attr("y", (d) => y(d.name))
      .attr("width", (d) => x(d.count))
      .attr("height", y.bandwidth())
      .attr("rx", 5)
      .attr("fill", (d) => d.color);

    g.selectAll("text.name")
      .data(soundFamily)
      .join("text")
      .attr("x", -10)
      .attr("y", (d) => y(d.name) + y.bandwidth() / 2)
      .attr("dy", "0.35em")
      .attr("text-anchor", "end")
      .attr("fill", "var(--ink)")
      .attr("font-family", "var(--sans)")
      .attr("font-size", "13")
      .attr("font-weight", "700")
      .text((d) => d.name);

    g.selectAll("text.count")
      .data(soundFamily)
      .join("text")
      .attr("x", (d) => x(d.count) + 8)
      .attr("y", (d) => y(d.name) + y.bandwidth() / 2)
      .attr("dy", "0.35em")
      .attr("fill", "var(--muted)")
      .attr("font-family", "var(--mono)")
      .attr("font-size", "12")
      .text((d) => d3.format(",")(d.count));
  }

  function renderAll() {
    const main = root.querySelector("[data-kehlani-line]");
    if (main) {
      drawLineChart(main, {
        height: 330,
        right: 84,
        label: "Kehlani births per year from 2015 to 2025",
        note: { year: 2015, label: "first SSA appearance" },
        series: [
          {
            name: "Kehlani",
            color: colors.kehlani,
            fill: true,
            weight: 3,
            data: asPoints(series.Kehlani),
          },
        ],
      });
    }

    const compare = root.querySelector("[data-kehlani-compare]");
    if (compare) {
      drawLineChart(compare, {
        height: 360,
        right: 92,
        label: "Kehlani, Khaleesi, Nevaeh, and Leilani birth counts from 2010 to 2025",
        series: [
          { name: "Kehlani", color: colors.kehlani, weight: 3, data: asPoints(series.Kehlani) },
          { name: "Khaleesi", color: colors.khaleesi, data: asPoints(series.Khaleesi) },
          { name: "Nevaeh", color: colors.nevaeh, data: asPoints(series.Nevaeh) },
          { name: "Leilani", color: colors.leilani, data: asPoints(series.Leilani) },
        ],
      });
    }

    const bars = root.querySelector("[data-kehlani-bars]");
    if (bars) drawBars(bars);
  }

  renderAll();

  let frame = 0;
  const observer = new ResizeObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(renderAll);
  });
  root.querySelectorAll("[data-kehlani-line], [data-kehlani-compare], [data-kehlani-bars]").forEach((node) => {
    observer.observe(node);
  });
})();
