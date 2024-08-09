import * as GRAPH from "./graph.js";

// Global variables and constants
let EXCEEDED_REQUEST_LIMIT = false;
let QUERY_RATE_PER_SECOND = 6.0;
let db; // global indexedDB instance
export let processedData, data;

// API
let i1 = "ZjI1MjU4NzBkNzQ3NDk2NDg4MDk5NDE2MmIyODkzYzQ=", i2 = "YzhhMzc3MTk1NThmNGI0NTg4MmM2ZGNkODNjOTEzNmU="
i1 = atob(i1);
i2 = atob(i2);

// indexedDB helper cache functions
const serialize = async (value) => JSON.stringify(value, stringifyReplacer);
const deserialize = async (text) => JSON.parse(text, parseReviver);

// Initial visibility is hidden for download (waits until file is uploaded)
document.querySelector("#download").onclick = download;
document.querySelector("#download").style.display = "none";

// Add event listeners to time frequency range buttons
document.querySelectorAll("#settings button").forEach(button => {
  button.onclick = (e) => {
    // Only highlight selected range (acts as toggle, similar to radio button group)
    document.querySelectorAll("#settings button").forEach(button => {
      button.classList.remove("active");
    });
    e.target.classList.add("active");

    // Get range option by part of button's id (of the form "tab-__")
    let option = e.target.id.split("-")[1];

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

    let [sd, ed] = getDateRange(); // start date, end date
    refreshDashboard(processedData, sd, ed);
  }
})

export function getDateRange() {
  let option = document.querySelector("#settings .tab.active").id.split("-")[1];
  let sd, ed;
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
  return [sd, ed];
}

// Obtain credentials for API calls
login();

// Initialize storage system
await init();

async function init() {
  db = await idb.openDB('storage', 1, {
    upgrade(db) {
      db.createObjectStore('data');
    }
  });
}

async function getData() {
  return db.get("data", "data")
}

async function saveData(data) {
  await db.put("data", data, "data")
}

window.addEventListener('unhandledrejection', event => alert("Error: " + event.reason.message));

// Check if there is data cached in indexedDB
if ((await db.get("data", "data"))) {
  processedData = await deserialize(await getData());
  refreshDashboard(processedData, processedData.startDate, processedData.endDate);
  document.querySelector("#popup-container").style.display = "none";
  document.querySelector("#download").style.display = "inline-block";
}

// Code for handling file selectors
// First time users use this popup file selector to select the data file
document.querySelector("#popup-file").accept = "application/json,text/plain,application/zip";
document.querySelector("#popup-file").onchange = async (e) => {
  document.querySelector("#download").style.display = "none";
  await f(e);
};

// Users use this selector to update data by uploading either data from Spotify or from this site
document.querySelector("#file").accept = "application/json,text/plain,application/zip";
document.querySelector("#file").onchange = async (e) => {
  await f(e);
  location.reload();
};

async function f(e) {
  // Get file and read text
  let file = e.target.files.item(0);
  let text = await file.text();
  if (file.type === "application/json") {
    readData(text);
    await summaryStatistics(data);
    await saveData(await serialize(processedData));
  } else if (file.type === "application/zip") {
    let zip = await JSZip.loadAsync(file);
    let filename = [...Object.values(zip.files)].filter(d => d.name.includes(".json"))[0].name;
    let text = await zip.file(filename).async("text");
    readData(text);
    await summaryStatistics(data);
    await saveData(await serialize(processedData));
  } else {
    processedData = await deserialize(text);
    await saveData(text);
  }

  refreshDashboard(processedData, processedData.startDate, processedData.endDate);
  document.querySelector("#popup-container").style.display = "none";
  document.querySelector("#download").style.display = "inline-block";
}

let USERNAME;
// Parse data from Spotify
function readData(text) {
  data = JSON.parse(text);
  USERNAME = data[0].username;

  data = data.filter(d => (d["spotify_track_uri"] !== null) && d["ms_played"] >= 30000);

  // Set fundamental attribute (stream date-time)
  for (let i = 0; i < data.length; i++) {
    data[i].endTime = new Date(Date.parse(data[i].ts));
    data[i].msPlayed = data[i]["ms_played"];
    data[i].spotifyID = data[i]["spotify_track_uri"].replace("spotify:track:","");
    data[i].trackName = data[i]["master_metadata_track_name"];
    data[i].artistName = data[i]["master_metadata_album_artist_name"];

    delete data[i]["conn_country"];
    delete data[i]["episode_name"];
    delete data[i]["episode_show_name"];
    delete data[i]["incognito_mode"];
    delete data[i]["ip_addr_decrypted"];
    delete data[i]["conn_country"];
    delete data[i]["master_metadata_album_album_name"];
    delete data[i]["master_metadata_album_artist_name"];
    delete data[i]["ms_played"];
    delete data[i]["offline"];
    delete data[i]["offline_timestamp"];
    delete data[i]["platform"];
    delete data[i]["reason_end"];
    delete data[i]["reason_start"];
    delete data[i]["shuffle"];
    delete data[i]["skipped"];
    delete data[i]["spotify_episode_uri"];
    delete data[i]["ts"];
    delete data[i]["username"];
    delete data[i]["user_agent_decrypted"];
    delete data[i]["spotify_track_uri"];
    delete data[i]["master_metadata_track_name"];
  }
}

/*
* Obtain summary statistics from data file.
* NOTE: this process is done in several steps:
* 1. Go through streams and create a list of unique songs with initialized
*    fields msPlayed, streams, streamHistory. Update entry in songStats (song statistics list)
*    and uniqueSongs (keeping track of newly discovered songs by time)
* 2. Call Spotify Tracks API, 50 tracks at a time, and obtain track image and artists.
*    Initialize artistStats with artists from songs with fields name, genres, spotifyID,
*    msPlayed, songs, streams, streamHistory.
* 3. Call Spotify Artists API, 50 artists at a time, and obtain profile images.
* 4. Re-run through streaming history (data) and update song and artist statistics
*    (streaming time, streaming count).
* 5. Re-run through songStats and call Spotify Audio Features API for track characteristics.
* 6. Finally, compute general user information (account age, profile image, name, spotifyID)
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

  for (const e of data) {
    if (!result.songStats.has(e.spotifyID)) {
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
      result.songStats.set(e.spotifyID, song);
    }
  }

  let counter = 0;
  document.querySelector("#progress").max = result.songStats.size;
  document.querySelector("#popup-progress").max = result.songStats.size;

  let sid = Array.from(result.songStats.keys());
  let slist = Array.from(result.songStats.values());
  for (let i = 0; i < slist.length; i += 50) {
    if (EXCEEDED_REQUEST_LIMIT) {
      break;
    }
    let idList = "";
    for (let j = 0; j < Math.min(slist.length - i, 50); j++) {
      idList += slist[i + j].spotifyID + (j + 1 === Math.min(slist.length - i, 50) ? "" : ",");
    }
    httpGetAsync("https://api.spotify.com/v1/tracks?ids=" + encodeURIComponent(idList), (t) => {
      let req = JSON.parse(t)["tracks"];
      for (let j = 0; j < Math.min(sid.length - i, 50); j++) {
        let track = result.songStats.get(sid[i + j]);
        track.duration = req[j]["duration_ms"];
        track.artists = new Set();
        if (req[j]["album"]["images"].length > 0) {
          track.image = req[j]["album"]["images"][0]["url"];
        } else {
          track.image = null;
        }

        for (let iter = 0; iter < req[j]["artists"].length; iter++) {
          if (!result.artistStats.has(req[j]["artists"][iter]["id"])) {
            result.artistStats.set(req[j]["artists"][iter]["id"], {
              name: req[j]["artists"][iter]["name"],
              genres: req[j]["artists"][iter]["genres"],
              spotifyID: req[j]["artists"][iter]["id"],
              msPlayed: 0,
              songs: new Set(),
              streams: 0,
              streamHistory: [{date: prevD, msPlayed: 0, streams: 0}]
            });

            if ([...result.uniqueArtists.values()][result.uniqueArtists.size - 1].date === approximateDate(track.endTime)) {
              result.uniqueArtists.get(approximateDate(track.endTime)).count++;
            } else {
              result.uniqueArtists.set(approximateDate(track.endTime), {
                date: approximateDate(track.endTime),
                count: [...result.uniqueArtists.values()][result.uniqueArtists.size - 1].count + 1
              });
            }
          }
          track.artists.add(req[j]["artists"][iter]["id"]);
          result.artistStats.get(req[j]["artists"][iter]["id"]).songs.add(track.spotifyID);
        }
        delete track.artistName;
        result.songStats.set(track.spotifyID, track);

        document.querySelector("#progress").value = ++counter;
        document.querySelector("#popup-progress").value = counter;
        document.querySelector("#progress-label").innerText = `Importing track ${counter} of ${result.songStats.size} [${Math.round(100.0 * counter / result.songStats.size)}%]`;
        document.querySelector("#popup-progress-label").innerText = `Importing track ${counter} of ${result.songStats.size} [${Math.round(100.0 * counter / result.songStats.size)}%]`;
      }
    });

    await sleep(1000 / QUERY_RATE_PER_SECOND);
  }

  counter = 0;
  document.querySelector("#progress").max = result.artistStats.size;
  document.querySelector("#popup-progress").max = result.artistStats.size;

  let aid = Array.from(result.artistStats.keys());
  let alist = Array.from(result.artistStats.values());
  for (let i = 0; i < alist.length; i += 50) {
    if (EXCEEDED_REQUEST_LIMIT) {
      break;
    }
    let idList = "";
    for (let j = 0; j < Math.min(alist.length - i, 50); j++) {
      idList += aid[i + j] + (j + 1 === Math.min(alist.length - i, 50) ? "" : ",");
    }
    httpGetAsync("https://api.spotify.com/v1/artists?ids=" + encodeURIComponent(idList), (t) => {
      let req = JSON.parse(t)["artists"];
      for (let j = 0; j < Math.min(aid.length - i, 50); j++) {
        result.artistStats.get(aid[i + j]).image = (req[j]["images"] && req[j]["images"].length > 0) ? req[j]["images"][0]["url"] : null;

        document.querySelector("#progress").value = ++counter;
        document.querySelector("#popup-progress").value = counter;
        document.querySelector("#progress-label").innerText = `Importing artist ${counter} of ${result.artistStats.size} [${Math.round(100.0 * counter / result.artistStats.size)}%]`;
        document.querySelector("#popup-progress-label").innerText = `Importing artist ${counter} of ${result.artistStats.size} [${Math.round(100.0 * counter / result.artistStats.size)}%]`;
      }
    });

    await sleep(1000 / QUERY_RATE_PER_SECOND);
  }


  counter = 0;
  document.querySelector("#progress").max = data.length;
  document.querySelector("#popup-progress").max = data.length;

  for (const e of data) {
    let temp = result.songStats.get(e.spotifyID);
    if (temp === undefined) continue;
    temp.msPlayed += e.msPlayed;
    temp.streams += Math.ceil(e.msPlayed / temp.duration);
    temp.streamHistory.push({date: e.endTime, msPlayed: temp.msPlayed, streams: temp.streams});
    delete temp.endTime;
    result.songStats.set(temp.spotifyID, temp);

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
      temp.streams += Math.ceil(e.msPlayed / result.songStats.get(e.spotifyID).duration);
      temp.streamHistory.push({date: e.endTime, msPlayed: temp.msPlayed, streams: temp.streams});

      result.artistStats.set(artists[k], temp);
    }

    document.querySelector("#progress").value = ++counter;
    document.querySelector("#popup-progress").value = counter;
    document.querySelector("#progress-label").innerText = `Importing stream ${counter} of ${data.length} [${Math.round(100.0 * counter / data.length)}%]`;
    document.querySelector("#popup-progress-label").innerText = `Importing stream ${counter} of ${data.length} [${Math.round(100.0 * counter / data.length)}%]`;
  }

  counter = 0;
  document.querySelector("#progress").max = Math.ceil(result.songStats.size / 50.0);
  document.querySelector("#popup-progress").max = Math.ceil(result.songStats.size / 50.0);

  let songIDList = Array.from(result.songStats.keys());
  let songList = Array.from(result.songStats.values());
  for (let i = 0; i < songList.length; i += 50) {
    if (EXCEEDED_REQUEST_LIMIT) {
      break;
    }
    let idList = "";
    for (let j = 0; j < Math.min(songList.length - i, 50); j++) {
      idList += songList[i + j].spotifyID + (j + 1 === Math.min(songList.length - i, 50) ? "" : ",");
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
        result.songStats.set(track.spotifyID, track);
      }
    });
    document.querySelector("#progress").value = ++counter;
    document.querySelector("#popup-progress").value = counter;
    document.querySelector("#progress-label").innerText = `Importing song characteristics ${counter} of ${Math.ceil(result.songStats.size / 50.0)} [${Math.round(100.0 * counter / Math.ceil(result.songStats.size / 50.0))}%]`;
    document.querySelector("#popup-progress-label").innerText = `Importing song characteristics ${counter} of ${Math.ceil(result.songStats.size / 50.0)} [${Math.round(100.0 * counter / Math.ceil(result.songStats.size / 50.0))}%]`;
    await sleep(1000 / QUERY_RATE_PER_SECOND);
  }

  // Other useful information
  result.activeDays = new Set(data.map(d => approximateDate(d.endTime)));
  result.accountAge = Math.round((result.endDate - result.startDate) / (1000.0 * 3600.0 * 24.0));
  result.spotifyID = USERNAME;

  httpGetAsync("https://api.spotify.com/v1/users/" + encodeURIComponent(USERNAME), (t) => {
    let req = JSON.parse(t);
    result.username = (req["display_name"] === undefined ? "User" : req["display_name"]);
    result.userImage = req["images"][req["images"].length - 1]["url"];
  });

  await sleep(1000 / QUERY_RATE_PER_SECOND);

  document.querySelector("#progress-container").style.display = "none";
  document.querySelector("#popup-progress-container").style.display = "none";

  processedData = result;
}

// Update all information displays based on data and time range
function refreshDashboard(d, dateMin, dateMax) {
  // todo: see if can find way to efficiently find unique songs in range of time
  // todo: serialize with short field names, consider converting all ms to minutes
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

  document.querySelector("#profile-right #name").innerText = data.username;

  if (data.userImage) {
    document.querySelector("#profile-left img").src = data.userImage;
    document.querySelector("#profile-left").style.display = "block";
  } else {
    document.querySelector("#profile-left").style.display = "none";
  }

  document.querySelector("#profile-right #lifespan").innerText = born.toLocaleDateString("en-US", dateFormat) + " — " + upTo.toLocaleDateString("en-US", dateFormat);

  // Display summary information
  document.querySelector("#overall #overall-minutes").innerText = commafy(Math.round(([...data.history.values()][getLaterDate([...data.history.keys()], max)].msPlayed - [...data.history.values()][getEarlierDate([...data.history.keys()], min)].msPlayed) / 1000.0 / 60.0));
  document.querySelector("#overall #overall-streams").innerText = commafy([...data.history.values()][getLaterDate([...data.history.keys()], max)].streams - [...data.history.values()][getEarlierDate([...data.history.keys()], min)].streams);
  document.querySelector("#overall #overall-songs").innerText = commafy([...data.uniqueSongs.values()][getLaterDate([...data.uniqueSongs.keys()], max)].count - [...data.uniqueSongs.values()][getEarlierDate([...data.uniqueSongs.keys()], min)].count);
  document.querySelector("#overall #overall-artists").innerText = commafy([...data.uniqueArtists.values()][getLaterDate([...data.uniqueArtists.keys()], max)].count - [...data.uniqueArtists.values()][getEarlierDate([...data.uniqueArtists.keys()], min)].count);
  document.querySelector("#overall #overall-days").innerText = `${commafy(getLaterDate([...data.activeDays], max) - getEarlierDate([...data.activeDays], min))} / ${commafy(Math.min(data.accountAge, Math.round((max - min) / (1000.0 * 3600.0 * 24.0))))}`;
  document.querySelector("#overall #overall-avg-session").innerText = `${commafy(Math.ceil(parseFloat(document.querySelector("#overall #overall-minutes").innerText.replaceAll(",", "")) / (getLaterDate([...data.activeDays], max) - getEarlierDate([...data.activeDays], min))))}`;

  // Display song overview characteristics
  let songCount = data.songStats.size;
  let attr = ["acousticness", "danceability", "speechiness", "energy", "valence"];
  let counts = new Array(5).fill(0);
  let bpmTotal = 0;
  for (let i = 0 ; i < data.songStats.size; i++) {
    let song = [...data.songStats.values()][i];
    for (let j = 0 ; j < attr.length; j++) {
      if (song[attr[j]] >= 0.5) {
        counts[j]++;
      }
    }
    bpmTotal += song.tempo;
  }

  document.querySelector("#overview-stats #overview-acousticness").innerText = `${(counts[0] / songCount * 100).toFixed(0)}%`;
  document.querySelector("#overview-stats #overview-danceability").innerText = `${(counts[1] / songCount * 100).toFixed(0)}%`;
  document.querySelector("#overview-stats #overview-speechiness").innerText = `${(counts[2] / songCount * 100).toFixed(0)}%`;
  document.querySelector("#overview-stats #overview-energy").innerText = `${(counts[3] / songCount * 100).toFixed(0)}%`;
  document.querySelector("#overview-stats #overview-valence").innerText = `${(counts[4] / songCount * 100).toFixed(0)}%`;
  document.querySelector("#overview-stats #overview-tempo").innerText = `${(bpmTotal / songCount).toFixed(0)}`;

  document.querySelector("#overview-stats #overview-acousticness").parentNode.style.opacity = `${0.6 + (counts[0] / songCount) * 0.4}`;
  document.querySelector("#overview-stats #overview-danceability").parentNode.style.opacity = `${0.6 + (counts[1] / songCount) * 0.4}`;
  document.querySelector("#overview-stats #overview-speechiness").parentNode.style.opacity = `${0.6 + (counts[2] / songCount) * 0.4}`;
  document.querySelector("#overview-stats #overview-energy").parentNode.style.opacity = `${0.6 + (counts[3] / songCount) * 0.4}`;
  document.querySelector("#overview-stats #overview-valence").parentNode.style.opacity = `${0.6 + (counts[4] / songCount) * 0.4}`;


  // Check on graphs (may update range and/or data)
  GRAPH.refreshGraphs(data, min, max);

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
    templateArtists.querySelector(".img-div img").src = `${sortedArtists[i].image ? sortedArtists[i].image : ''}`;
    templateArtists.querySelector(".text-main").innerText = `${sortedArtists[i].name}`;
    templateArtists.querySelector(".text-sub").innerText = `${commafy(Math.round(getStreamStats(sortedArtists[i], "msPlayed", min, max) / 1000.0 / 60.0))} minutes | ${commafy(getStreamStats(sortedArtists[i], "streams", min, max))} streams`;

    // Add event listener to display popup on click, and append to DOM
    let item = document.importNode(templateArtists.querySelector("tr"), true);
    item.onclick = () => moreInfo("artist", data, sortedArtists[i].spotifyID);
    document.querySelector("#favorites-artists-table").appendChild(item);

    templateSongs.querySelectorAll("tr td")[0].innerText = `${(i + 1)}`;
    templateSongs.querySelector(".img-div img").src = `${sortedSongs[i].image ? sortedSongs[i].image : ''}`;
    templateSongs.querySelector(".text-main").innerText = `${sortedSongs[i].trackName}`;
    templateSongs.querySelector(".text-sub").innerText = `${commafy(Math.round(getStreamStats(sortedSongs[i], "msPlayed", min, max) / 1000.0 / 60.0))} minutes | ${commafy(getStreamStats(sortedSongs[i], "streams", min, max))} streams`;

    item = document.importNode(templateSongs.querySelector("tr"), true);
    item.onclick = () => moreInfo("song", data, sortedSongs[i].spotifyID);
    document.querySelector("#favorites-songs-table").appendChild(item);
  }
}

// Get streaming statistics in a time range (as info is stored cumulatively)
function getStreamStats(item, property, min, max)  {
  let i = item.streamHistory.findIndex((d) => {
    return (new Date(d.date) - new Date(max) <= 0) && (new Date(d.date) - new Date(min) >= 0)
  }) - 1;
  let j = item.streamHistory.findLastIndex((d) => {
    return (new Date(d.date) - new Date(max) <= 0) && (new Date(d.date) - new Date(min) >= 0)
  });

  let a = j >= 0 ? item.streamHistory[j][property] : 0;
  let b = i >= 0 ? item.streamHistory[i][property] : 0;
  return a - b;
}

// History (go back) functionality
let previouslyViewed = [];

// Handle history feature call
document.querySelector("#popup-artist-back-wrapper").onclick = () => {
  previouslyViewed.pop();
  let item = previouslyViewed.pop();
  moreInfo(item.type, item.data, item.id);
}

document.querySelector("#popup-song-back-wrapper").onclick = () => {
  previouslyViewed.pop();
  let item = previouslyViewed.pop();
  moreInfo(item.type, item.data, item.id);
}

// Handle close popup
document.querySelector("#popup-artist-close-wrapper").onclick = () => {
  document.querySelector("#popup-artist-wrapper").style.display = "none";
  document.querySelector("#popup-song-wrapper").style.display = "none";
}

document.querySelector("#popup-song-close-wrapper").onclick = () => {
  document.querySelector("#popup-artist-wrapper").style.display = "none";
  document.querySelector("#popup-song-wrapper").style.display = "none";
}

// Display popup information
export function moreInfo(type, data, id) {
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

    if (artist.image) {
      document.querySelector("#popup-artist-left-image-wrapper img").src = artist.image;
      document.querySelector("#popup-artist-left-image-wrapper").style.display = "block";
    } else {
      document.querySelector("#popup-artist-left-image-wrapper").style.display = "none";
    }

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
      templateSongs.querySelector(".img-div img").src = `${song.image ? song.image : ''}`;
      templateSongs.querySelector(".text-main").innerText = `${song.trackName}`;
      templateSongs.querySelector(".text-sub").innerText = `${commafy(Math.round(getStreamStats(song, "msPlayed", data.startDate, data.endDate) / 1000.0 / 60.0))} minutes | ${commafy(getStreamStats(song, "streams", data.startDate, data.endDate))} streams`;
      let item = document.importNode(templateSongs.querySelector("tr"), true);
      item.onclick = () => moreInfo("song", data, song.spotifyID);
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
      element.innerHTML = data.artistStats.get([...song.artists][i]).name;
      element.onclick = () => {
        moreInfo("artist", data, [...song.artists][i])
      };
      document.querySelector("#popup-song-artists").appendChild(element);
      if (i !== song.artists.size - 1) {
        document.querySelector("#popup-song-artists").appendChild(span.cloneNode(true));
      }
    }

    document.querySelector("#popup-song-wrapper").style.display = "flex";
    document.querySelector("#popup-artist-wrapper").style.display = "none";
    document.querySelector("#popup-song-left-image-wrapper img").src = `${song.image ? song.image : ''}`;
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

  // Update graphs in popup
  GRAPH.refreshPopupGraphs(type, data, id);
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
async function sleep(ms) {
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
async function download() {
  let blob = new Blob([await serialize(processedData)], {type: "text/plain;charset=utf-8"});
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