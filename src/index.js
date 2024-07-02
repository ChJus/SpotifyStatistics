let b = true;
let QUERY_RATE_PER_SECOND = 10.0;
let processedData, data;
let i1 = "ZjdiMzIzNGUzYjllNDJmMTg0ZjkxYmU0MWRhZDA0NDg=", i2 = "NjkyNmY0MzYyMDYyNDRjNTg3MTIzNzc3MDkyNjY3MGU="
i1 = atob(i1);
i2 = atob(i2);

const serialize = (value) => JSON.stringify(value, stringifyReplacer);
const deserialize = (text) => JSON.parse(text, parseReviver);

document.querySelector("#download").addEventListener("click", download);
document.querySelector("#download").style.display = "none";
document.querySelector("#tab-all").focus();

if (localStorage.hasOwnProperty("data")) {
  processedData = deserialize(localStorage.getItem("data"));
  document.querySelector("#download").style.display = "inline-block";
}

document.querySelector("#file").accept = "application/json,text/plain";
document.querySelector("#file").addEventListener("change", async (e) => {
  let file = e.target.files.item(0);
  let text = await file.text();
  if (file.type === "application/json") {
    await readData(text);
    processedData = await summaryStatistics(data);
  } else {
    processedData = deserialize(text);
  }
  localStorage.setItem("data", text);
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
  console.log("Attempting to log in...")
  await login();

  let result = {
    totalMinutes: 0,
    totalStreams: 0,
    uniqueSongs: 0,
    uniqueArtists: 0,
    artistStats: new Map(),
    songStats: new Map(),
    averageTime: 0, // in minutes
    accountAge: 0, // in days
    activeDays: 0,
    startDate: data[0].endTime,
    endDate: data[data.length - 1].endTime,
  };

  data.forEach((e) => {
    if (!result.songStats.has(stringHash(e.trackName + e.artistName))) {
      let song = structuredClone(e);
      song.streamHistory = [];
      song.streams = 0;
      song.internalID = stringHash(e.trackName + e.artistName);
      delete song.endTime;
      result.songStats.set(stringHash(e.trackName + e.artistName), song);
    }
  });

  let counter = 0;
  document.querySelector("#progress").max = result.songStats.size;
  for (let [i, s] of result.songStats) {
    if (!b) {
      break;
    }
    httpGetAsync("https://api.spotify.com/v1/search?q=" + encodeURIComponent("artist:" + s.artistName + " track:" + s.trackName) + "&type=track&limit=1", (t) => {
      if (JSON.parse(t)["tracks"]["items"].length === 0) {
        result.songStats.delete(i);
        document.querySelector("#progress").max = result.songStats.size;
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
        }
        s.artists.add(track["artists"][iter]["name"]);
        result.artistStats.get(track["artists"][iter]["name"]).songs.add(s.internalID);
      }
      delete s.artistName;
    });
    document.querySelector("#progress").value = ++counter;
    document.querySelector("#progress-label").innerText = `Importing track ${counter} of ${result.songStats.size}`;
    await sleep(1000 / QUERY_RATE_PER_SECOND);
  }

  counter = 0;
  document.querySelector("#progress").max = result.artistStats.size;
  for (let [i, a] of result.artistStats) {
    if (!b) {
      break;
    }
    httpGetAsync("https://api.spotify.com/v1/search?q=" + encodeURIComponent("artist:" + a.name) + "&type=artist&limit=1", (t) => {
      if (JSON.parse(t)["artists"]["items"].length === 0) {
        result.artistStats.delete(i);
        document.querySelector("#progress").max = result.artistStats.size;
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
    document.querySelector("#progress-label").innerText = `Importing artist ${counter} of ${result.artistStats.size}`;
    await sleep(1000 / QUERY_RATE_PER_SECOND);
  }

  data.forEach((e) => {
    result.totalMinutes += (e.msPlayed / 1000.0 / 60.0);

    let temp = result.songStats.get(stringHash(e.trackName + e.artistName));
    if (temp === undefined) return;
    temp.msPlayed += e.msPlayed;
    temp.streams += Math.ceil(e.msPlayed / temp.duration);
    temp.streamHistory.push({date: e.endTime, msPlayed: temp.msPlayed});
    result.songStats.set(stringHash(e.trackName + e.artistName), temp);

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

  result.totalMinutes = Math.round(result.totalMinutes);
  result.totalStreams = data.length;
  result.uniqueSongs = result.songStats.size;
  result.uniqueArtists = result.artistStats.size;

  result.averageTime = Math.round(result.totalMinutes / new Set(data.map(d => approximateDate(d))).size);
  result.activeDays = new Set(data.map(d => approximateDate(d))).size;
  result.accountAge = Math.round((result.endDate - result.startDate) / (1000.0 * 3600.0 * 24.0));

  document.querySelector("#progress-container").style.display = "none";
  return result;
}

function approximateDate(d) {
  return d.endTime.getFullYear() + "-" + d.endTime.getMonth() + "-" + d.endTime.getDate();
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
      console.log(xmlHttp.responseText);
      localStorage.setItem("token", JSON.parse(xmlHttp.responseText)["access_token"]);
      console.log("logged in!")
      return true;
    }
  }
}

function stop() {
  b = false;
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