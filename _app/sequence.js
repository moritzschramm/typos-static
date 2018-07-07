/****
  *** @NOTE requires jQuery
  *** sequence:
  *** responsible for loading and preparing the sequence (lines of text to be typed by user)
  ***/

var sq_WIKI_URL = "https://en.wikipedia.org/w/api.php?format=json&action=query&prop=extracts&exlimit=max&explaintext&exintro&generator=random&grnnamespace=0&grnlimit=10&origin=*&redirects=";
var sq_WIKI_URL_DE = "https://de.wikipedia.org/w/api.php?format=json&action=query&prop=extracts&exlimit=max&explaintext&exintro&generator=random&grnnamespace=0&grnlimit=10&origin=*&redirects=";
var sq_REGEX = /^[A-Za-z0-9.,\+@!"§$%&/()=?:;<>\[\]~*#' _\\{}\n\t-]+$/;
var sq_REGEX_DE = /^[A-Za-z0-9.,\+@äöü!"§$%&/()=?:;<>\[\]~*#' _\\{}\n\t-]+$/;

var sequence = {     // the object where the lines, the line pointer and the errors get stored
  index:    0,
  lines:    [],
  errors:   [],
};

// defaults
var sq_dataURI        = "";   // from which URI the sequence should be loaded (set in training view, not used in static version)
var sq_maxLineLength  = 24;   // max line length excluding appended ⏎

/**
  * initialization
  */
function sq_init(loaded) {

  var xhttp = new XMLHttpRequest();

  if(kb_layout === "de-de") {
    sq_WIKI_URL = sq_WIKI_URL_DE;
    sq_REGEX = sq_REGEX_DE;
  }

  xhttp.addEventListener("load", function() {
    
    var l = ["Error, please reload page"];

    var res = JSON.parse(this.responseText);
    for(var key in res.query.pages) {

      var title = res.query.pages[key].title;
      var text = res.query.pages[key].extract;

      if(text.length > 300 && text.length < 1000 && sq_REGEX.test(text)) {

        l.pop();      // delete error message
        sq_parseText(title + "\n", l);
        sq_parseText(text, l);
        break;
      }
    }

    sq_prepareSequence(l);

    loaded(app_modules.sequence);
  });
  xhttp.open("GET", sq_WIKI_URL);
  xhttp.send();
}


/**
  * prepare and store lines in sequence object
  *
  * @param Array lines
  */
function sq_prepareSequence(lines) {

  for(key in lines) {

    var line = lines[key];

    line = line.replace(/\n/g, "⏎");      // replace newlines with ⏎
    line = line.replace(/\t/g, "↹");      // replace tabs with ↹
    line = line.replace(/ /g, "␣");

    // store line in sequence object
    sequence.lines.push(line);
  }
}

/**
  * parse text: divide text with certain length into lines and store each line in string array
  *
  * @param String text
  * @return Array lines 
  */
function sq_parseText(text, lines) {

  var counter = 0;
  var lastSpace = -1;

  for(var i = 0; i < text.length; i++) {

    if(text.charAt(i) === ' ') {
      lastSpace = i;
    }

    if(counter === sq_maxLineLength) {

      if(lastSpace !== -1) {  // soft wrap
        lines.push(text.slice(i - counter, lastSpace + 1));
        i = lastSpace + 1;

      } else {  // no space in last maxLineLength characters, hard line wrap
        lines.push(text.slice(i - counter, i));
      }

      if(text.length - i <= sq_maxLineLength) {
          lines.push(text.slice(i, text.length));
          break;
        }
      counter = 0;
    }
    counter++;
  }
}