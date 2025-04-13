// ==UserScript==
// @name        cine
// @namespace   Violentmonkey Scripts
// @match       https://search.ch/cine/*
// @grant       GM_xmlhttpRequest
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

    showings[cinemaNameNumber] = {
      showtimes: hours,
      language,
    };
  });

  return {
    title,
    // genre,
    // description,
    showings
  };
}

function desktopFetch(url) {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: 'GET',
      url,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3",
      },
      responseType: 'text/html',
      onload: res => resolve(res.responseText),
      onerror: error => reject(error)
    });
  });
}

const dom = text => new DOMParser().parseFromString(text, 'text/html');
// const fetchHtmlAsDom = async url => dom(await(await fetch(url)).text());
const fetchHtmlAsDom = async url => dom(await desktopFetch(url));

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
    const filmTitleKey = makeFilmTitleKey(title);
    const review = reviewsMap[filmTitleKey];
    const film = { title, cinemas };
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

function reviewToFilmTitle(fullTitle) {
  let filmTitle = fullTitle.trim();
  // Extract film title (the text inside quotes)
  filmTitle = filmTitle.match(/«([^»]+)»/);
  return filmTitle ? filmTitle[1] : null;
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
      const fullTitle = titleAnchor.textContent.trim();
      const filmTitle = reviewToFilmTitle(fullTitle);
      articles.push({
        title: fullTitle,
        filmTitle: filmTitle,
        key: makeFilmTitleKey(filmTitle),
        href: titleAnchor.getAttribute('href'),
        lead: lead ? lead.textContent.trim() : ''
      });
    }
  });
  return articles;
}

function makeFilmTitleKey(filmTitle) {
  if (!filmTitle) return null;
  return filmTitle.toLowerCase().replaceAll("’", "'");
}

function articlesToMap(articles) {
  return articles.reduce((acc, article) => {
    const filmTitleKey =  article.key;
    if(filmTitleKey && !acc[filmTitleKey]){
      acc[filmTitleKey] = article;
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
      line-height: 1.3;
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
    .film-review {
      margin-top: 0px;
      cursor: pointer;
    }
    .cinema {
      margin-left: 20px;
      margin-top: 5px;
      display: flex
    }
    .showtimes {
      /*
      margin-left: 40px;
      */
      margin-left: 5px;
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
  const removeModal = (e) => {
    e.preventDefault();
    modal.remove();
  };
  close.addEventListener('click', removeModal);
  close.addEventListener('touchstart', removeModal, { passive: false });


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
      const cinemaName = document.createElement('div');
      cinemaName.innerHTML = `<strong>${cinema.name}</strong> (${cinema.language})`;

      const times = document.createElement('div');
      times.className = 'showtimes';
      times.textContent = cinema.showtimes.join(', ');

      cinemaDiv.appendChild(cinemaName);
      cinemaDiv.appendChild(times);
      cinemaList.appendChild(cinemaDiv);
    }

    const toggleDisplay =  (e) => {
      e.preventDefault();
      cinemaList.style.display = (cinemaList.style.display === 'none') ? 'block' : 'none';
    };
    filmHeader.addEventListener('click', toggleDisplay);
    filmHeader.addEventListener('touchstart', toggleDisplay, { passive: false });

    content.appendChild(filmHeader);
    content.appendChild(filmReview);
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
  // global variables, accessible from the console
  films = await fetchAllFilms(urls);
  reviews = await fetchAllReviews();
  reviewsMap = articlesToMap(reviews);
  // alert(reviews.map(r => r.filmTitle).join('\n'));
  const mergedFilms = mergeFilmReviews(films, reviewsMap);
  injectModalStyles();
  createModal(mergedFilms, reviewsMap);
}

main();
