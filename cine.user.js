// ==UserScript==
// @name        cine
// @namespace   Violentmonkey Scripts
// @match       https://search.ch/cine/*
// @grant       none
// @version     1.0
// @author      -
// @description 12.04.2025, 10:42:54
// ==/UserScript==
function findFilmArticles(dom = document) {
    const filmArticles = dom.querySelectorAll(".kino-show");
  const films = {};
    for(const filmArticle of filmArticles){
      const film = extractFilmInfo(filmArticle);
      films[film.title] = film.showings;
    }
    return films;
}

function extractFilmInfo(filmArticle) {

  // Extract film title
  const titleElement = filmArticle.querySelector(".kino-show-title a");
  const titleRaw = titleElement ? titleElement.textContent.trim() : "Unknown Title";
  const title = titleRaw.replace(/ ?\(.*\)$/,'');

  // Extract genre information
  const genreElement = filmArticle.querySelector(".kino-genre");
  const genre = genreElement ? genreElement.textContent.trim() : "";

  // Extract film description
  const descElement = filmArticle.querySelector(".kino-show-desc");
  const description = descElement ? descElement.textContent.trim() : "";

  // Extract cinema and showtimes information
  const showings = {};
  const rows = filmArticle.querySelectorAll("table tr");

  rows.forEach(row => {
    const cinemaElement = row.querySelector(".kino-screen a");
    const cinemaName = cinemaElement ? cinemaElement.textContent.trim() : "";

    const screenElement = row.querySelector(".kino-screen");
    const screenText = screenElement ? screenElement.textContent.trim() : "";
    // Extract screen number if present (after the cinema name)
    const screenNumberRaw = screenText.replace(cinemaName, "").trim();
    const screenNumber = screenNumberRaw.replace(/ ?\(Genève\)/,'');
    const cinemaNameNumber = cinemaName + ' ' + screenNumber;

    const hoursElement = row.querySelector(".kino-hours");
    const hoursSpans = hoursElement ? hoursElement.querySelectorAll("span") : [];
    const hours = Array.from(hoursSpans).map(span => {
      // Check if there's a title attribute (for special showings like IMAX)
      // const specialInfo = span.getAttribute("title");
      // return {
      //   time: span.textContent.trim(),
      //   special: specialInfo || null
      // };
      return span.textContent.trim();
    });

    const languageElement = row.querySelector(".kino-spoken");
    const language = languageElement ? languageElement.textContent.trim() : "";

    // const ageElement = row.querySelector(".kino-age");
    // const ageRating = ageElement ? ageElement.textContent.trim() : "";

    // const seatsElement = row.querySelector(".kino-seats");
    // const seats = seatsElement ? seatsElement.textContent.trim() : "";

    // const isAccessible = !!row.querySelector(".kino-accessible .sl-icon-accessible");

    showings[cinemaNameNumber] = {
      // cinema: cinemaNameNumber,
      // screen: screenNumber,
      showtimes: hours,
      language,
      // ageRating,
      // seats,
      // isAccessible
    };
  });

  return {
    title,
    // genre,
    // description,
    showings
  };
}

async function fetchHtmlAsDom(url){
  const r = await fetch(url);
  const data = await r.text();
  return new DOMParser().parseFromString(data, 'text/html');
}

async function fetchFilms(url){
    const dom = await fetchHtmlAsDom(url);
    return findFilmArticles(dom);
}

async function fetchAllFilms(urls){
  const films = await Promise.all(urls.map(fetchFilms));
  const filmData = films.reduce((allFilms, films) => {
    for (const [title, cinemas] of Object.entries(films)) {
      allFilms[title] = allFilms[title] || {};
      allFilms[title] = { ...allFilms[title], ...cinemas };
    }
    return allFilms;
  }, {});
  return filmData;
}


window.logFilms = function (films, from, to ) {
  const keys = Object.keys(films).slice(from, to);
  const fewFilms = keys.reduce(
    (acc, key) => { acc[key] = films[key]; return acc; }, {});
  const filmsString = JSON.stringify(fewFilms , null, 2);
  console.log(filmsString);
}

// Example data
const filmData = {
  "Bergers": {
    "Le Nord-Sud Nord": { "showtimes": ["14:00"], "language": "F" },
    "Les Scala 1": { "showtimes": ["16:00", "18:25", "20:50"], "language": "F" },
    "Les Scala 1 (Genève)": { "showtimes": ["16:00", "18:25", "20:50"], "language": "F" }
  },
  "Moon le panda": {
    "Arena Cinémas La Praille 9": { "showtimes": ["13:30", "15:50"], "language": "F" },
    "Pathé Balexert 8": { "showtimes": ["10:45", "13:00", "15:30"], "language": "F" },
    "Arena Cinémas La Praille 9 (Genève)": { "showtimes": ["13:30", "15:50"], "language": "F" }
  }
};

function compareFilms(a, b) {
  if(!!a.review === !!b.review ){
    return a.title.localeCompare(b.title);
  } else if(a.review){
    return -1;
  }
  return 1;
}

function mergeFilmReviews(filmData, reviewsMap) {
  const films = Object.entries(filmData).map(([title, cinemasObj]) => {
    const cinemas = Object.entries(cinemasObj)
      .map(([name, info]) => ({
        name,
        showtimes: info.showtimes,
        language: info.language
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    // Add review if available
    const review = reviewsMap[title];
    film = { title, cinemas };
    if (review) {
      film.review = review;
    }
    return film;
  } );

  // Sort films by title
  films.sort(compareFilms);
  // films.sort((a, b) => a.title.localeCompare(b.title));

  return films;
}
function parseArticles(htmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');
  const articles = [];
  const articleNodes = doc.querySelectorAll('article.post');
  articleNodes.forEach(article => {
    const titleAnchor = article.querySelector('.post__title a');
    const lead = article.querySelector('.post__lead p');
    if (titleAnchor) {
      // Extract the title with quotes
      const fullTitle = titleAnchor.textContent.trim();
      // Extract film title (the text inside quotes)
      const filmTitle = fullTitle.match(/«([^»]+)»/);
      articles.push({
        title: fullTitle,
        filmTitle: filmTitle ? filmTitle[1] : null, // Film title inside quotes
        href: titleAnchor.getAttribute('href'),
        lead: lead ? lead.textContent.trim() : ''
      });
    }
  });
  return articles;
}

function articlesToMap(articles) {
  return articles.reduce((acc, article) => {
    const filmTitle =  article.filmTitle;
    if(filmTitle && !acc[filmTitle]){
      acc[filmTitle] = article;
    }
    return acc;
  }, {});
}

async function fetchReviews(page = 1) {
  const resp = await fetch('https://www.letemps.ch/profil/norbert-creutz-1?page=' + page);
  const html = await resp.text()
  return parseArticles(html);
}

async function fetchAllReviews(pages = 3) {
  const pageNumbers = []
  for (let i = 1; i <= pages; i++) {
    pageNumbers.push(i);
  }
  const reviewArrays = await Promise.all(pageNumbers.map(fetchReviews));
  return reviewArrays.flat();
}


function injectModalStyles() {
  // Inject styles for modal
  const style = document.createElement('style');
  style.textContent = `
    .film-modal {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.8);
      color: white;
      font-family: sans-serif;
      z-index: 10000;
      overflow: auto;
      padding: 20px;
    }
    .film-modal-content {
      background: #222;
      padding: 20px;
      border-radius: 8px;
      max-width: 800px;
      margin: auto;
    }
    .film-close {
      float: right;
      cursor: pointer;
      font-size: 20px;
      color: #ccc;
    }
    .film-title {
      font-size: 1.2em;
      margin-top: 20px;
      cursor: pointer;
    }
    .cinema {
      margin-left: 20px;
      margin-top: 5px;
    }
    .showtimes {
      margin-left: 40px;
      font-style: italic;
      color: #aaa;
    }
  `;
  document.head.appendChild(style);
}

function createModal(films) {
  const modal = document.createElement('div');
  modal.className = 'film-modal';

  const content = document.createElement('div');
  content.className = 'film-modal-content';

  const close = document.createElement('span');
  close.className = 'film-close';
  close.innerHTML = '&times;';
  close.onclick = () => modal.remove();
  content.appendChild(close);

  for (const film of films) {
    const filmHeader = document.createElement('div');
    filmHeader.className = 'film-title';
    filmHeader.textContent = film.title;

    const filmReview = document.createElement('div');
    filmReview.className = 'film-review';
    if (film.review) {
      filmReview.textContent = film.review.lead;
    }

    const cinemaList = document.createElement('div');
    cinemaList.style.display = 'none';

    for (const cinema of film.cinemas) {
      const cinemaDiv = document.createElement('div');
      cinemaDiv.className = 'cinema';
      cinemaDiv.innerHTML = `<strong>${cinema.name}</strong> (${cinema.language})`;

      const times = document.createElement('div');
      times.className = 'showtimes';
      times.textContent = cinema.showtimes.join(', ');

      cinemaDiv.appendChild(times);
      cinemaList.appendChild(cinemaDiv);
    }

    filmHeader.onclick = () => {
      cinemaList.style.display = (cinemaList.style.display === 'none') ? 'block' : 'none';
    };

    content.appendChild(filmHeader);
    content.appendChild(filmReview);
    content.appendChild(cinemaList);
  }

  modal.appendChild(content);
  document.body.appendChild(modal);
}

function createModal0(data) {
  const modal = document.createElement('div');
  modal.className = 'film-modal';

  const content = document.createElement('div');
  content.className = 'film-modal-content';

  const close = document.createElement('span');
  close.className = 'film-close';
  close.innerHTML = '&times;';
  close.onclick = () => modal.remove();
  content.appendChild(close);

  for (const [filmTitle, cinemas] of Object.entries(data)) {
    const filmHeader = document.createElement('div');
    filmHeader.className = 'film-title';
    filmHeader.textContent = filmTitle;

    const cinemaList = document.createElement('div');
    cinemaList.style.display = 'none';

    for (const [cinema, info] of Object.entries(cinemas)) {
      const cinemaDiv = document.createElement('div');
      cinemaDiv.className = 'cinema';
      cinemaDiv.innerHTML = `<strong>${cinema}</strong> (${info.language})`;

      const times = document.createElement('div');
      times.className = 'showtimes';
      times.textContent = info.showtimes.join(', ');

      cinemaDiv.appendChild(times);
      cinemaList.appendChild(cinemaDiv);
    }

    filmHeader.onclick = () => {
      cinemaList.style.display = (cinemaList.style.display === 'none') ? 'block' : 'none';
    };

    content.appendChild(filmHeader);
    content.appendChild(cinemaList);
  }

  modal.appendChild(content);
  document.body.appendChild(modal);
}

async function main(){
  const urls = [
    'https://search.ch/cine/Gen%C3%A8ve',
    'https://search.ch/cine/Carouge'
  ];
  window.films = await fetchAllFilms(urls);
  window.reviews = await fetchAllReviews();
  const reviewsMap = articlesToMap(window.reviews);
  const films = mergeFilmReviews(window.films, reviewsMap);
  createModal(films, reviewsMap);
  injectModalStyles();
}

window.fetchReviews = fetchReviews;
window.fetchAllReviews = fetchAllReviews;

main();
