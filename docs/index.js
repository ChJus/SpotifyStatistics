// Global variables and constants
let EXCEEDED_REQUEST_LIMIT = false;
let QUERY_RATE_PER_SECOND = 10.0;
let processedData, data;

// API
let i1 = "NmQyMDhlNGY3NzZiNGMxNmI0ODk2M2NkMTEwZWQwODQ=", i2 = "YWIyMTQ3MGIzN2VkNGFlYmI2NjY4Y2NlMjRmZDQyMDM="
i1 = atob(i1);
i2 = atob(i2);

// localStorage helper cache functions
const serialize = (value) => JSON.stringify(value, stringifyReplacer);
const deserialize = async (text) => JSON.parse(text, parseReviver);

// Initial visibility is hidden for download (waits until file is uploaded)
document.querySelector("#download").addEventListener("click", download);
document.querySelector("#download").style.display = "none";

// Add event listeners to time frequency range buttons
document.querySelectorAll("#settings button").forEach(button => {
  button.addEventListener("click", async (e) => {
    // Only highlight selected range (acts as toggle, similar to radio button group)
    document.querySelectorAll("#settings button").forEach(button => {
      button.classList.remove("active");
    });
    e.target.classList.add("active");

    // Get range option by part of button's id (of the form "tab-__")
    let option = e.target.id.split("-")[1];
    let sd, ed; // start date, end date

    // Replace text depending on selected time range
    if (option !== "all") {
      if (!document.querySelector("#overall-songs").parentNode.innerHTML.includes("new")) {
        document.querySelector("#overall-songs").parentNode.innerHTML = document.querySelector("#overall-songs").parentNode.innerHTML.replace(" songs", " new songs");
        document.querySelector("#overall-artists").parentNode.innerHTML = document.querySelector("#overall-artists").parentNode.innerHTML.replace(" artists", " new artists");
      }
    } else {
      document.querySelector("#overall-songs").parentNode.innerHTML = document.querySelector("#overall-songs").parentNode.innerHTML.replace(" new songs", " songs");
      document.querySelector("#overall-artists").parentNode.innerHTML = document.querySelector("#overall-artists").parentNode.innerHTML.replace(" new artists", " artists");
    }

    // Update dashboard based on date range
    switch (option) {
      case "all":
        sd = processedData.startDate;
        ed = processedData.endDate;
        break;
      case "1y":
        sd = new Date(processedData.endDate);
        sd.setDate(sd.getDate() - 365); // one year := 365 days here
        ed = processedData.endDate;
        break;
      case "6m":
        sd = new Date(processedData.endDate);
        sd.setDate(sd.getDate() - 180); // 6 months
        ed = processedData.endDate;
        break;
      case "3m":
        sd = new Date(processedData.endDate);
        sd.setDate(sd.getDate() - 90); // 3 months
        ed = processedData.endDate;
        break;
      case "ytd": // 'Year to date' (from Jan 1st of year of last streaming entry)
        sd = new Date(`${new Date(processedData.endDate).getFullYear()}-1-1`);
        ed = processedData.endDate;
        break;
      case "mtd": // 'Month to date' (from start of month of last streaming entry)
        sd = new Date(`${new Date(processedData.endDate).getFullYear()}-${new Date(processedData.endDate).getMonth() + 1}-1`);
        ed = processedData.endDate;
        break;
    }
    await refreshDashboard(processedData, sd, ed);
  })
})

// Obtain credentials for API calls
await login();

// Check if there is data cached in localStorage
if (localStorage.hasOwnProperty("data")) {
  document.querySelector("#popup-container").style.display = "none";
  processedData = await deserialize(localStorage.getItem("data"));
  document.querySelector("#download").style.display = "inline-block";
  await refreshDashboard(processedData, processedData.startDate, processedData.endDate);
}

// Code for handling file selectors
// First time users use this popup file selector to select the data file
document.querySelector("#popup-file").accept = "application/json,text/plain";
document.querySelector("#popup-file").addEventListener("change", async (e) => {
  document.querySelector("#download").style.display = "none";
  // Get file and read text
  let file = e.target.files.item(0);
  let text = await file.text();

  // todo: error handling
  // Handle .json (todo: turn into .zip) of data from Spotify
  if (file.type === "application/json") {
    await readData(text);
    processedData = await summaryStatistics(data);
    localStorage.setItem("data", serialize(processedData));
  } else { // todo: error handle, alternatively, upload a .txt file with data downloaded from this site using the download functionality
    processedData = await deserialize(text);
    localStorage.setItem("data", text);
  }
  await refreshDashboard(processedData, processedData.startDate, processedData.endDate);
  document.querySelector("#popup-container").style.display = "none";
  document.querySelector("#download").style.display = "inline-block";
});

// Users use this selector to update data by uploading either data from Spotify or from this site
document.querySelector("#file").accept = "application/json,text/plain";
document.querySelector("#file").addEventListener("change", async (e) => {
  let file = e.target.files.item(0);
  let text = await file.text();
  if (file.type === "application/json") {
    await readData(text);
    processedData = await summaryStatistics(data);
    localStorage.setItem("data", serialize(processedData));
  } else {
    processedData = await deserialize(text);
    localStorage.setItem("data", text);
  }

  // remove overall graphs so when refreshDashboard is called, graphs are replaced with new data
  // the removal is important as the graph function will check if there are existing svg elements
  // (if there are, only the date range of the functions will change; *data* won't change)
  document.querySelector("#overall-graphs svg").remove();

  await refreshDashboard(processedData, processedData.startDate, processedData.endDate);
  document.querySelector("#download").style.display = "inline-block";
});

// Parse data from Spotify
async function readData(text) {
  data = await JSON.parse(text);

  // Set fundamental attribute (stream date-time)
  for (let i = 0; i < data.length; i++) {
    data[i].endTime = new Date(data[i].endTime);
  }

  // Remove all streams that were less than 30s (clean data)
  for (let i = data.length - 1; i >= 0; i--) {
    if (data[i].msPlayed < 30000) {
      data.splice(i, 1);
    }
  }
}

/*
* Obtain summary statistics from data file and Spotify API.
* NOTE: this process is done in *five* steps:
* 1. Go through data file and create initial list of unique songs.
*    Initialize each entry with attributes msPlayed, streamHistory.
*    Place this song entry into the songStats Map (where key is a string hash based on
*    a string concatenation of the track's name and artists).
*    Also, modify the uniqueSongs map, which represents a cumulative count of unique
*    songs over time stored with unique dates as keys.
* 2. Loop through each unique song and work with Spotify API. Obtain information about
*    the song's spotifyID, duration, image, and artists. Also, assemble a list of unique
*    artists, and initialize fields spotifyID, duration, and image. Modify uniqueArtists map
*    to represent cumulative unique artists over time.
* 3. Run through each artist and search for their metadata using Spotify API.
* 4. Run through streaming data again and this time update streamingHistory for each song and artist.
*    Also create list of cumulative streams and time by date.
* 5. Obtain more song information from API (e.g., acousticness)
* */
async function summaryStatistics(data) {
  document.querySelector("#progress-container").style.display = "block";
  document.querySelector("#popup-progress-container").style.display = "block";

  let prevD = new Date(approximateDate(data[0].endTime));
  prevD.setDate(prevD.getDate() - 1);

  let endD = new Date(approximateDate(data[data.length - 1].endTime));
  endD.setDate(endD.getDate() + 1);

  let result = {
    history: new Map([[prevD, {date: prevD, msPlayed: 0, streams: 0}]]),
    uniqueSongs: new Map([[approximateDate(prevD), {date: approximateDate(prevD), count: 0}]]),
    uniqueArtists: new Map([[approximateDate(prevD), {date: approximateDate(prevD), count: 0}]]),
    artistStats: new Map(),
    songStats: new Map(),
    accountAge: 0, // in days
    activeDays: [],
    startDate: prevD,
    endDate: endD,
  };

  data.forEach((e) => {
    if (!result.songStats.has(stringHash(e.trackName + e.artistName))) {
      let song = structuredClone(e);

      if ([...result.uniqueSongs.values()][result.uniqueSongs.size - 1].date === approximateDate(song.endTime)) {
        result.uniqueSongs.get(approximateDate(song.endTime)).count++;
      } else {
        result.uniqueSongs.set(approximateDate(song.endTime), {
          date: approximateDate(song.endTime),
          count: [...result.uniqueSongs.values()][result.uniqueSongs.size - 1].count + 1
        });
      }

      song.msPlayed = 0;
      song.streams = 0;
      song.streamHistory = [{date: prevD, msPlayed: 0, streams: 0}];
      song.internalID = stringHash(e.trackName + e.artistName);
      result.songStats.set(stringHash(e.trackName + e.artistName), song);
    }
  });

  let counter = 0;
  document.querySelector("#progress").max = result.songStats.size;
  document.querySelector("#popup-progress").max = result.songStats.size;
  for (let [i, s] of result.songStats) {
    if (EXCEEDED_REQUEST_LIMIT) { // Stop immediately if we hit 429 exceeded request limit.
      break;
    }
    httpGetAsync("https://api.spotify.com/v1/search?q=" + encodeURIComponent("artist:" + s.artistName + " track:" + s.trackName) + "&type=track&limit=1", (t) => {
      if (JSON.parse(t)["tracks"]["items"].length === 0) { // Delete tracks if they can't be found through Spotify API search (e.g., user tracks)
        result.songStats.delete(i);
        document.querySelector("#progress").max = result.songStats.size;
        document.querySelector("#popup-progress").max = result.songStats.size;
        counter--;
        return;
      }

      let track = JSON.parse(t)["tracks"]["items"][0];
      s.spotifyID = track.id;
      s.duration = track["duration_ms"];
      s.artists = new Set();
      if (track["album"]["images"].length > 0) {
        s.image = track["album"]["images"][0]["url"];
      } else {
        s.image = null;
      }
      for (let iter = 0; iter < track["artists"].length; iter++) {
        if (!result.artistStats.has(track["artists"][iter]["name"])) {
          result.artistStats.set(track["artists"][iter]["name"], {
            name: track["artists"][iter]["name"],
            msPlayed: 0,
            songs: new Set(),
            streams: 0,
            streamHistory: [{date: prevD, msPlayed: 0, streams: 0}]
          });

          if ([...result.uniqueArtists.values()][result.uniqueArtists.size - 1].date === approximateDate(s.endTime)) {
            result.uniqueArtists.get(approximateDate(s.endTime)).count++;
          } else {
            result.uniqueArtists.set(approximateDate(s.endTime), {
              date: approximateDate(s.endTime),
              count: [...result.uniqueArtists.values()][result.uniqueArtists.size - 1].count + 1
            });
          }
        }
        s.artists.add(track["artists"][iter]["name"]);
        result.artistStats.get(track["artists"][iter]["name"]).songs.add(s.internalID);
      }
      delete s.artistName;
    });
    document.querySelector("#progress").value = ++counter;
    document.querySelector("#popup-progress").value = counter;
    document.querySelector("#progress-label").innerText = `Importing track ${counter} of ${result.songStats.size} [${Math.round(100.0 * counter / result.songStats.size)}%]`;
    document.querySelector("#popup-progress-label").innerText = `Importing track ${counter} of ${result.songStats.size} [${Math.round(100.0 * counter / result.songStats.size)}%]`;
    await sleep(1000 / QUERY_RATE_PER_SECOND);
  }

  counter = 0;
  document.querySelector("#progress").max = result.artistStats.size;
  document.querySelector("#popup-progress").max = result.artistStats.size;
  for (let [i, a] of result.artistStats) {
    if (EXCEEDED_REQUEST_LIMIT) {
      break;
    }
    httpGetAsync("https://api.spotify.com/v1/search?q=" + encodeURIComponent("artist:" + a.name) + "&type=artist&limit=1", (t) => {
      if (JSON.parse(t)["artists"]["items"].length === 0) {
        result.artistStats.delete(i);
        document.querySelector("#progress").max = result.artistStats.size;
        document.querySelector("#popup-progress").max = result.artistStats.size;
        counter--;
        return;
      }
      let artist = JSON.parse(t)["artists"]["items"][0];
      a.spotifyID = artist.id;
      if (artist["images"].length > 0) {
        a.image = artist["images"][0]["url"];
      } else {
        a.image = null;
      }
    });
    document.querySelector("#progress").value = ++counter;
    document.querySelector("#progress-label").innerText = `Importing artist ${counter} of ${result.artistStats.size} [${Math.round(100.0 * counter / result.artistStats.size)}%]`;
    document.querySelector("#popup-progress").value = counter;
    document.querySelector("#popup-progress-label").innerText = `Importing artist ${counter} of ${result.artistStats.size} [${Math.round(100.0 * counter / result.artistStats.size)}%]`;
    await sleep(1000 / QUERY_RATE_PER_SECOND);
  }

  document.querySelector("#progress-label").innerText = `Loading...`;
  document.querySelector("#popup-progress-label").innerText = `Loading...`;

  data.forEach((e) => {
    let temp = result.songStats.get(stringHash(e.trackName + e.artistName));
    if (temp === undefined) return;
    temp.msPlayed += e.msPlayed;
    temp.streams += Math.ceil(e.msPlayed / temp.duration);
    temp.streamHistory.push({date: e.endTime, msPlayed: temp.msPlayed, streams: temp.streams});
    delete temp.endTime;
    result.songStats.set(stringHash(e.trackName + e.artistName), temp);

    result.history.set(e.endTime, {
      date: e.endTime,
      msPlayed: e.msPlayed + [...result.history.values()][result.history.size - 1].msPlayed,
      streams: Math.ceil(e.msPlayed / temp.duration) + [...result.history.values()][result.history.size - 1].streams
    });
    let artists = [...temp.artists];
    for (let k = 0; k < artists.length; k++) {
      temp = result.artistStats.get(artists[k]);
      if (temp === undefined) continue;
      temp.msPlayed += e.msPlayed;
      temp.streams += Math.ceil(e.msPlayed / result.songStats.get(stringHash(e.trackName + e.artistName)).duration);
      temp.streamHistory.push({date: e.endTime, msPlayed: temp.msPlayed, streams: temp.streams});

      result.artistStats.set(artists[k], temp);
    }
  });

  let songIDList = Array.from(result.songStats.keys());
  let songList = Array.from(result.songStats.values());
  for (let i = 0; i < songList.length; i += 50) {
    if (EXCEEDED_REQUEST_LIMIT) {
      break;
    }
    let idList = "";
    for (let j = 0; j < Math.min(songList.length - i, 50); j++) {
      idList += songList[i + j].spotifyID + (j + 1 === Math.min(songList.length - i * 50, 50) ? "" : ",");
    }
    httpGetAsync("https://api.spotify.com/v1/audio-features?ids=" + encodeURIComponent(idList), (t) => {
      let req = JSON.parse(t)["audio_features"];
      for (let j = 0; j < Math.min(songIDList.length - i, 50); j++) {
        let track = result.songStats.get(songIDList[i + j]);
        track.acousticness = req[j]["acousticness"];
        track.danceability = req[j]["danceability"];
        track.energy = req[j]["energy"];
        track.instrumentalness = req[j]["instrumentalness"];
        track.key = req[j]["key"];
        track.speechiness = req[j]["speechiness"];
        track.tempo = req[j]["tempo"];
        track.time_signature = req[j]["time_signature"];
        track.valence = req[j]["valence"];
        result.songStats.set(songIDList[i + j], track);
      }
    });
    await sleep(1000 / QUERY_RATE_PER_SECOND);
  }

  // Other useful information
  result.activeDays = new Set(data.map(d => approximateDate(d.endTime)));
  result.accountAge = Math.round((result.endDate - result.startDate) / (1000.0 * 3600.0 * 24.0));

  document.querySelector("#progress-container").style.display = "none";
  document.querySelector("#popup-progress-container").style.display = "none";
  return result;
}

// Resize graphs with timeout to avoid lagging and abundantly refreshing interface
let windowResizeTimeout = null;
window.addEventListener('resize', async () => {
  if (windowResizeTimeout) clearTimeout(windowResizeTimeout);
  windowResizeTimeout = setTimeout(() => {
    document.querySelector("#settings .tab.active").click();
  }, 50);
}, true);

// Update graphs on change of grouping preference
document.querySelector("#overall-graphs-group-preference").addEventListener("change", (e) => {
  document.querySelector("#settings .tab.active").click();
})

// Update all information displays based on data and time range
async function refreshDashboard(d, dateMin, dateMax) {
  // todo: see if can find way to efficiently find unique songs in range of time
  // todo: serialize with short field names, consider converting all ms to minutes
  // todo: handle case where storage overflows 5MB.
  // todo: tabs to switch between feature (top artists/songs, graphs)
  let data = structuredClone(d); // avoid modifying computed data

  // Get simplified date (date at midnight, equivalently the simple date 'yyyy-mm-dd')
  let min = new Date(approximateDate(new Date(dateMin))), max = new Date(approximateDate(new Date(dateMax)));

  // Format for displayed dates
  let dateFormat = {year: 'numeric', month: 'long', day: 'numeric'};

  // _actual_ account age information (recall that for computational simplicity, was set
  // to day before first stream and day after last stream respectively)
  let born = new Date(dateMax), upTo = new Date(dateMax);
  born.setDate(born.getDate() - data.accountAge + 1);
  upTo.setDate(upTo.getDate() - 1)

  document.querySelector("#profile-right #lifespan").innerText = born.toLocaleDateString("en-US", dateFormat) + " — " + upTo.toLocaleDateString("en-US", dateFormat);

  // Display summary information
  document.querySelector("#overall #overall-minutes").innerText = commafy(Math.round(([...data.history.values()][getLaterDate([...data.history.keys()], max)].msPlayed - [...data.history.values()][getEarlierDate([...data.history.keys()], min)].msPlayed) / 1000.0 / 60.0));
  document.querySelector("#overall #overall-streams").innerText = commafy([...data.history.values()][getLaterDate([...data.history.keys()], max)].streams - [...data.history.values()][getEarlierDate([...data.history.keys()], min)].streams);
  document.querySelector("#overall #overall-songs").innerText = commafy([...data.uniqueSongs.values()][getLaterDate([...data.uniqueSongs.keys()], max)].count - [...data.uniqueSongs.values()][getEarlierDate([...data.uniqueSongs.keys()], min)].count);
  document.querySelector("#overall #overall-artists").innerText = commafy([...data.uniqueArtists.values()][getLaterDate([...data.uniqueArtists.keys()], max)].count - [...data.uniqueArtists.values()][getEarlierDate([...data.uniqueArtists.keys()], min)].count);
  document.querySelector("#overall #overall-days").innerText = `${commafy(getLaterDate([...data.activeDays], max) - getEarlierDate([...data.activeDays], min))} / ${commafy(Math.min(data.accountAge, Math.round((max - min) / (1000.0 * 3600.0 * 24.0))))}`;
  document.querySelector("#overall #overall-avg-session").innerText = `${commafy(Math.ceil(parseFloat(document.querySelector("#overall #overall-minutes").innerText.replaceAll(",", "")) / (getLaterDate([...data.activeDays], max) - getEarlierDate([...data.activeDays], min))))}`;

  // Check on graphs (may update range and/or data)
  refreshGraphs(data, min, max);

  // Get list of artists and songs sorted by streaming time
  // todo: allow option to sort by stream count
  let sortedArtists = [...data.artistStats.values()].toSorted((a, b) => {
    return getStreamStats(b, "msPlayed", min, max) - getStreamStats(a, "msPlayed", min, max)
  });
  let sortedSongs = [...data.songStats.values()].toSorted((a, b) => {
    return getStreamStats(b, "msPlayed", min, max) - getStreamStats(a, "msPlayed", min, max)
  });

  let templateArtists = document.querySelector("#favorites-artists-row-template").content;
  let templateSongs = document.querySelector("#favorites-songs-row-template").content;

  // Remove all rows (except for headers) to prepare for adding rows
  let remove = document.querySelectorAll("#favorites-artists-table > tr");
  let remove2 = document.querySelectorAll("#favorites-songs-table > tr");
  for (let i = remove.length - 1; i >= 0; i--) {
    remove[i].parentNode.removeChild(remove[i]);
    remove2[i].parentNode.removeChild(remove2[i]);
  }

  // Display top 50 songs and artists
  for (let i = 0; i < 50; i++) {
    templateArtists.querySelectorAll("tr td")[0].innerText = `${(i + 1)}`;
    templateArtists.querySelector(".img-div img").src = `${sortedArtists[i].image !== null ? sortedArtists[i].image : ''}`;
    templateArtists.querySelector(".text-main").innerText = `${sortedArtists[i].name}`;
    templateArtists.querySelector(".text-sub").innerText = `${commafy(Math.round(getStreamStats(sortedArtists[i], "msPlayed", min, max) / 1000.0 / 60.0))} minutes | ${commafy(getStreamStats(sortedArtists[i], "streams", min, max))} streams`;

    // Add event listener to display popup on click, and append to DOM
    let item = document.importNode(templateArtists.querySelector("tr"), true);
    item.addEventListener("click", () => moreInfo("artist", data, sortedArtists[i].name));
    document.querySelector("#favorites-artists-table").appendChild(item);

    templateSongs.querySelectorAll("tr td")[0].innerText = `${(i + 1)}`;
    templateSongs.querySelector(".img-div img").src = `${sortedSongs[i].image !== null ? sortedSongs[i].image : ''}`;
    templateSongs.querySelector(".text-main").innerText = `${sortedSongs[i].trackName}`;
    templateSongs.querySelector(".text-sub").innerText = `${commafy(Math.round(getStreamStats(sortedSongs[i], "msPlayed", min, max) / 1000.0 / 60.0))} minutes | ${commafy(getStreamStats(sortedSongs[i], "streams", min, max))} streams`;

    item = document.importNode(templateSongs.querySelector("tr"), true);
    item.addEventListener("click", () => moreInfo("song", data, sortedSongs[i].internalID));
    document.querySelector("#favorites-songs-table").appendChild(item);
  }
}

function refreshGraphs(data, min, max) {
  refreshOverallStreamsGraph(data, min, max);
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
      group = d3.utcFormat("%j %Y");
      break;
    case "w":
      group = d3.utcFormat("%U %Y");
      break;
    case "m":
      group = d3.utcFormat("%m %Y");
      break;
  }

  let nest = [...d3.group(dataset, d => group(new Date(d.date))).values()];
  dataset = [];
  for (let i = 1; i < nest.length; i++) {
    dataset.push({
      date: new Date(approximateDate(new Date(nest[i][nest[i].length - 1].date))),
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
  let x = d3.scaleUtc().range([0, width]);
  let xAxis = d3.axisBottom().scale(x).ticks(width / 80);

  let y = d3.scaleLinear().range([height, 0]);
  let yAxis = d3.axisLeft().scale(y).ticks(height / 40);

  // If the graphs exist, just modify their time range
  if (document.querySelector("#overall-graphs svg") !== null) {
    svg = d3.select("#overall-graphs svg")
      .attr("width", width + margin.left + margin.right)
    update(dataset);
  } else {
    svg = d3.select("#overall-graphs")
      .append("svg")
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .attr("id", "overall-stream-count-history")
      .append("g")
      .attr("transform",
        "translate(" + margin.left + "," + margin.top + ")");

    // x-axis
    svg.append("g")
      .attr("transform", "translate(0," + height + ")")
      .attr("class", "x-axis")

    // y-axis
    svg.append("g")
      .attr("class", "y-axis")

    update(dataset)
  }

  // Update function for graph
  function update(data) {
    // x-axis
    x.domain(d3.extent(data, function (d) {
      return d3.utcParse("%Y-%m-%d")(approximateDate(new Date(d.date)))
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
        return d3.utcParse("%Y-%m-%d")(approximateDate(new Date(d.date)))
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
          return x(d3.utcParse("%Y-%m-%d")(approximateDate(new Date(d.date))));
        })
        .y(function (d) {
          return y(d.streams);
        })
      )
      .attr("fill", "none")
      .attr("stroke", "var(--spotify-green)")
      .attr("stroke-width", 1.75)
  }
}

// Get streaming statistics in a time range (as info is stored cumulatively)
function getStreamStats(item, property, min, max) {
  let i = item.streamHistory.findIndex((d) => {
    return new Date(d.date) - new Date(min) >= 0
  });
  i = i >= 0 ? i : 0;
  let j = item.streamHistory.findLastIndex((d) => {
    return new Date(d.date) - new Date(max) <= 0
  });
  j = j >= 0 ? j : item.streamHistory.length - 1;
  return item.streamHistory[j][property] - item.streamHistory[i][property];
}

// History (go back) functionality
let previouslyViewed = [];

// Handle history feature call
document.querySelector("#popup-artist-back-wrapper").addEventListener("click", () => {
  previouslyViewed.pop();
  let item = previouslyViewed.pop();
  moreInfo(item.type, item.data, item.id);
})

document.querySelector("#popup-song-back-wrapper").addEventListener("click", () => {
  previouslyViewed.pop();
  let item = previouslyViewed.pop();
  moreInfo(item.type, item.data, item.id);
})

// Handle close popup
document.querySelector("#popup-artist-close-wrapper").addEventListener("click", () => {
  document.querySelector("#popup-artist-wrapper").style.display = "none";
  document.querySelector("#popup-song-wrapper").style.display = "none";
})

document.querySelector("#popup-song-close-wrapper").addEventListener("click", () => {
  document.querySelector("#popup-artist-wrapper").style.display = "none";
  document.querySelector("#popup-song-wrapper").style.display = "none";
})

// Display popup information
function moreInfo(type, data, id) {
  if (previouslyViewed.length > 0) { // Only allow go-back button if there _is_ history
    document.querySelector(`#popup-${type}-back-wrapper`).style.display = "block";
  } else {
    document.querySelector(`#popup-${type}-back-wrapper`).style.display = "none";
  }

  // Push to history if not duplicate of most recent item
  if ((previouslyViewed.length > 0 && previouslyViewed[previouslyViewed.length - 1].id !== id) || previouslyViewed.length === 0) {
    previouslyViewed.push({type: type, data: data, id: id})
  }

  // Display information (artist | song)
  if (type === "artist") {
    let artist = data.artistStats.get(id);
    if (artist === undefined) return;

    document.querySelector("#popup-artist-wrapper").style.display = "flex";
    document.querySelector("#popup-song-wrapper").style.display = "none";
    document.querySelector("#popup-artist-left-image-wrapper img").src = `${artist.image !== null ? artist.image : ''}`;
    document.querySelector("#popup-artist-name").innerText = `${artist.name}`;
    document.querySelector("#popup-artist-stats").innerText = `${commafy(Math.round(getStreamStats(artist, "msPlayed", data.startDate, data.endDate) / 1000.0 / 60.0))} minutes | ${commafy(getStreamStats(artist, "streams", data.startDate, data.endDate))} streams`;

    let remove = document.querySelectorAll("#popup-songs-table > tr");
    for (let i = remove.length - 1; i >= 0; i--) {
      remove[i].parentNode.removeChild(remove[i]);
    }

    let templateSongs = document.querySelector("#popup-songs-row-template").content;
    let sortedSongs = [...structuredClone(artist.songs)];
    sortedSongs.sort((a, b) => {
      return getStreamStats(data.songStats.get(b), "msPlayed", data.startDate, data.endDate) - getStreamStats(data.songStats.get(a), "msPlayed", data.startDate, data.endDate)
    })

    for (let i = 0; i < sortedSongs.length; i++) {
      let song = data.songStats.get(sortedSongs[i]);
      templateSongs.querySelectorAll("tr td")[0].innerText = `${(i + 1)}`;
      templateSongs.querySelector(".img-div img").src = `${song.image !== null ? song.image : ''}`;
      templateSongs.querySelector(".text-main").innerText = `${song.trackName}`;
      templateSongs.querySelector(".text-sub").innerText = `${commafy(Math.round(getStreamStats(song, "msPlayed", data.startDate, data.endDate) / 1000.0 / 60.0))} minutes | ${commafy(getStreamStats(song, "streams", data.startDate, data.endDate))} streams`;
      let item = document.importNode(templateSongs.querySelector("tr"), true);
      item.addEventListener("click", () => moreInfo("song", data, song.internalID));
      document.querySelector("#popup-songs-table").appendChild(item);
    }
  } else {
    let song = data.songStats.get(id);
    if (song === undefined) return;

    document.querySelector("#popup-song-artists").innerHTML = "";
    let span = document.createElement("span");
    span.innerHTML = ", ";
    for (let i = 0; i < song.artists.size; i++) {
      let element = document.createElement("a");
      element.innerHTML = [...song.artists][i];
      element.addEventListener("click", () => {
        moreInfo("artist", data, [...song.artists][i])
      });
      document.querySelector("#popup-song-artists").appendChild(element);
      if (i !== song.artists.size - 1) {
        document.querySelector("#popup-song-artists").appendChild(span.cloneNode(true));
      }
    }

    document.querySelector("#popup-song-wrapper").style.display = "flex";
    document.querySelector("#popup-artist-wrapper").style.display = "none";
    document.querySelector("#popup-song-left-image-wrapper img").src = `${song.image !== null ? song.image : ''}`;
    document.querySelector("#popup-song-name").innerText = `${song.trackName}`;
    document.querySelector("#popup-song-stats").innerText = `${commafy(Math.round(getStreamStats(song, "msPlayed", data.startDate, data.endDate) / 1000.0 / 60.0))} minutes | ${commafy(getStreamStats(song, "streams", data.startDate, data.endDate))} streams`;
    document.querySelector("#song-acousticness").innerText = `${song.acousticness}`;
    document.querySelector("#song-danceability").innerText = `${song.danceability}`;
    document.querySelector("#song-energy").innerText = `${song.energy}`;
    document.querySelector("#song-speechiness").innerText = `${song.speechiness}`;
    document.querySelector("#song-valence").innerText = `${song.valence}`;
    document.querySelector("#song-tempo").innerText = `${Math.round(song.tempo)}`;
    if (song.key === -1) {
      document.querySelector("#song-key").style.display = "none";
    } else {
      document.querySelector("#song-key").style.display = "block";
      let keys = ['C', 'C#/D♭', 'D', 'D#/E♭', 'E', 'E#/F♭', 'F', 'F#/G♭', 'G', 'G#/A♭', 'A', 'A#/B♭', 'B', 'B#/C♭'];
      document.querySelector("#song-key").innerText = `${keys[song.key]}`;
    }
    document.querySelector("#song-time-signature").innerText = `${song.time_signature}/4`;

    // Color-code [0, 1] values based on their meaning.
    let inferno = d3.scaleSequential(d3.interpolateInferno);
    let color = hexToRgb(inferno(song.energy));
    let sf = 255.0 / ((color.r + color.g + color.b) / 3.0);
    color = redistribute(color, sf * 0.93);
    document.querySelector("#song-energy").parentNode.style.color = `${contrastAdjust(hexToRgb(inferno(song.energy)))}`;
    document.querySelector("#song-energy").parentNode.style.backgroundColor = `rgb(${color.r}, ${color.g}, ${color.b})`;

    let valence = d3.interpolateViridis;
    color = hexToRgb(valence(song.valence));
    sf = 255.0 / ((color.r + color.g + color.b) / 3.0);
    color = redistribute(color, sf * 0.93);
    document.querySelector("#song-valence").parentNode.style.color = `${valence(song.valence)}`;
    document.querySelector("#song-valence").parentNode.style.backgroundColor = `rgb(${color.r}, ${color.g}, ${color.b})`;

    document.querySelector("#song-acousticness").parentNode.style.opacity = `${0.6 + song.acousticness * 0.4}`;
    document.querySelector("#song-danceability").parentNode.style.opacity = `${0.6 + song.danceability * 0.4}`;
    document.querySelector("#song-speechiness").parentNode.style.opacity = `${0.6 + song.speechiness * 0.4}`;
  }
}

// Helper functions
// Make foreground color darker if it's too bright.
function contrastAdjust(color) {
  if ((color.r + color.g + color.b) / 3.0 > 150) {
    color.r *= 0.7;
    color.g *= 0.7;
    color.b *= 0.7;
  }
  return `rgb(${color.r}, ${color.g}, ${color.b})`;
}

// Helper function to avoid color saturation when modifying color brightness
function redistribute(c, sf) {
  let r = c.r * sf, g = c.g * sf, b = c.b * sf;
  let threshold = 255.999;
  let m = Math.max(r, g, b)
  if (m <= threshold) {
    return {r: Math.floor(r), g: Math.floor(g), b: Math.floor(b)}
  }
  let total = r + g + b
  if (total >= 3 * threshold) {
    return {r: Math.floor(threshold), g: Math.floor(threshold), b: Math.floor(threshold)}
  }
  let x = (3 * threshold - total) / (3 * m - total)
  let gray = threshold - x * m
  return {r: Math.floor(gray + x * r), g: Math.floor(gray + x * g), b: Math.floor(gray + x * b)}
}

// Convert hex string (#DDDDDD) to rgb {r: , g: , b: }
function hexToRgb(hex) {
  let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

// Make displayed numbers 'nicer' by adding commas, supports decimals
function commafy(x) {
  return x.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",");
}

// Gets the index of the first date in an array that is earlier than a given date
function getEarlierDate(arr, date) {
  let i = arr.findIndex((d) => {
    return new Date(d) - new Date(date) >= 0
  });
  return i >= 0 ? i : 0;
}

// Gets the index of the first date in an array that is later than a given date
function getLaterDate(arr, date) {
  let index = arr.findLastIndex((d) => {
    return new Date(d) - new Date(date) <= 0
  });
  return index >= 0 ? index : arr.length - 1;
}

// Returns simplified string representation of date (yyyy-mm-dd)
function approximateDate(d) {
  return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
}

// Converts string to a hash
function stringHash(string) {
  let hash = 0;
  if (string.length === 0) return hash;
  for (let i = 0; i < string.length; i++) {
    let char = string.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }

  return hash;
}

// API requests helper
function httpGetAsync(theUrl, callback) {
  let xmlHttp = new XMLHttpRequest();
  xmlHttp.open("GET", theUrl, true); // true for asynchronous
  xmlHttp.setRequestHeader("Authorization", "Bearer " + localStorage.getItem("token"));
  xmlHttp.send(null);

  xmlHttp.onreadystatechange = async function () {
    if (xmlHttp.readyState === 4 && xmlHttp.status === 200) {
      callback(xmlHttp.responseText);
    } else if (xmlHttp.status === 429) {
      console.error(xmlHttp.status, ":\n", xmlHttp.responseText);
      EXCEEDED_REQUEST_LIMIT = true;
      window.alert("Exceeded API request limit, please try again later.");
      await sleep(2000);
    }
  }
}

// Delay function (like Thread.sleep)
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Obtain temporary API credentials
function login() {
  let xmlHttp = new XMLHttpRequest();
  xmlHttp.open("POST", "https://accounts.spotify.com/api/token", true); // true for asynchronous
  xmlHttp.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
  xmlHttp.send(`grant_type=client_credentials&client_id=${i1}&client_secret=${i2}`);

  xmlHttp.onreadystatechange = function () {
    if (xmlHttp.readyState === 4 && xmlHttp.status === 200) {
      localStorage.setItem("token", JSON.parse(xmlHttp.responseText)["access_token"]);
      return true;
    }
  }
}

// Download computed data (which user can upload to analyze)
function download() {
  let blob = new Blob([serialize(processedData)], {type: "text/plain;charset=utf-8"});
  saveAs(blob, "data.txt");
}

// Helper function to stringify/json-fy Maps and Sets (which aren't supported)
function stringifyReplacer(key, value) {
  if (typeof value === "object" && value !== null) {
    if (value instanceof Map) {
      return {
        _meta: {type: "map"},
        value: Array.from(value.entries()),
      };
    } else if (value instanceof Set) {
      return {
        _meta: {type: "set"},
        value: Array.from(value.values()),
      };
    } else if ("_meta" in value) {
      return {
        ...value,
        _meta: {
          type: "escaped-meta",
          value: value["_meta"],
        },
      };
    }
  }
  return value;
}

// Helper function to stringify/serialize computed data
function parseReviver(key, value) {
  if (typeof value === "object" && value !== null) {
    if ("_meta" in value) {
      if (value._meta.type === "map") {
        return new Map(value.value);
      } else if (value._meta.type === "set") {
        return new Set(value.value);
      } else if (value._meta.type === "escaped-meta") {
        return {
          ...value,
          _meta: value._meta.value,
        };
      } else {
        console.warn("Unexpected meta", value._meta);
      }
    }
  }
  return value;
}