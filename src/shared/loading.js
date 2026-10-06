/* Loading lines: while a page waits for its data, the line under "Loading the latest ..." changes every
   few seconds with a light remark that fits the time of day where the viewer is (their own clock, since
   people open the hub all around the world). It stops as soon as the data shows or an error replaces it. */
(function(){
  var msg = document.getElementById("emptyMsg"), box = document.getElementById("emptyState"), title = document.getElementById("emptyTitle");
  if (!msg || !box || !title) return;

  var LINES = {
    early: [
      "Early start? The numbers are still putting their shoes on.",
      "Brewing the first coffee of the day, and your projects.",
      "Waking the projects up gently. Some of them are not morning people.",
      "Up before the inbox fills. Nice. Nearly there."
    ],
    morning: [
      "Lining the projects up in a nice orderly queue.",
      "Counting every project twice, so you only have to look once.",
      "Polishing the numbers before your first meeting.",
      "Morning stand-up for the data: everyone's here, just finding a seat."
    ],
    midday: [
      "The data popped out for lunch. Fetching it back.",
      "Loading faster than the lunch queue. Probably.",
      "Half the day done, and the projects are almost ready."
    ],
    afternoon: [
      "Beating the afternoon slump, one project at a time.",
      "Fetching the numbers. The afternoon coffee is optional.",
      "Herding projects into rows. They're cooperative today.",
      "Your projects are on their way, unlike that meeting that could have been an email."
    ],
    evening: [
      "Working late? The projects are too.",
      "Rounding up the last projects before they head home.",
      "One last look before dinner? Coming right up."
    ],
    night: [
      "Burning the midnight oil with you.",
      "The projects are asleep. Waking them quietly.",
      "Night shift, wherever you are in the world. Nearly there.",
      "Somewhere it's already morning. Here, your data is on its way."
    ],
    any: [
      "Checking every date, owner and stage, so you don't have to.",
      "Teaching the numbers to stand in straight columns.",
      "Good data takes a moment. Great data takes two.",
      "Tip: once this loads, ask the assistant (bottom right) anything about your projects."
    ]
  };
  var SLOW = [
    [12000, "Still loading. A big portfolio or a busy connection can take a little longer."],
    [30000, "This is taking longer than usual. Hang on a moment longer."]
  ];

  function partOf(h){
    return h >= 5 && h < 9 ? "early" : h < 12 && h >= 9 ? "morning" : h >= 12 && h < 14 ? "midday"
         : h >= 14 && h < 17 ? "afternoon" : h >= 17 && h < 21 ? "evening" : "night";
  }
  function shuffle(a){ for (var i = a.length - 1; i > 0; i--){ var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  var now = new Date(), part = partOf(now.getHours()), day = now.getDay();
  var extra = day === 5 ? ["It's Friday. Even the data is in a hurry."]
            : day === 1 ? ["Monday mode: the data is easing in too."]
            : day === 0 || day === 6 ? ["Weekend visit? We won't tell anyone."] : [];
  /* the time-of-day lines come first, then the rest, each group in a fresh order */
  var queue = shuffle(LINES[part].slice()).concat(shuffle(extra.concat(LINES.any)));
  var start = Date.now(), i = 0, slowShown = 0;

  msg.setAttribute("data-part", part);
  msg.setAttribute("aria-live", "off");
  msg.style.transition = "opacity .35s";
  msg.textContent = queue[0];

  function loading(){ return box.isConnected && !box.hidden && /^Loading/.test(title.textContent); }
  var timer = setInterval(function(){
    if (!loading()){ clearInterval(timer); msg.style.opacity = ""; return; }
    var t = Date.now() - start, next;
    if (slowShown < SLOW.length && t >= SLOW[slowShown][0]) next = SLOW[slowShown++][1];
    else { i = (i + 1) % queue.length; next = queue[i]; }
    msg.style.opacity = "0";
    setTimeout(function(){ if (loading()){ msg.textContent = next; msg.style.opacity = "1"; } else msg.style.opacity = ""; }, 350);
  }, 3500);
})();
