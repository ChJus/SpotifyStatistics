import * as INDEX from "./index.js"

// Resize graphs with timeout to avoid lagging and abundantly refreshing interface
let windowResizeTimeout = null;
window.addEventListener('resize', async () => {
  if (windowResizeTimeout) clearTimeout(windowResizeTimeout);
  windowResizeTimeout = setTimeout(() => {
    // Refresh all content in window – avoid doing unless necessary
    document.querySelector("#settings .tab.active").click();
  }, 50);
}, true);

// Update graphs on change of grouping preference
document.querySelector("#overall-graphs-group-preference").onchange = () => {
  let [sd, ed] = INDEX.getDateRange();
  refreshOverallStreamsGraph(INDEX.processedData, sd, ed);
}

document.querySelector("#oneD-song-genre-factor").onchange = () => {
  let [sd, ed] = INDEX.getDateRange();
  refreshGenreAnalysisGraph(INDEX.processedData, sd, ed);
}

document.querySelector("#calendar-factor").onchange = () => refreshCalendarGraph(INDEX.processedData);
document.querySelector("#calendar-year").onchange = () => refreshCalendarGraph(INDEX.processedData);


export function refreshGraphs(data, min, max) {
  refreshCalendarGraph(data);
  refreshOverallStreamsGraph(data, min, max);
  refreshTimeOfDayGraph(data, min, max);
  refreshDayOfWeekGraph(data, min, max);
  refreshGenreAnalysisGraph(data);
}

function refreshCalendarGraph(data) {
  data = structuredClone(data);
  let dataYear = document.querySelector("#calendar-year"), factor = document.querySelector("#calendar-factor").value;
  let [startYear, endYear] = d3.extent([...data.history.values()], d => new Date(d.date).getFullYear());

  let select = document.querySelector("#calendar-year");
  document.querySelectorAll("#calendar-year option").forEach((e) => {e.remove()})

  for (let i = startYear; i <= endYear; i++) {
    let opt = document.createElement('option');
    opt.value = i;
    opt.innerHTML = i;
    if (dataYear !== null && dataYear === startYear) opt.selected = true;
    select.appendChild(opt);
  }
  dataYear = startYear;

  let dataset = [];
  if (factor === "msPlayed" || factor === "streams") {
    let min = new Date(dataYear + "-1-1"),
        max = new Date(dataYear+1 + "-1-1");

    let d = [...data.history.values()];
    for (let i = 0; i < d.length; i++) {
      if (new Date(d[i].date) - new Date(min) < 0) {
        continue;
      } else if (new Date(d[i].date) - new Date(max) > 0) {
        break;
      }
      if (dataset.length > 0 && approximateDate(new Date(dataset[dataset.length - 1].date)) === approximateDate(new Date(d[i].date))) {
        dataset[dataset.length - 1].value += d[i][factor] - (i !== 0 ? d[i - 1][factor] : 0);
      } else {
        dataset.push({
          date: new Date(approximateDate(new Date(d[i].date))),
          value: d[i][factor] - (i !== 0 ? d[i - 1][factor] : 0)
        });
      }
    }

    if (factor === 'msPlayed') {
      dataset.forEach((d) => {d.value = Math.round(d.value / 1000.0 / 60.0);})
    }
  } else {
    let min = new Date(dataYear + "-1-1"),
      max = new Date(dataYear+1 + "-1-1");

    let d = [...data.songStats.values()];
    dataset = new Map();
    for (let i = 0; i < d.length; i++) {
      for (let j = 1; j < d[i].streamHistory.length; j++) {
        if (new Date(d[i].date) - new Date(min) < 0) {
          continue;
        } else if (new Date(d[i].date) - new Date(max) > 0) {
          break;
        }
        if (dataset.has(approximateDate(new Date(d[i].streamHistory[j].date)))) {
          dataset.get(approximateDate(new Date(d[i].streamHistory[j].date))).value += d[i][factor];
          dataset.get(approximateDate(new Date(d[i].streamHistory[j].date))).total += d[i].streamHistory[j].streams - d[i].streamHistory[j - 1].streams;
        } else {
          dataset.set(approximateDate(new Date(d[i].streamHistory[j].date)), {
            date: new Date(approximateDate(new Date(d[i].streamHistory[j].date))),
            value: d[i][factor],
            total: d[i].streamHistory[j].streams - d[i].streamHistory[j - 1].streams
          });
        }
      }
    }
    dataset = [...dataset.values()];
    dataset.forEach((d) => {
      d.date = new Date(d.date);
      d.value = d.value / d.total;
    })
  }

    const width = document.querySelector("#calendar-graph").clientWidth; // width of the chart
    const cellSize = 15; // height of a day
    const height = cellSize * 9; // height of a week (7 days + padding)

    // Define formatting functions for the axes and tooltips.
    const formatDate = d3.timeFormat("%x");
    const formatDay = i => "MTWTFSS"[i];
    const formatMonth = d3.timeFormat("%b");

    // Helpers to compute a day’s position in the week.
    const timeWeek = d3.utcSunday;
    const countDay = i => (i) % 7;

    // Compute the extent of the value, ignore the outliers
    // and define a diverging and symmetric color scale.
    const max = d3.quantile(dataset, 0.9975, d => d.value);
    let color;

    switch(factor) {
      case "msPlayed":
      case "streams":
        color = d3.scaleSequential(d3.interpolateRgb("rgb(20, 20, 20)", "#1DB954")).domain([0, +max]);
        break;
      case "energy":
        color = d3.scaleSequential(d3.interpolateRgbBasis(["#60558a", "#b5576c", "#f6a161", "#ffdd85", "#F7EBAB"])).domain(d3.extent(dataset, d => d.value));
        break;
      case "valence":
        color = d3.scaleSequential(d3.interpolateRgbBasis(["#60558a", "#ac538d", "#e1915b", "#ffe23f", "#F7EBAB"])).domain(d3.extent(dataset, d => d.value));
        break;
    }

    // Group data by year, in reverse input order. (Since the dataset is chronological,
    // this will show years in reverse chronological order.)
    const years = d3.groups(dataset, d => new Date(d.date).getUTCFullYear()).reverse();

    // A function that draws a thin white line to the left of each month.
    function pathMonth(t) {
    const d = Math.max(0, Math.min(7, countDay(t.getUTCDay() + 6)));
    const w = timeWeek.count(d3.utcYear(t), t);
    return `${d === 0 ? `M${w * cellSize},0`
      : d === 7 ? `M${(w + 1) * cellSize},0`
        : `M${(w + 1) * cellSize},0V${d * cellSize}H${w * cellSize}`}V${7 * cellSize}`;
  }

  const svg = d3.create("svg")
    .attr("width", width)
    .attr("height", height * years.length)
    .attr("viewBox", [0, 0, width, height * years.length])
    .attr("style", "max-width: 100%; height: auto; font: 10px 'DM Sans', sans-serif;");

  const year = svg.selectAll("g")
    .data(years)
    .join("g")
    .attr("transform", (d, i) => `translate(40.5,${height * i + cellSize * 1.5})`);

  year.append("text")
    .attr("x", -5)
    .attr("y", -5)
    .attr("font-weight", "bold")
    .attr("fill", "var(--foreground-color)")
    .attr("text-anchor", "end")
    .text(([key]) => key);

  year.append("g")
    .attr("text-anchor", "end")
    .selectAll()
    .data(d3.range(0, 7))
    .join("text")
    .attr("x", -5)
    .attr("y", i => (countDay(i) + 0.5) * cellSize)
    .attr("dy", "0.31em")
    .attr("fill", "var(--foreground-color)")
    .text(formatDay);

  year.append("g")
    .selectAll()
    .data(dataset)
    .join("rect")
    .attr("width", cellSize - 1)
    .attr("height", cellSize - 1)
    .attr("x", d => timeWeek.count(d3.utcYear(d.date), d.date) * cellSize + 0.5)
    .attr("y", d => countDay(d.date.getUTCDay()) * cellSize + 0.5)
    .attr("fill", d => color(d.value))
    .append("title")
    .text(d => `${d.date}: ${d.value}`);

  const month = year.append("g")
    .selectAll()
    .data(([, values]) => d3.utcMonths(d3.utcMonth(values[0].date), values.at(-1).date))
    .join("g");

  month.filter((d, i) => i).append("path")
    .attr("fill", "none")
    .attr("stroke", "#fff")
    .attr("stroke-width", 2)
    .attr("d", pathMonth);

  month.append("text")
    .attr("x", d => timeWeek.count(d3.utcYear(d), timeWeek.ceil(d)) * cellSize + 2)
    .attr("y", -5)
    .attr("fill", "var(--foreground-color)")
    .text(formatMonth);

  Object.assign(svg.node(), {scales: {color}});
  if (document.querySelector("#calendar-graph svg") !== null) {
  document.querySelector("#calendar-graph svg").remove();
  }
  document.querySelector("#calendar-graph").appendChild(svg.node());
}

function refreshOverallStreamsGraph(data, min, max) {
  let d = structuredClone([...data.history.values()]);
  let dates = [...new Set(d.map(d => approximateDate(new Date(d.date))))]
  let eDay = new Date(min);
  eDay.setDate(eDay.getDate() - 1);

  let dataset = [{
    date: new Date(approximateDate(new Date(eDay))),
    streams: d[getLast(d, eDay) + 1].streams,
    msPlayed: d[getLast(d, eDay) + 1].msPlayed
  }];
  for (let i = 0; i < Math.round((new Date(max) - new Date(min)) / 24.0 / 3600.0 / 1000.0) - 1; i++) {
    let sd = new Date(min);
    sd.setDate(sd.getDate() + i);
    let ed = new Date(sd);
    ed.setDate(ed.getDate() + 1);

    if (dates.includes(approximateDate(sd))) {
      dataset.push({
        date: sd,
        streams: d[getLast(d, ed)].streams,
        msPlayed: d[getLast(d, ed)].msPlayed
      });
    } else {
      dataset.push({
        date: sd,
        streams: dataset[dataset.length - 1].streams,
        msPlayed: dataset[dataset.length - 1].msPlayed
      });
    }
  }

  // %j: by day, %U: by week, %m: by month
  // Note %Y groups by year — this helps prevent unintended grouping of days in different years
  let group;
  switch (document.querySelector("#overall-graphs-group-preference").value) {
    case "d":
      group = d3.timeFormat("%j %Y");
      break;
    case "w":
      group = d3.timeFormat("%U %Y");
      break;
    case "m":
      group = d3.timeFormat("%m %Y");
      break;
  }

  let nest = [...d3.group(dataset, d => group(new Date(d.date))).values()];
  dataset = [{
    date: new Date(nest[0][0].date),
    streams: nest[0][nest[0].length - 1].streams - nest[0][0].streams,
    msPlayed: nest[0][nest[0].length - 1].msPlayed - nest[0][0].msPlayed
  }];
  for (let i = 1; i < nest.length; i++) {
    dataset.push({
      date: new Date(approximateDate(new Date(nest[i][0].date))),
      streams: nest[i][nest[i].length - 1].streams - nest[i - 1][nest[i - 1].length - 1].streams,
      msPlayed: nest[i][nest[i].length - 1].msPlayed - nest[i - 1][nest[i - 1].length - 1].msPlayed,
    });
  }

  function getLast(data, date) {
    for (let i = 0; i < data.length; i++) {
      if (new Date(date) - new Date(data[i].date) < 0) {
        return i - 1;
      }
    }
    return data.length - 1;
  }

  // Graph margins
  let margin = {top: 10, right: 30, bottom: 30, left: 50},
    width = document.querySelector("#overall-graphs").clientWidth - margin.left - margin.right,
    height = 200 - margin.top - margin.bottom;

  let svg;
  let x = d3.scaleTime().range([0, width]);
  let xAxis = d3.axisBottom().scale(x).ticks(4);

  let y = d3.scaleLinear().range([height, 0]);
  let yAxis = d3.axisLeft().scale(y).ticks(4);

  // If the graphs exist, just modify their time range
  if (document.querySelector("#overall-graphs svg") !== null) {
    svg = d3.select("#overall-graphs svg")
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .attr("viewBox", `${-margin.left} ${-margin.top} ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    update(dataset);
  } else {
    svg = d3.select("#overall-graphs")
      .append("svg")
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .attr("viewBox", `${-margin.left} ${-margin.top} ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
      .attr("id", "overall-stream-count-history");

    // x-axis
    svg.append("g")
      .attr("transform", "translate(0," + height + ")")
      .attr("class", "x-axis")

    // y-axis
    svg.append("g")
      .attr("class", "y-axis")

    svg
      .append("circle")
      .attr("class", "tooltip-point")
      .attr("r", 7)
      .attr("fill", "var(--spotify-green)")
      .attr("stroke", "black")
      .attr("stroke-width", 7)
      .style("opacity", 0)
      .style('pointer-events', 'none')

    update(dataset)
  }

  // Update function for graph
  function update(data) {
    // x-axis
    x.domain(d3.extent(data, function (d) {
      return d3.timeParse("%Y-%m-%d")(approximateDate(new Date(d.date)))
    }));

    svg.selectAll(".x-axis").transition()
      .duration(500)
      .call(xAxis); // limit number of ticks to prevent cramping

    // y-axis
    y.domain([0, d3.max(data, function (d) {
      return d.streams
    })]);

    svg.selectAll(".y-axis").transition()
      .duration(500)
      .call(yAxis);

    svg.select(".y-axis")
      .call(g => g.selectAll(".horizontal-line, .label, .domain").remove())
      .call(g => g.selectAll(".tick line").clone()
        .attr("class", "horizontal-line")
        .attr("x2", width)
        .attr("stroke-opacity", 0.1))
      .call(g => g.append("text")
        .attr("x", -margin.left)
        .attr("y", 0)
        .attr("fill", "currentColor")
        .attr("text-anchor", "start")
        .attr("class", "label")
        .text("↑ Streams"))

    svg.select(".x-axis")
      .call(g => g.selectAll(".label").remove())
      .call(g => g.append("text")
        .attr("x", width - margin.right)
        .attr("y", margin.bottom)
        .attr("fill", "currentColor")
        .attr("text-anchor", "start")
        .attr("class", "label")
        .text("→ Date"))

    // Create an update selection: bind to the new data
    let u = svg.selectAll(".lineTest")
      .data([data], function (d) {
        return d3.timeParse("%Y-%m-%d")(approximateDate(new Date(d.date)))
      });

    // Update the line
    u
      .enter()
      .append("path")
      .attr("class", "lineTest")
      .merge(u)
      .transition()
      .duration(500)
      .attr("d", d3.line()
        .x(function (d) {
          return x(d3.timeParse("%Y-%m-%d")(approximateDate(new Date(d.date))));
        })
        .y(function (d) {
          return y(d.streams);
        })
      )
      .attr("fill", "none")
      .attr("stroke", "var(--spotify-green)")
      .attr("stroke-width", 1.75);

    // Add the event listeners that show or hide the tooltip.
    const tooltip = document.querySelector("#overall-graph-tooltip");
    const bisect = d3.bisector(d => d.date).center;

    svg.on("pointerenter pointermove", pointermoved)
      .on("pointerleave", pointerleft)
      .on("touchstart", event => event.preventDefault());

    d3.select("#overall-graph-tooltip")
      .on("pointerenter pointermove", pointermoved)
      .on("pointerleave", pointerleft)
      .on("touchstart", event => event.preventDefault());

    function pointermoved(event) {
      const i = bisect(dataset, x.invert(d3.pointer(event)[0]));
      tooltip.style.display = "inline-block";
      tooltip.style.opacity = "1";
      tooltip.style.position = "absolute";
      tooltip.style.left = `${x(d3.timeParse("%Y-%m-%d")(approximateDate(new Date(dataset[i].date)))) - tooltip.clientWidth / 2 + margin.left}px`
      tooltip.style.top = `${height - tooltip.clientHeight + y(dataset[i].streams) - document.querySelector("#overall-graphs .preference-panel").clientHeight + margin.top + margin.bottom + 10}px`;
      tooltip.innerHTML = `<span><strong>Date</strong>: ${approximateDate(new Date(dataset[i].date))}</span><br/><span><strong>Streams</strong>: ${dataset[i].streams}</span>`;

      d3.select("#overall-stream-count-history .tooltip-point").style('opacity', 1)
        .attr('cx', x(d3.timeParse("%Y-%m-%d")(approximateDate(new Date(dataset[i].date)))))
        .attr('cy', y(dataset[i].streams))
    }

    function pointerleft() {
      document.querySelector("#overall-stream-count-history .tooltip-point").style.opacity = "0";
      tooltip.style.opacity = "0";
      sleep(300).then(() => tooltip.style.display = "none");
    }
  }
}

function refreshGenreAnalysisGraph(data) {
  let originalData = structuredClone(data);
  data = [...data.songStats.values()];
  data.sort(function (a, b) {
    return b.streams - a.streams
  })
  let attr = document.querySelector("#oneD-song-genre-factor").value;
  let numNodes = Math.min(data.length, 300);
  document.querySelector("#oneD-song-genre-force").innerHTML = `
    <g id="lines"></g>
    <g id="tooltip"></g>
    <g id="visual"></g>
  `;

  d3.select("#tooltip")
    .append("circle")
    .attr("class", "tooltip-point")
    .attr("r", 10)
    .attr("stroke", "var(--spotify-green)")
    .attr("stroke-width", 5)
    .style("opacity", 0)
    .style('pointer-events', 'none')

  let margin = {top: 20, right: 20, bottom: 20, left: 20};
  let width = document.querySelector("#oneD-song-genre-force").clientWidth - margin.left - margin.right;
  let height = document.querySelector("#oneD-song-genre-force").clientHeight - margin.top - margin.bottom;
  let svg = d3.select("#oneD-song-genre-force");
  let graphic = d3.select("#oneD-song-genre-force #visual");

  let nodes = d3.range(numNodes).map(function (d, i) {
    return {
      radius: Math.sqrt(data[i].streams) + 7,
      value: data[i][attr],
      index: i,
      image: data[i].image !== null ? data[i].image : ''
    }
  });

  // Set domain based on factor range
  let domain;
  if (attr === "tempo") domain = [d3.min(nodes, (d) => d.value) - 20, d3.max(nodes, (d) => d.value) + 20];
  else domain = [d3.min(nodes, (d) => d.value) - 0.1, d3.max(nodes, (d) => d.value) + 0.1];

  let node = graphic.selectAll(".node")
    .data(nodes)
    .enter()
    .append("g")
    .attr("class", "node")
    .each((d) => {
      graphic.append("clipPath")
        .attr("id", `clip${d.index}`)
        .append("circle")
        .attr("r", d.radius)
        .attr("fill-opacity", 0)
        .attr("cx", 0)
        .attr("cy", 0);
    })

  node.append("image")
    .attr("xlink:href", (d) => d.image)
    .attr("x", (d) => -d.radius)
    .attr("y", (d) => -d.radius)
    .attr("width", (d) => 2 * d.radius)
    .attr("height", (d) => 2 * d.radius)
    .attr("clip-path", (d) => `url(#clip${d.index})`);

  if (width > height) {
    let xScale = d3.scaleLinear().domain(domain).range([0, width]);
    let xAxis = d3.axisBottom().scale(xScale).ticks(6);

    svg.select("#lines")
      .attr("transform", `translate(${margin.left} ${margin.top + height})`)
      .attr("class", "x-axis")

    svg.selectAll(".x-axis")
      .call(xAxis)
      .call(g => g.selectAll(".vertical-line, .domain").remove())
      .call(g => g.selectAll(".tick line").clone()
        .attr("class", "vertical-line")
        .attr("y2", -height)
        .attr("stroke-opacity", 0.1));

    d3.forceSimulation(nodes)
      .force('charge', d3.forceManyBody().strength(5))
      .force('x', d3.forceX().x(function (d) {
        return xScale(d.value);
      }))
      .force('y', d3.forceY().y(function (d) {
        return height / 2;
      }))
      .force('collision', d3.forceCollide().radius(function (d) {
        return d.radius;
      }))
      .on('tick', ticked);
  } else {
    let yScale = d3.scaleLinear().domain(domain).range([0, height]);

    let yAxis = d3.axisLeft().scale(yScale).ticks(6);

    svg.select("#lines")
      .attr("transform", `translate(${margin.left + 15} ${margin.top})`)
      .attr("class", "y-axis")

    svg.selectAll(".y-axis")
      .call(yAxis)
      .call(g => g.selectAll(".horizontal-line, .domain").remove())
      .call(g => g.selectAll(".tick line").clone()
        .attr("class", "horizontal-line")
        .attr("x2", width)
        .attr("stroke-opacity", 0.1));

    d3.forceSimulation(nodes)
      .force('charge', d3.forceManyBody().strength(5))
      .force('y', d3.forceY().y(function (d) {
        return yScale(d.value);
      }))
      .force('x', d3.forceX().x(function (d) {
        return width / 2;
      }))
      .force('collision', d3.forceCollide().radius(function (d) {
        return d.radius;
      }))
      .on('tick', ticked);
  }

  function ticked() {
    svg.attr("width", width)
      .attr("height", height)

    graphic
      .attr("transform", `translate(${margin.left} ${margin.top})`)

    node.attr("transform", function (d) {
      d.x = Math.max(d.radius, Math.min(width - d.radius, d.x));
      d.y = Math.max(d.radius, Math.min(height - d.radius, d.y));
      return "translate(" + d.x + "," + d.y + ")";
    });

    updateOutline();
  }

  // Add the event listeners that show or hide the tooltip.
  const tooltip = document.querySelector("#oneD-song-genre-force-tooltip");

  d3.select("#oneD-song-genre-force .tooltip-point")
    .attr("transform", `translate(${margin.left} ${margin.top})`)

  node
    .on("mouseover mousemove", mousemove)
    .on("mouseleave", mouseleave)
    .on("click", (e, d) => INDEX.moreInfo("song", originalData, data[d.index].internalID));

  function mousemove(event, d) {
    tooltip.style.display = "inline-block";
    d3.select("#oneD-song-genre-force-tooltip").transition().duration(100).style("opacity", 1)
    tooltip.style.position = "absolute";
    tooltip.style.left = `${Math.max(d.x - tooltip.clientWidth / 2, 0)}px`
    tooltip.style.top = `${margin.top + margin.bottom + 80 + tooltip.clientHeight / 2 + d.y}px`;
    tooltip.innerHTML = `
      <span><strong>Song</strong>: ${data[d.index].trackName}</span><br/>
      <span><strong>By</strong>: ${[...data[d.index].artists].toString().replaceAll(",", ", ")}</span><br/>
      <span><strong>${attr}</strong>: ${data[d.index][attr]}</span>
    `;
    document.querySelector("#oneD-song-genre-force .tooltip-point").data = d;
    document.querySelector("#oneD-song-genre-force .tooltip-point").style.opacity = "1";
    document.querySelector("#oneD-song-genre-force").style.cursor = "pointer";
    updateOutline();
  }

  function mouseleave() {
    document.querySelector("#oneD-song-genre-force .tooltip-point").style.opacity = "0";

    d3.select("#oneD-song-genre-force-tooltip").transition()
      .duration(200).style("opacity", 0)
      .on('end', () => tooltip.style.display = "none")

    document.querySelector("#oneD-song-genre-force").style.cursor = "default";
  }

  function updateOutline() {
    if (document.querySelector("#oneD-song-genre-force .tooltip-point").data !== undefined) {
      let d = document.querySelector("#oneD-song-genre-force .tooltip-point").data;
      d3.select("#oneD-song-genre-force .tooltip-point")
        .attr('cx', d.x)
        .attr('cy', d.y)
        .attr('r', d.radius)
    }
  }
}

function refreshTimeOfDayGraph(data, min, max) {
  let d = structuredClone([...data.history.values()]);
  let dat = new Array(24).fill(0);
  for (let i = 0; i < d.length; i++) {
    if (new Date(d[i].date) - new Date(min) < 0) {
      continue;
    } else if (new Date(d[i].date) - new Date(max) > 0) {
      break;
    }
    dat[parseInt(d3.timeFormat("%H")(new Date(d[i].date)))] += d[i].streams;
    if (i !== 0) dat[parseInt(d3.timeFormat("%H")(new Date(d[i].date)))] -= d[i - 1].streams;
  }

  let dataset = []
  dat.forEach((d, i) => dataset.push({date: i, streams: dat[i]}));

  // Graph margins
  let margin = {top: 10, right: 30, bottom: 30, left: 50},
    width = document.querySelector("#timeOfDay-graph").clientWidth - margin.left - margin.right,
    height = 200 - margin.top - margin.bottom;

  let svg;
  let x = d3.scaleTime().range([0, width]);
  let xAxis = d3.axisBottom().scale(x).ticks(4);

  let y = d3.scaleLinear().range([height, 0]);
  let yAxis = d3.axisLeft().scale(y).ticks(4);

  // If the graphs exist, just modify their time range
  if (document.querySelector("#timeOfDay-graph svg") !== null) {
    svg = d3.select("#timeOfDay-graph svg")
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .attr("viewBox", `${-margin.left} ${-margin.top} ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    update(dataset);
  } else {
    svg = d3.select("#timeOfDay-graph")
      .append("svg")
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .attr("viewBox", `${-margin.left} ${-margin.top} ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
      .attr("id", "timeOfDay-graph");

    // x-axis
    svg.append("g")
      .attr("transform", "translate(0," + height + ")")
      .attr("class", "x-axis")

    // y-axis
    svg.append("g")
      .attr("class", "y-axis")

    svg
      .append("circle")
      .attr("class", "tooltip-point")
      .attr("r", 7)
      .attr("fill", "var(--spotify-green)")
      .attr("stroke", "black")
      .attr("stroke-width", 7)
      .style("opacity", 0)
      .style('pointer-events', 'none')

    update(dataset)
  }

  // Update function for graph
  function update(data) {
    // x-axis
    x.domain(d3.extent(data, function (d) {
      return d3.timeParse("%H")(d.date)
    }));

    svg.selectAll(".x-axis").transition()
      .duration(500)
      .call(xAxis); // limit number of ticks to prevent cramping

    // y-axis
    y.domain([0, d3.max(data, function (d) {
      return d.streams
    })]);

    svg.selectAll(".y-axis").transition()
      .duration(500)
      .call(yAxis);

    svg.select(".y-axis")
      .call(g => g.selectAll(".horizontal-line, .label, .domain").remove())
      .call(g => g.selectAll(".tick line").clone()
        .attr("class", "horizontal-line")
        .attr("x2", width)
        .attr("stroke-opacity", 0.1))
      .call(g => g.append("text")
        .attr("x", -margin.left)
        .attr("y", 0)
        .attr("fill", "currentColor")
        .attr("text-anchor", "start")
        .attr("class", "label")
        .text("↑ Streams"))

    svg.select(".x-axis")
      .call(g => g.selectAll(".label").remove())
      .call(g => g.append("text")
        .attr("x", width - margin.right)
        .attr("y", margin.bottom)
        .attr("fill", "currentColor")
        .attr("text-anchor", "start")
        .attr("class", "label")
        .text("→ Time"))

    // Create an update selection: bind to the new data
    let u = svg.selectAll(".lineTest")
      .data([data], function (d) {
        return d3.timeParse("%H")(d.date)
      });

    // Update the line
    u
      .enter()
      .append("path")
      .attr("class", "lineTest")
      .merge(u)
      .transition()
      .duration(500)
      .attr("d", d3.line()
        .x(function (d) {
          return x(d3.timeParse("%H")(d.date));
        })
        .y(function (d) {
          return y(d.streams);
        })
      )
      .attr("fill", "none")
      .attr("stroke", "var(--spotify-green)")
      .attr("stroke-width", 1.75);

    document.querySelectorAll("#timeOfDay-graph .x-axis .tick")[0].style.opacity = "0";

    // Add the event listeners that show or hide the tooltip.
    const tooltip = document.querySelector("#timeOfDay-tooltip");
    const bisect = d3.bisector(d => d3.timeParse("%H")(d.date)).center;

    svg.on("pointerenter pointermove", pointermoved)
      .on("pointerleave", pointerleft)
      .on("touchstart", event => event.preventDefault());

    d3.select("#timeOfDay-tooltip")
      .on("pointerenter pointermove", pointermoved)
      .on("pointerleave", pointerleft)
      .on("touchstart", event => event.preventDefault());

    function pointermoved(event) {
      const i = bisect(data, x.invert(d3.pointer(event)[0]));
      tooltip.style.display = "inline-block";
      tooltip.style.opacity = "1";
      tooltip.style.position = "absolute";
      tooltip.style.left = `${x(d3.timeParse("%H")(data[i].date)) - tooltip.clientWidth / 2 + margin.left}px`
      tooltip.style.top = `${height - tooltip.clientHeight + y(data[i].streams) - document.querySelector("#timeOfDay-graph .preference-panel").clientHeight}px`;
      tooltip.innerHTML = `<span><strong>Time</strong>: ${data[i].date}:00</span><br/><span><strong>Streams</strong>: ${data[i].streams}</span>`;

      d3.select("#timeOfDay-graph .tooltip-point").style('opacity', 1)
        .attr('cx', x(d3.timeParse("%H")(data[i].date)))
        .attr('cy', y(data[i].streams))
    }

    function pointerleft() {
      document.querySelector("#timeOfDay-graph .tooltip-point").style.opacity = "0";
      tooltip.style.opacity = "0";
      sleep(300).then(() => tooltip.style.display = "none");
    }
  }
}

function refreshDayOfWeekGraph(data, min, max) {
  let d = structuredClone([...data.history.values()]);
  let dat = new Array(7).fill(0);
  for (let i = 0; i < d.length; i++) {
    if (new Date(d[i].date) - new Date(min) < 0) {
      continue;
    } else if (new Date(d[i].date) - new Date(max) > 0) {
      break;
    }
    dat[parseInt(d3.timeFormat("%w")(new Date(d[i].date)))] += d[i].streams;
    if (i !== 0) dat[parseInt(d3.timeFormat("%w")(new Date(d[i].date)))] -= d[i - 1].streams;
  }

  let dataset = []
  let days = ["Sun", "Mon", "Tue", "Wed", "Thur", "Fri", "Sat"]
  dat.forEach((d, i) => dataset.push({date: days[i], streams: dat[i]}));

  // Graph margins
  let margin = {top: 10, right: 30, bottom: 30, left: 50},
    width = document.querySelector("#dayOfWeek-graph").clientWidth - margin.left - margin.right,
    height = 200 - margin.top - margin.bottom;

  let svg;
  let x = d3.scaleOrdinal().range(d3.range(0, width + 0.5, width / 6));
  let xAxis = d3.axisBottom().scale(x);

  let y = d3.scaleLinear().range([height, 0]);
  let yAxis = d3.axisLeft().scale(y).ticks(4);

  // If the graphs exist, just modify their time range
  if (document.querySelector("#dayOfWeek-graph svg") !== null) {
    svg = d3.select("#dayOfWeek-graph svg")
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .attr("viewBox", `${-margin.left} ${-margin.top} ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    update(dataset);
  } else {
    svg = d3.select("#dayOfWeek-graph")
      .append("svg")
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .attr("viewBox", `${-margin.left} ${-margin.top} ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
      .attr("id", "dayOfWeek-graph");

    // x-axis
    svg.append("g")
      .attr("transform", "translate(0," + height + ")")
      .attr("class", "x-axis")

    // y-axis
    svg.append("g")
      .attr("class", "y-axis")

    svg
      .append("circle")
      .attr("class", "tooltip-point")
      .attr("r", 7)
      .attr("fill", "var(--spotify-green)")
      .attr("stroke", "black")
      .attr("stroke-width", 7)
      .style("opacity", 0)
      .style('pointer-events', 'none')

    update(dataset)
  }

  // Update function for graph
  function update(data) {
    // x-axis
    x.domain(days);

    svg.selectAll(".x-axis").transition()
      .duration(500)
      .call(xAxis); // limit number of ticks to prevent cramping

    // y-axis
    y.domain([0, d3.max(data, function (d) {
      return d.streams
    })]);

    svg.selectAll(".y-axis").transition()
      .duration(500)
      .call(yAxis);

    svg.select(".y-axis")
      .call(g => g.selectAll(".horizontal-line, .label, .domain").remove())
      .call(g => g.selectAll(".tick line").clone()
        .attr("class", "horizontal-line")
        .attr("x2", width)
        .attr("stroke-opacity", 0.1))
      .call(g => g.append("text")
        .attr("x", -margin.left)
        .attr("y", 0)
        .attr("fill", "currentColor")
        .attr("text-anchor", "start")
        .attr("class", "label")
        .text("↑ Streams"))

    svg.select(".x-axis")
      .call(g => g.selectAll(".label").remove())
      .call(g => g.append("text")
        .attr("x", width - margin.right)
        .attr("y", margin.bottom)
        .attr("fill", "currentColor")
        .attr("text-anchor", "start")
        .attr("class", "label")
        .text("→ Time"))

    // Create an update selection: bind to the new data
    let u = svg.selectAll(".lineTest")
      .data([data], function (d) {
        return d.date
      });

    // Update the line
    u
      .enter()
      .append("path")
      .attr("class", "lineTest")
      .merge(u)
      .transition()
      .duration(500)
      .attr("d", d3.line()
        .x(function (d) {
          return x(d.date);
        })
        .y(function (d) {
          return y(d.streams);
        })
      )
      .attr("fill", "none")
      .attr("stroke", "var(--spotify-green)")
      .attr("stroke-width", 1.75);

    // Add the event listeners that show or hide the tooltip.
    const tooltip = document.querySelector("#dayOfWeek-tooltip");
    const bisect = d3.bisector(d => d.date).center;

    svg.on("pointerenter pointermove", pointermoved)
      .on("pointerleave", pointerleft)
      .on("touchstart", event => event.preventDefault());

    d3.select("#dayOfWeek-tooltip")
      .on("pointerenter pointermove", pointermoved)
      .on("pointerleave", pointerleft)
      .on("touchstart", event => event.preventDefault());

    function pointermoved(event) {
      function inverse(e) {
        return x.domain()[d3.bisectCenter(x.range(), e)];
      }

      const i = days.indexOf(inverse(d3.pointer(event)[0]));

      tooltip.style.display = "inline-block";
      tooltip.style.opacity = "1";
      tooltip.style.position = "absolute";
      tooltip.style.left = `${x(days[i]) - tooltip.clientWidth / 2 + margin.left}px`
      tooltip.style.top = `${height - tooltip.clientHeight + y(data[i].streams) - document.querySelector("#dayOfWeek-graph .preference-panel").clientHeight}px`;
      tooltip.innerHTML = `<span><strong>Day</strong>: ${data[i].date}</span><br/><span><strong>Streams</strong>: ${data[i].streams}</span>`;

      d3.select("#dayOfWeek-graph .tooltip-point").style('opacity', 1)
        .attr('cx', x(days[i]))
        .attr('cy', y(data[i].streams))
    }

    function pointerleft() {
      document.querySelector("#dayOfWeek-graph .tooltip-point").style.opacity = "0";
      tooltip.style.opacity = "0";
      sleep(300).then(() => tooltip.style.display = "none");
    }
  }
}

export function refreshPopupGraphs(type, data, id) {
  if (document.querySelector(`#popup-${type}-graph svg`) !== null)
    document.querySelector(`#popup-${type}-graph svg`).remove();

  document.querySelector(`#popup-${type}-group-preference`).onchange = () => refreshPopupGraphs(type, data, id)

  let d;
  if (type === 'artist') {
    d = structuredClone([...data.artistStats.get(id).streamHistory.values()]);
  } else {
    d = structuredClone([...data.songStats.get(id).streamHistory.values()]);
  }

  let min = d[0].date, max = d[d.length - 1].date;
  let dates = [...new Set(d.map(d => approximateDate(new Date(d.date))))]
  let eDay = new Date(min);
  eDay.setDate(eDay.getDate() - 1);

  let dataset = [{
    date: new Date(approximateDate(new Date(eDay))),
    streams: d[getLast(d, eDay) + 1].streams,
    msPlayed: d[getLast(d, eDay) + 1].msPlayed
  }];
  for (let i = 0; i < Math.round((new Date(max) - new Date(min)) / 24.0 / 3600.0 / 1000.0) - 1; i++) {
    let sd = new Date(min);
    sd.setDate(sd.getDate() + i);
    let ed = new Date(sd);
    ed.setDate(ed.getDate() + 1);

    if (dates.includes(approximateDate(sd))) {
      dataset.push({
        date: sd,
        streams: d[getLast(d, ed)].streams,
        msPlayed: d[getLast(d, ed)].msPlayed
      });
    } else {
      dataset.push({
        date: sd,
        streams: dataset[dataset.length - 1].streams,
        msPlayed: dataset[dataset.length - 1].msPlayed
      });
    }
  }

  // %j: by day, %U: by week, %m: by month
  // Note %Y groups by year — this helps prevent unintended grouping of days in different years
  let group;

  switch (document.querySelector(`#popup-${type}-group-preference`).value) {
    case "d":
      group = d3.timeFormat("%j %Y");
      break;
    case "w":
      group = d3.timeFormat("%U %Y");
      break;
    case "m":
      group = d3.timeFormat("%m %Y");
      break;
  }

  let nest = [...d3.group(dataset, d => group(new Date(d.date))).values()];
  dataset = [{
    date: new Date(nest[0][0].date),
    streams: nest[0][nest[0].length - 1].streams - nest[0][0].streams,
    msPlayed: nest[0][nest[0].length - 1].msPlayed - nest[0][0].msPlayed
  }];
  for (let i = 1; i < nest.length; i++) {
    dataset.push({
      date: new Date(approximateDate(new Date(nest[i][0].date))),
      streams: nest[i][nest[i].length - 1].streams - nest[i - 1][nest[i - 1].length - 1].streams,
      msPlayed: nest[i][nest[i].length - 1].msPlayed - nest[i - 1][nest[i - 1].length - 1].msPlayed,
    });
  }

  function getLast(data, date) {
    for (let i = 0; i < data.length; i++) {
      if (new Date(date) - new Date(data[i].date) < 0) {
        return i - 1;
      }
    }
    return data.length - 1;
  }

  // Graph margins
  let margin = {top: 30, right: 30, bottom: 40, left: 50},
    width = document.querySelector(`#popup-${type}-graph`).clientWidth - margin.left - margin.right,
    height = 200 - margin.top - margin.bottom;

  let svg;
  let x = d3.scaleTime().range([0, width]);
  let xAxis = d3.axisBottom().scale(x).ticks(4);

  let y = d3.scaleLinear().range([height, 0]);
  let yAxis = d3.axisLeft().scale(y).ticks(4);

  svg = d3.select(`#popup-${type}-graph`)
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .attr("viewBox", `${-margin.left} ${-margin.top} ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .attr("id", `popup-${type}-graph-svg`);

  // x-axis
  svg.append("g")
    .attr("transform", "translate(0," + height + ")")
    .attr("class", "x-axis")

  // y-axis
  svg.append("g")
    .attr("class", "y-axis")

  svg
    .append("circle")
    .attr("class", "tooltip-point")
    .attr("r", 4)
    .attr("fill", "var(--spotify-green)")
    .attr("stroke", "var(--secondary-background-color)")
    .attr("stroke-width", 4)
    .style("opacity", 0)
    .style('pointer-events', 'none')

  update(dataset)

  // Update function for graph
  function update(data) {
    // x-axis
    x.domain(d3.extent(data, function (d) {
      return d3.timeParse("%Y-%m-%d")(approximateDate(new Date(d.date)))
    }));

    svg.selectAll(".x-axis").transition()
      .duration(500)
      .call(xAxis); // limit number of ticks to prevent cramping

    // y-axis
    y.domain([0, d3.max(data, function (d) {
      return d.streams
    })]);

    svg.selectAll(".y-axis").transition()
      .duration(500)
      .call(yAxis);

    svg.select(".y-axis")
      .call(g => g.selectAll(".horizontal-line, .label, .domain").remove())
      .call(g => g.selectAll(".tick line").clone()
        .attr("class", "horizontal-line")
        .attr("x2", width)
        .attr("stroke-opacity", 0.1))
      .call(g => g.append("text")
        .attr("x", -margin.left)
        .attr("y", -12)
        .attr("fill", "currentColor")
        .attr("text-anchor", "start")
        .attr("class", "label")
        .text("↑ Streams"))

    svg.select(".x-axis")
      .call(g => g.selectAll(".label").remove())
      .call(g => g.append("text")
        .attr("x", width - margin.right)
        .attr("y", margin.bottom - 5)
        .attr("fill", "currentColor")
        .attr("text-anchor", "start")
        .attr("class", "label")
        .text("→ Date"))

    // Create an update selection: bind to the new data
    let u = svg.selectAll(".lineTest")
      .data([data], function (d) {
        return d3.timeParse("%Y-%m-%d")(approximateDate(new Date(d.date)))
      });

    // Update the line
    u
      .enter()
      .append("path")
      .attr("class", "lineTest")
      .merge(u)
      .transition()
      .duration(500)
      .attr("d", d3.line()
        .x(function (d) {
          return x(d3.timeParse("%Y-%m-%d")(approximateDate(new Date(d.date))));
        })
        .y(function (d) {
          return y(d.streams);
        })
      )
      .attr("fill", "none")
      .attr("stroke", "var(--spotify-green)")
      .attr("stroke-width", 1.75);

    // Add the event listeners that show or hide the tooltip.
    const tooltip = document.querySelector(`#popup-${type}-graph-tooltip`);
    const bisect = d3.bisector(d => d.date).center;

    svg.on("pointerenter pointermove", pointermoved)
      .on("pointerleave", pointerleft)
      .on("touchstart", event => event.preventDefault());

    d3.select("#popup-artist-graph-tooltip")
      .on("pointerenter pointermove", pointermoved)
      .on("pointerleave", pointerleft)
      .on("touchstart", event => event.preventDefault());

    function pointermoved(event) {
      const i = bisect(dataset, x.invert(d3.pointer(event)[0]));

      // Manipulation to keep tooltip within frame
      let l = x(d3.timeParse("%Y-%m-%d")(approximateDate(new Date(dataset[i].date)))) - tooltip.clientWidth / 2 + margin.left;
      let t = y(dataset[i].streams) + margin.top - tooltip.clientHeight - 25;
      t += document.querySelector(`#popup-${type}-graph .preference-panel`).clientHeight;
      l = l < 0 ? 0 : l;
      l = l + tooltip.clientWidth > width ? l - tooltip.clientWidth / 2 : l;
      t = t < 0 ? y(dataset[i].streams) + margin.top + tooltip.clientHeight - 25 : t;

      tooltip.style.display = "inline-block";
      tooltip.style.opacity = "1";
      tooltip.style.position = "absolute";
      tooltip.style.left = `${l}px`
      tooltip.style.top = `${t}px`;
      tooltip.innerHTML = `<span><strong>Date</strong>: ${approximateDate(new Date(dataset[i].date))}</span><br/><span><strong>Streams</strong>: ${dataset[i].streams}</span>`;

      d3.select(`#popup-${type}-graph-svg .tooltip-point`).style('opacity', 1)
        .attr('cx', x(d3.timeParse("%Y-%m-%d")(approximateDate(new Date(dataset[i].date)))))
        .attr('cy', y(dataset[i].streams))
    }

    function pointerleft() {
      document.querySelector(`#popup-${type}-graph-svg .tooltip-point`).style.opacity = "0";
      tooltip.style.opacity = "0";
      sleep(300).then(() => tooltip.style.display = "none");
    }
  }
}

// Returns simplified string representation of date (yyyy-mm-dd)
function approximateDate(d) {
  return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
}

// Delay function (like Thread.sleep)
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
