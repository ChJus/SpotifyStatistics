import * as INDEX from "./index.js"

// Resize graphs with timeout to avoid lagging and abundantly refreshing interface
let windowResizeTimeout = null;
window.addEventListener('resize', async () => {
  if (windowResizeTimeout) clearTimeout(windowResizeTimeout);
  windowResizeTimeout = setTimeout(() => {
    document.querySelector("#settings .tab.active").click();
  }, 50);
}, true);

// Update graphs on change of grouping preference
document.querySelector("#overall-graphs-group-preference").onchange = () => document.querySelector("#settings .tab.active").click();
document.querySelector("#oneD-song-genre-factor").onchange = () => document.querySelector("#settings .tab.active").click()

export function refreshGraphs(data, min, max) {
  refreshOverallStreamsGraph(data, min, max);
  refreshTimeOfDayGraph(data, min, max);
  refreshDayOfWeekGraph(data, min, max);
  refreshGenreAnalysisGraph(data);
}

export function refreshOverallStreamsGraph(data, min, max) {
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

export function refreshGenreAnalysisGraph(data) {
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

export function refreshTimeOfDayGraph(data, min, max) {
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

export function refreshDayOfWeekGraph(data, min, max) {
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
  let margin = {top: 10, right: 30, bottom: 30, left: 50},
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
