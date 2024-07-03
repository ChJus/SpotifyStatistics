let b = true;
let QUERY_RATE_PER_SECOND = 10.0;
let processedData, data;
let i1 = "NmQyMDhlNGY3NzZiNGMxNmI0ODk2M2NkMTEwZWQwODQ=", i2 = "YWIyMTQ3MGIzN2VkNGFlYmI2NjY4Y2NlMjRmZDQyMDM="
i1 = atob(i1);
i2 = atob(i2);

const serialize = (value) => JSON.stringify(value, stringifyReplacer);
const deserialize = (text) => JSON.parse(text, parseReviver);

document.querySelector("#download").addEventListener("click", download);
document.querySelector("#download").style.display = "none";
document.querySelector("#tab-all").focus();
await login();

if (localStorage.hasOwnProperty("data")) {
  document.querySelector("#popup-container").style.display = "none";
  processedData = deserialize(localStorage.getItem("data"));
  document.querySelector("#download").style.display = "inline-block";
  await refreshDashboard(processedData, processedData.startDate, processedData.endDate);
}

document.querySelector("#popup-file").accept = "application/json,text/plain";
document.querySelector("#popup-file").addEventListener("change", async (e) => {
  document.querySelector("#download").style.display = "none";
  let file = e.target.files.item(0);
  let text = await file.text();
  if (file.type === "application/json") { // todo: error handling
    await readData(text);
    processedData = await summaryStatistics(data);
    localStorage.setItem("data", serialize(processedData));
  } else {
    processedData = deserialize(text);
    localStorage.setItem("data", text);
  }
  await refreshDashboard(processedData, processedData.startDate, processedData.endDate);
  document.querySelector("#popup-container").style.display = "none";
  document.querySelector("#download").style.display = "inline-block";
});

document.querySelector("#file").accept = "application/json,text/plain";
document.querySelector("#file").addEventListener("change", async (e) => {
  let file = e.target.files.item(0);
  let text = await file.text();
  if (file.type === "application/json") {
    await readData(text);
    processedData = await summaryStatistics(data);
    localStorage.setItem("data", serialize(processedData));
  } else {
    processedData = deserialize(text);
    localStorage.setItem("data", text);
  }

  await refreshDashboard(processedData, processedData.startDate, processedData.endDate);
  document.querySelector("#download").style.display = "inline-block";
});

async function readData(text) {
  data = await JSON.parse(text);
  for (let i = 0; i < data.length; i++) {
    data[i].endTime = new Date(data[i].endTime);
  }

  for (let i = data.length - 1; i >= 0; i--) {
    if (data[i].msPlayed < 30000) {
      data.splice(i, 1);
    }
  }
}

async function summaryStatistics(data) {
  document.querySelector("#progress-container").style.display = "block";
  document.querySelector("#popup-progress-container").style.display = "block";

  let prevD = new Date(approximateDate(data[0].endTime));
  prevD.setDate(prevD.getDate() - 1);
  let result = {
    history: new Map([[prevD, {date: prevD, msPlayed: 0, streams: 0}]]),
    uniqueSongs: new Map([[approximateDate(prevD), {date: approximateDate(prevD), count: 0}]]),
    uniqueArtists: new Map([[approximateDate(prevD), {date: approximateDate(prevD), count: 0}]]),
    artistStats: new Map(),
    songStats: new Map(),
    accountAge: 0, // in days
    activeDays: [],
    startDate: data[0].endTime,
    endDate: data[data.length - 1].endTime,
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

      song.streamHistory = [];
      song.streams = 0;
      song.internalID = stringHash(e.trackName + e.artistName);
      result.songStats.set(stringHash(e.trackName + e.artistName), song);
    }
  });

  let counter = 0;
  document.querySelector("#progress").max = result.songStats.size;
  document.querySelector("#popup-progress").max = result.songStats.size;
  for (let [i, s] of result.songStats) {
    if (!b) {
      break;
    }
    httpGetAsync("https://api.spotify.com/v1/search?q=" + encodeURIComponent("artist:" + s.artistName + " track:" + s.trackName) + "&type=track&limit=1", (t) => {
      if (JSON.parse(t)["tracks"]["items"].length === 0) {
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
            streamHistory: []
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
    if (!b) {
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
    temp.streamHistory.push({date: e.endTime, msPlayed: temp.msPlayed});
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
      temp.streamHistory.push({date: e.endTime, msPlayed: temp.msPlayed});

      result.artistStats.set(artists[k], temp);
    }
  });

  let songIDList = Array.from(result.songStats.keys());
  let songList = Array.from(result.songStats.values());
  for (let i = 0; i < songList.length; i += 50) {
    if (!b) {
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

  result.activeDays = new Set(data.map(d => approximateDate(d.endTime)));
  result.accountAge = Math.round((result.endDate - result.startDate) / (1000.0 * 3600.0 * 24.0));

  document.querySelector("#progress-container").style.display = "none";
  document.querySelector("#popup-progress-container").style.display = "none";
  return result;
}

function refreshDashboard(d, dateMin, dateMax) {
  // todo: see if can find way to efficiently find unique songs in range of time
  // todo: serialize with short field names, consider converting all ms to minutes
  // todo: handle case where storage overflows 5MB.
  // todo: allow sort by streams / time
  // todo: tabs to switch between feature (top artists/songs, graphs)
  let data = structuredClone(d);
  let min = new Date(approximateDate(new Date(dateMin))), max = new Date(approximateDate(new Date(dateMax)));
  let dateFormat = {year: 'numeric', month: 'long', day: 'numeric'};
  document.querySelector("#profile-right #lifespan").innerText = new Date(dateMin).toLocaleDateString("en-US", dateFormat) + " — " + new Date(dateMax).toLocaleDateString("en-US", dateFormat);

  document.querySelector("#overall #overall-minutes").innerText = commafy(Math.round(([...data.history.values()][getLaterDate([...data.history.keys()], max)].msPlayed - [...data.history.values()][getEarlierDate([...data.history.keys()], min)].msPlayed) / 1000.0 / 60.0));
  document.querySelector("#overall #overall-streams").innerText = commafy([...data.history.values()][getLaterDate([...data.history.keys()], max)].streams - [...data.history.values()][getEarlierDate([...data.history.keys()], min)].streams);
  document.querySelector("#overall #overall-songs").innerText = commafy([...data.uniqueSongs.values()][getLaterDate([...data.uniqueSongs.keys()], max)].count - [...data.uniqueSongs.values()][getEarlierDate([...data.uniqueSongs.keys()], min)].count);
  document.querySelector("#overall #overall-artists").innerText = commafy([...data.uniqueArtists.values()][getLaterDate([...data.uniqueArtists.keys()], max)].count - [...data.uniqueArtists.values()][getEarlierDate([...data.uniqueArtists.keys()], min)].count);
  document.querySelector("#overall #overall-days").innerText = `${commafy(getLaterDate([...data.activeDays], max) - getEarlierDate([...data.activeDays], min))} / ${commafy(Math.round((max - min) / (1000.0 * 3600.0 * 24.0)))}`;
  document.querySelector("#overall #overall-avg-session").innerText = `${commafy(Math.ceil(parseFloat(document.querySelector("#overall #overall-minutes").innerText.replaceAll(",", "")) / (getLaterDate([...data.activeDays], max) - getEarlierDate([...data.activeDays], min))))}`;

  let sortedArtists = [...data.artistStats.values()].toSorted((a, b) => {
    return b.streams - a.streams
  });
  let sortedSongs = [...data.songStats.values()].toSorted((a, b) => {
    return b.streams - a.streams
  });

  let templateArtists = document.querySelector("#favorites-artists-row-template").content;
  let templateSongs = document.querySelector("#favorites-songs-row-template").content;
  for (let i = 0; i < 50; i++) {
    templateArtists.querySelectorAll("tr td")[0].innerText = `${(i + 1)}`;
    templateArtists.querySelector(".img-div img").src = `${sortedArtists[i].image !== null ? sortedArtists[i].image : ''}`;
    templateArtists.querySelector(".text-main").innerText = `${sortedArtists[i].name}`;
    templateArtists.querySelector(".text-sub").innerText = `${commafy(sortedArtists[i].streams)} streams | ${commafy(Math.round(sortedArtists[i].msPlayed / 1000.0 / 60.0))} minutes`;

    let item = document.importNode(templateArtists.querySelector("tr"), true);
    item.addEventListener("click", () => moreInfo("artist", sortedArtists[i].name));
    document.querySelector("#favorites-artists-table").appendChild(item);

    templateSongs.querySelectorAll("tr td")[0].innerText = `${(i + 1)}`;
    templateSongs.querySelector(".img-div img").src = `${sortedSongs[i].image !== null ? sortedSongs[i].image : ''}`;
    templateSongs.querySelector(".text-main").innerText = `${sortedSongs[i].trackName}`;
    templateSongs.querySelector(".text-sub").innerText = `${commafy(sortedSongs[i].streams)} streams | ${commafy(Math.round(sortedSongs[i].msPlayed / 1000.0 / 60.0))} minutes`;

    item = document.importNode(templateSongs.querySelector("tr"), true);
    item.addEventListener("click", () => moreInfo("song", sortedSongs[i].internalID));
    document.querySelector("#favorites-songs-table").appendChild(item);
  }
}

function moreInfo(type, id) {
  console.log(type, id)
}

function commafy(x) {
  return x.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",");
}

function getEarlierDate(arr, date) {
  return arr.findIndex((d) => {
    return new Date(d) - new Date(date) >= 0
  }) - 1;
}

function getLaterDate(arr, date) {
  let index = arr.findLastIndex((d) => {
    return new Date(d) - new Date(date) <= 0
  });
  return index >= 0 ? index : arr.length - 1;
}

function approximateDate(d) {
  return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
}

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
      await sleep(2000);
    }
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

function download() {
  let blob = new Blob([serialize(processedData)], {type: "text/plain;charset=utf-8"});
  saveAs(blob, "data.txt");
}

// License: CC0
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