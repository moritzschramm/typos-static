/****
  *** @NOTE requires jQuery
  *** @NOTE requires keyboard_builder.js
  *** @NOTE requires keyboard_actions.js
  *** @NOTE requires keyboard_listener.js
  *** @NOTE requires display.js
  *** @NOTE requires typometer.js
  *** app:
  *** handles to user input and changes display accordingly
  *** highlights next key to press
  ***/

var STATE_LOADING     = 0;    // app is loading and building resources (keyboard layout, sequences, etc.)
var STATE_IDLE        = 1;    // waiting for first user input (app will start AFTER user is ready (i.e. has made an input))
var STATE_RUNNING     = 2;    // user works through sequences
var STATE_FINISHED    = 3;    // user has finished typing all lines

var app_state       = STATE_LOADING;      // current app state
var app_inError     = false;              // if the there is currently some wrong input which has to be deleted before the user can type again
var app_errorCount  = 0;                  // amount of errors made by user
var app_nonce       = "";                 // retrieved when lection starts, should be submitted when uploading results
var app_startString = "";                 // the string that gets displayed at the beginning
var app_errorString = "";                 // the string that gets displayed when an error occured

var app_silentKeys = ["Shift", "AltGraph", "Alt", "Control"];    // keys that should not be printed to display

var app_uploadResultURI   = "/results/upload";  // upload URI for results
var app_showResultURI     = "/results/show";    // redirect to this URI after results have been uploaded
var app_trainingNonceURI  = "/training/nonce";  // the URI from which the nonce is retrieved

// modules that are essential for the app,
// initialized with their name (indicates module is not loaded yet)
// when loaded, e.g. app_modules.keyboard === "loaded"
// loaded via app_moduleCallback (passed to *_init() functions of other scripts)
var app_modules = {
  keyboard:     "keyboard",
  display:      "display",
  sequence:     "sequence",
  typometer:    "typometer",
  misc:         "misc",
  infobar:      "infobar",
  progressbar:  "progressbar"
};
var required_modules = [
  app_modules.keyboard, app_modules.display, app_modules.sequence,
  app_modules.typometer, app_modules.misc, app_modules.infobar, app_modules.progressbar
];

function app_moduleCallback(app_module) {

  var index = required_modules.indexOf(app_module);   // find module

  if(index === -1) {    // module not found

    console.error("Loaded unknown module");
    return;
  }

  app_module = "loaded";

  // remove from module list
  required_modules.splice(index, 1);

  if(required_modules.length === 0) { // if every module is loaded, change state to idle

    app_changeState(STATE_IDLE);
  }
}

function app_changeState(state) {

  app_state = state;

  switch (state) {

    case STATE_IDLE:

      // hide loader
      $("#loader").hide();
      // show info
      dp_setRedText("");
      dp_setGreenText("");
      dp_setNormalText(app_startString);
      app_inError = false;
      app_errorCount = 0;
      sequence.index = 0;
      tm_stop();
      ib_updateBar(); 
      pb_update();
      kb_unhighlightAllKeys();

      break;

    case STATE_RUNNING:

      // start typometer
      tm_start();

      break;

    case STATE_FINISHED:

      // show loader
      $("#loader").show();

      // stop typometer
      tm_stop();

      // upload results
      // if successful, redirect
      app_uploadResults();

      break;

    default: break;
  }
}

/**
  * listener for pressed key
  * called in keyboard_listener.js
  *
  * @param string key: the key that was pressed
  * @param string keyId: id of the key
  */
function app_keyPressed(key, keyId) {

  // in case the app is not running yet
  if(app_state === STATE_IDLE) {

    app_startLection();
    return;

  } else if(app_state === STATE_FINISHED) {

    return;
  }

  // check if key is a special key, return if so
  if(app_handleSpecialKeyPress(key, keyId)) {

    return;
  }

  key = app_replaceSpecialChar(key);

  var nextChar = dp_normal.charAt(0);

  if((key === nextChar || app_matchesWhitespace(key, nextChar))
      && !app_inError) {  // correct key and currently no wrong input

    // add correct keystroke to typometer
    tm_keystroke();

    // cut line, remove first character old line
    var line = dp_normal.substring(1, dp_normal.length);

    if(line.length === 0) {   // line was completely retyped

      app_nextLine();
      return;
    }

    // add key to correct keys (replace " " with "␣")
    var correctChar = key === " " ? "␣" : key;
    dp_setGreenText(dp_green + correctChar);
    // set new line content
    dp_setNormalText(line);

    // unhighlight current key
    if( ! misc_assignmentVisible)
      kb_unhighlightKey(keyId);

    // highlight next key
    var nextKey   = app_replaceSpecialChar(line.charAt(0));
    var nextKeyId = kb_getKeyIdFromKey(nextKey);
    kb_highlightKey(nextKeyId);

  } else { // wrong key, add to red text

    if(!app_inError) {

      app_errorCount++;
    }

    app_inError = true;

    if( ! misc_assignmentVisible) {
      kb_unhighlightKey(kb_lastHighlightedKeyId);
      kb_highlightKey(kb_getKeyIdFromKey("Backspace"));
    }

    if(dp_red.length < 5) {

      // add wrong char to red text (replace whitespace)
      var wrongChar = key === " " ? "␣" : key;

      dp_setRedText(dp_red + wrongChar);
    }

  }

  ib_updateBar();   // update error count and error ratio
}

/**
  * handles special key presses like "Backspace"
  *
  * @param string key: the key that was pressed
  * @param string keyId: id of the key
  * @return boolean: is key a special key
  */
function app_handleSpecialKeyPress(key, keyId) {

  // if the key does not exists on keyboard layout, do nothing
  if(keyId === "None") return true;

  // if the key is a silent key, do nothing
  if(app_silentKeys.indexOf(key) !== -1) return true;

  switch(key) {

    case "Backspace":

      if(dp_red.length > 0) {  // there is wrong input

        // remove one character from red text
        dp_setRedText(dp_red.substring(0, dp_red.length - 1));

        // check if there is no more wrong input
        if(dp_red.length === 0) {

          app_inError = false;

          if( ! misc_assignmentVisible)
            kb_unhighlightKey(kb_lastHighlightedKeyId);   // unhighlight backspace

          // highlight next key
          var nextKey = app_replaceSpecialChar(dp_normal.charAt(0));

          kb_highlightKey(kb_getKeyIdFromKey(nextKey));
        }
      }

      return true;

    default: return false;
  }

}

/**
  * replaces special key chars like Tab and Enter
  *
  * @param string key
  * @return string key
  */
function app_replaceSpecialChar(key) {

  switch(key) {

    case "Tab":     return "↹";
    case "Enter":   return "⏎";
    case "⏎":       return "Enter";
    case "↹":       return "Tab";
    default:        return key;
  }
}

/**
  * checks if the entered key matches the whitespace
  * (special) character
  *
  * @param string key
  * @param string nextChar
  * @return boolean isWhitespace
  */
function app_matchesWhitespace(key, nextChar) {

  return (key === " " && nextChar === "␣");
}

/**
  * load first line and change app state to running
  */
function app_startLection() {

  // set text to line
  var line = sequence.lines[sequence.index];
  dp_setNormalText(line);

  // get first character and highlight corresponding key
  var nextKeyId = kb_getKeyIdFromKey(line.charAt(0));
  kb_highlightKey(nextKeyId);

  app_changeState(STATE_RUNNING);
}

/**
  * user has reached end of current line,
  * load next line and update progress bar
  */
function app_nextLine() {

  sequence.index++;

  // update progress bar
  pb_update();

  if( ! misc_assignmentVisible)
    kb_unhighlightKey(kb_lastHighlightedKeyId);

  if(sequence.index === sequence.lines.length) {  // there are no more lines

    // reset display and keyboard overlay
    dp_setGreenText("");
    dp_setRedText("");
    dp_setNormalText("");

    // change app state to finished
    app_changeState(STATE_FINISHED);
    return;
  }

  var line = sequence.lines[sequence.index];

  dp_setGreenText("");
  dp_setRedText("");
  dp_setNormalText(line);

  kb_highlightKey(kb_getKeyIdFromKey(line.charAt(0)));

  dp_lineSlideIn();
}

/**
  * upload results to server and redirect to page which shows results
  */
function app_uploadResults() {

  var stats = "Velocity: " + tm_velocity.toFixed(1) + " Keys/min<br>Correct characters: " + tm_keystrokes + "<br>Errors: " + app_errorCount + "<br>Ratio: " + ( Math.min(app_errorCount / tm_keystrokes, 1) * 100.0).toFixed(1) + "%";

  $("#model_finished_body").html(stats);

  $("#modal_finished").modal({
    'backdrop': 'static',
    'keyboard': false
  });
}
