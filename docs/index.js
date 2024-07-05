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

document.querySelectorAll("#settings button").forEach(button => {
  button.addEventListener("click", async (e) => {
    document.querySelectorAll("#settings button").forEach(button => {
      button.classList.remove("active");
    });
    e.target.classList.add("active");
    let option = e.target.id.split("-")[1];
    let sd, ed;
    switch (option) {
      case "all":
        sd = processedData.startDate;
        ed = processedData.endDate;
        break;
      case "1y":
        sd = new Date(processedData.endDate);
        sd.setDate(sd.getDate() - 365);
        ed = processedData.endDate;
        break;
      case "6m":
        sd = new Date(processedData.endDate);
        sd.setDate(sd.getDate() - 180);
        ed = processedData.endDate;
        break;
      case "3m":
        sd = new Date(processedData.endDate);
        sd.setDate(sd.getDate() - 90);
        ed = processedData.endDate;
        break;
      case "ytd":
        sd = new Date(`${new Date(processedData.endDate).getFullYear()}-1-1`);
        ed = processedData.endDate;
        break;
      case "mtd":
        sd = new Date(`${new Date(processedData.endDate).getFullYear()}-${new Date(processedData.endDate).getMonth() + 1}-1`);
        ed = processedData.endDate;
        break;
    }
    await refreshDashboard(processedData, sd, ed);
  })
})

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

async function refreshDashboard(d, dateMin, dateMax) {
  // todo: see if can find way to efficiently find unique songs in range of time
  // todo: serialize with short field names, consider converting all ms to minutes
  // todo: handle case where storage overflows 5MB.
  // todo: tabs to switch between feature (top artists/songs, graphs)
  let data = structuredClone(d);
  let min = new Date(approximateDate(new Date(dateMin))), max = new Date(approximateDate(new Date(dateMax)));
  let dateFormat = {year: 'numeric', month: 'long', day: 'numeric'};

  let born = new Date(dateMax), upTo = new Date(dateMax);
  born.setDate(born.getDate() - data.accountAge + 1);
  upTo.setDate(upTo.getDate() - 1)
  document.querySelector("#profile-right #lifespan").innerText = born.toLocaleDateString("en-US", dateFormat) + " — " + upTo.toLocaleDateString("en-US", dateFormat);

  document.querySelector("#overall #overall-minutes").innerText = commafy(Math.round(([...data.history.values()][getLaterDate([...data.history.keys()], max)].msPlayed - [...data.history.values()][getEarlierDate([...data.history.keys()], min)].msPlayed) / 1000.0 / 60.0));
  document.querySelector("#overall #overall-streams").innerText = commafy([...data.history.values()][getLaterDate([...data.history.keys()], max)].streams - [...data.history.values()][getEarlierDate([...data.history.keys()], min)].streams);
  document.querySelector("#overall #overall-songs").innerText = commafy([...data.uniqueSongs.values()][getLaterDate([...data.uniqueSongs.keys()], max)].count - [...data.uniqueSongs.values()][getEarlierDate([...data.uniqueSongs.keys()], min)].count);
  document.querySelector("#overall #overall-artists").innerText = commafy([...data.uniqueArtists.values()][getLaterDate([...data.uniqueArtists.keys()], max)].count - [...data.uniqueArtists.values()][getEarlierDate([...data.uniqueArtists.keys()], min)].count);
  document.querySelector("#overall #overall-days").innerText = `${commafy(getLaterDate([...data.activeDays], max) - getEarlierDate([...data.activeDays], min))} / ${commafy(Math.min(data.accountAge, Math.round((max - min) / (1000.0 * 3600.0 * 24.0))))}`;
  document.querySelector("#overall #overall-avg-session").innerText = `${commafy(Math.ceil(parseFloat(document.querySelector("#overall #overall-minutes").innerText.replaceAll(",", "")) / (getLaterDate([...data.activeDays], max) - getEarlierDate([...data.activeDays], min))))}`;

  let sortedArtists = [...data.artistStats.values()].toSorted((a, b) => {
    return getStreamStats(b, "msPlayed", min, max) - getStreamStats(a, "msPlayed", min, max)
  });
  let sortedSongs = [...data.songStats.values()].toSorted((a, b) => {
    return getStreamStats(b, "msPlayed", min, max) - getStreamStats(a, "msPlayed", min, max)
  });

  let templateArtists = document.querySelector("#favorites-artists-row-template").content;
  let templateSongs = document.querySelector("#favorites-songs-row-template").content;

  let remove = document.querySelectorAll("#favorites-artists-table > tr");
  let remove2 = document.querySelectorAll("#favorites-songs-table > tr");
  for (let i = remove.length - 1; i >= 0; i--) {
    remove[i].parentNode.removeChild(remove[i]);
    remove2[i].parentNode.removeChild(remove2[i]);
  }

  for (let i = 0; i < 50; i++) {
    templateArtists.querySelectorAll("tr td")[0].innerText = `${(i + 1)}`;
    templateArtists.querySelector(".img-div img").src = `${sortedArtists[i].image !== null ? sortedArtists[i].image : ''}`;
    templateArtists.querySelector(".text-main").innerText = `${sortedArtists[i].name}`;
    templateArtists.querySelector(".text-sub").innerText = `${commafy(Math.round(getStreamStats(sortedArtists[i], "msPlayed", min, max) / 1000.0 / 60.0))} minutes | ${commafy(getStreamStats(sortedArtists[i], "streams", min, max))} streams`;

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

let previouslyViewed = [];

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

document.querySelector("#popup-artist-close-wrapper").addEventListener("click", () => {
  document.querySelector("#popup-artist-wrapper").style.display = "none";
  document.querySelector("#popup-song-wrapper").style.display = "none";
})

document.querySelector("#popup-song-close-wrapper").addEventListener("click", () => {
  document.querySelector("#popup-artist-wrapper").style.display = "none";
  document.querySelector("#popup-song-wrapper").style.display = "none";
})

function moreInfo(type, data, id) {
  if (previouslyViewed.length > 0) {
    document.querySelector(`#popup-${type}-back-wrapper`).style.display = "block";
  } else {
    document.querySelector(`#popup-${type}-back-wrapper`).style.display = "none";
  }
  if ((previouslyViewed.length > 0 && previouslyViewed[previouslyViewed.length - 1].id !== id) || previouslyViewed.length === 0) {
    previouslyViewed.push({type: type, data: data, id: id})
  }
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
      console.log(i, song.artists.size - 1)
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

function contrastAdjust(color) {
  if ((color.r + color.g + color.b) / 3.0 > 150) {
    color.r *= 0.7;
    color.g *= 0.7;
    color.b *= 0.7;
  }
  return `rgb(${color.r}, ${color.g}, ${color.b})`;
}

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

function hexToRgb(hex) {
  let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

function commafy(x) {
  return x.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",");
}

function getEarlierDate(arr, date) {
  let i = arr.findIndex((d) => {
    return new Date(d) - new Date(date) >= 0
  });
  return i >= 0 ? i : 0;
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