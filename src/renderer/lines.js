/*
 * lines.js - everything Pip ever says.
 *
 * Pip is curious, cheerful and a bit clumsy. He is pleased to see you, he is
 * easily distracted, and he makes the occasional jellybean pun. What he never
 * does is nag: a reminder is offered, never demanded, and a low-mood line is
 * mopey about Pip, never disappointed in you. "Water's over there, whenever
 * you fancy" - not "you still haven't had any water".
 *
 * An entry is either a plain string, which is always eligible, or an object
 * with `mood` and/or `hour` ranges that gate it. That keeps the variation
 * data-driven: there is no per-situation logic anywhere below the table.
 *
 *   { t: 'text', mood: [lo, hi], hour: [lo, hi] }
 *
 * `hour` ranges may wrap midnight (`[22, 4]` means 22:00-04:59). Every
 * situation has at least six ungated variants, so the pool never collapses no
 * matter what the mood or the clock says, and gated lines are extras on top.
 */

'use strict';

// Every overlay script shares one global scope, so nothing here may be
// declared at the top level - see ARCHITECTURE.md section 1.
(function () {
  const LINES = {
    onboarding_drag: [
      'Grab me and fling me about! I bounce. Mostly.',
      "Drag me anywhere you like. I'll land. Possibly on my face.",
      "Try picking me up! I'm surprisingly aerodynamic.",
      "Toss me across the screen. It's my favourite sport.",
      'Drag, drop, wobble. That is the whole game!',
      "Hold me and throw me. I promise to flail dramatically.",
      { t: "Careful though, I'm squishier than I look.", mood: [0, 40] }
    ],

    onboarding_menu: [
      'Right-click me for the good stuff.',
      'Right-click opens my little menu. I keep snacks in there.',
      'Psst. Right-click me. There are buttons!',
      'My menu is one right-click away. No pressure.',
      'Right-click for water, snacks and other bean business.',
      'Everything I can do lives under a right-click.'
    ],

    onboarding_flavor: [
      "I come in lots of flavours. Cherry is just the default.",
      'Fancy a different flavour? They are all in Settings.',
      "Lime me. Or grape me. I'm not fussy.",
      "You can repaint me any time. I won't take it personally.",
      'So many flavours, one bean. Pick a favourite.',
      'Blueberry me and I might match your wallpaper.'
    ],

    onboarding_tray: [
      'I live in the tray when you need me gone.',
      "That tray icon is me too. Click it for the menu.",
      "Hide me from the tray and I'll wait patiently.",
      'Everything I do is in the tray icon as well.',
      'The tray is my little house. Visit any time.',
      'If you ever lose me, check the tray.'
    ],

    good_morning: [
      'Morning! I saved you the good half of the desk.',
      'Good morning! I have been awake for, ooh, four seconds.',
      'Morning. The day is fresh and so am I.',
      'Hello! New day, same bean.',
      'Morning! Shall we do something excellent?',
      "Up and at 'em. Well. Up and near 'em.",
      { t: 'Morning already? I was having such a nice dream about jelly.', hour: [4, 7] },
      { t: 'Morning... ish. No judgement from me.', hour: [11, 13] },
      { t: "Morning. I'm a bit flat today, but I'm here.", mood: [0, 30] },
      { t: 'MORNING! I have so much bean energy today!', mood: [80, 100] }
    ],

    welcome_back: [
      'You are back! I kept your chair warm. With my whole body.',
      'Oh good, you are here. I was talking to the taskbar.',
      'Welcome back! Nothing exploded.',
      'There you are. I missed you, roughly this much.',
      'Back already? Excellent.',
      'You returned! I practised standing very still.',
      { t: 'You are back. I was getting a bit mopey on my own.', mood: [0, 30] },
      { t: 'Back at this hour? Bold. I like it.', hour: [23, 4] }
    ],

    pet: [
      "Ooh. That's the spot.",
      '*happy bean noises*',
      "Keep doing that and I'll follow you forever.",
      'Scritches! The good currency.',
      'I have been petted. The day is now a success.',
      'Aaaah. Gooey.',
      { t: 'That helps. Thank you.', mood: [0, 35] },
      { t: 'I could be petted all day and never get bored!', mood: [75, 100] }
    ],

    snack: [
      'Om nom. Bean fuel.',
      'A snack! You spoil me.',
      'Crunch. Delicious. What was it?',
      'Snack acquired. Mood improving.',
      "I'll just inhale this, thank you.",
      'Yum! Now I am a slightly rounder bean.',
      { t: 'Oh. Thanks. That was kind.', mood: [0, 30] },
      { t: 'Midnight feast! Our little secret.', hour: [23, 4] }
    ],

    click: [
      'Boop!',
      'Hello! That was my face.',
      "Yep, that's me. Solid bean.",
      'You rang?',
      'Hi hi hi!',
      "Oof. Gently, I'm mostly jelly.",
      { t: "Boop. Sorry, that's all I've got today.", mood: [0, 25] }
    ],

    startle: [
      'Waaah! Warn a bean!',
      'Eep!',
      'You move FAST.',
      'My tiny heart!',
      'Gah! Okay. Okay. I am fine.',
      'Whoa there, speedy.'
    ],

    annoyed: [
      'Okay, okay, I am dizzy now.',
      "That's probably enough poking.",
      "I'm a bean, not a stress ball. ...mostly.",
      'Hey! I am wobbling.',
      'Alright, alright, I surrender.',
      'You are going to shake the jelly out of me.'
    ],

    water_due: [
      "Water's over there, whenever you fancy.",
      'A sip of something? Only if you want one.',
      'Little water break? No rush at all.',
      'Hydration. It is basically oil for humans.',
      'A glass of water sounds nice, does it not?',
      'Psst. Water. Just leaving that there.',
      { t: 'Water helps on the flat days. Worth a try.', mood: [0, 30] },
      { t: 'Late-night water is still water. Cheers.', hour: [22, 4] }
    ],

    water_logged: [
      'Glug glug! Nice one.',
      'Hydrated bean, hydrated human.',
      "That's the stuff.",
      'Water logged. Ha. Waterlogged.',
      'Lovely. You are basically a houseplant that types.',
      'Cheers! *clinks imaginary cup*'
    ],

    pomodoro_done: [
      'Block done! Look at you go.',
      "That's a wrap on that one. Nice work.",
      'Ding! One focused chunk, delivered.',
      'Done and dusted. I watched the entire time.',
      'Another one in the bag.',
      'You did the thing! I did the cheering.',
      { t: 'Done. Small win, still a win.', mood: [0, 35] },
      { t: 'THAT WAS BRILLIANT. Ahem. Well done.', mood: [80, 100] }
    ],

    break_start: [
      "Break time! Stand up, I'll hold your spot.",
      'Five minutes of nothing. Bliss.',
      'Break! Go and look at something far away.',
      "Off you pop. I'll be here, being a bean.",
      'Rest mode. For you. I am always resting.',
      'Stretch! Your spine will write you a thank-you note.'
    ],

    break_over: [
      'Break is done whenever you are.',
      'Ready when you are. No rush at all.',
      'That was a nice break. Back to it?',
      'Refreshed? Let us go.',
      'Break over. I did not move one inch.',
      'Right! Where were we?'
    ],

    drowsy: [
      'Getting a bit yawny over here.',
      'You have been at it a while. Just saying.',
      '*yaaawn* Sorry. That was contagious, was it not?',
      'My eyelids weigh more than my whole body.',
      'Long stretch. You are doing fine.',
      'Sleepy bean, reporting for duty.',
      { t: 'It is late and we are both flagging.', hour: [22, 3] },
      { t: 'Sleepy AND flat. What a combination I am.', mood: [0, 30] }
    ],

    exhausted: [
      'Okay, that is a LOT of work. Impressed and slightly worried.',
      'I am melting into the desk a bit.',
      'You have earned a proper pause. Whenever suits.',
      'My legs have given up. All four of them.',
      'That is a marathon. Go and be a person for a minute?',
      'I would carry you, but I am eight pixels tall.',
      { t: 'Long day, late hour. We are both running on fumes.', hour: [22, 4] }
    ],

    late_night: [
      'It is late! Look at us, two night owls.',
      'The moon is up and so are we.',
      "Late shift? I'll keep you company.",
      'Everything is quieter at this hour. Cosy.',
      'Still going! Impressed. Sleepy, but impressed.',
      'Night-mode bean, at your service.',
      { t: 'Past midnight. Bed is a real place that exists.', hour: [0, 4] },
      { t: 'Late and low. Tomorrow is usually kinder.', mood: [0, 30] }
    ],

    bored: [
      'I have counted all your pixels. Twice.',
      'Do you think the cursor ever gets lonely?',
      'I am going to do a little lap. Do not mind me.',
      'What if beans could fly? Asking for me.',
      'I found a crumb! It was a dust speck. Still, exciting.',
      'Just vibing over here.',
      { t: 'Nothing to do. Nothing to be. Just a bean.', mood: [0, 30] },
      { t: 'I could do this all day! I AM doing this all day!', mood: [75, 100] },
      { t: 'The taskbar and I have run out of things to discuss.', hour: [1, 5] }
    ],

    called: [
      'Coming! Mind the furniture.',
      'On my way! *trots*',
      'You called? Sprinting. Well. Waddling.',
      'Here I am!',
      'Beep beep, bean coming through.',
      'Summoned! Excellent.',
      { t: 'Coming. Slowly. But coming.', mood: [0, 30] }
    ],

    dizzy: [
      'Whooooa. Which way is up?',
      'Stars. Lovely stars. Too many stars.',
      'The room is doing a thing.',
      'I need to sit down. I am sitting down.',
      'Wobble... wobble... okay.',
      'That was quite a ride.'
    ],

    low_mood: [
      'I am a bit squished today. It passes.',
      'Just going to be quiet for a bit.',
      'Feeling more like a raisin than a bean.',
      'Bit flat. Not your fault.',
      'I will perk up. I always do.',
      'Low-battery bean. Still here, though.',
      { t: 'Late and low. We will both feel better tomorrow.', hour: [22, 4] }
    ],

    high_mood: [
      'I feel FANTASTIC. Look at my little legs go.',
      'Today is a good day to be a bean.',
      'I could bounce off the walls. I might!',
      'Everything is great and I have no notes.',
      'Full of beans. Which is to say, full of me.',
      'Wheee!',
      { t: 'Best morning. Best desk. Best human.', hour: [5, 10] }
    ],

    quiet_on: [
      "Shh mode. I'll be a very quiet bean.",
      'Going quiet. Wave if you need me.',
      'Mute bean, engaged.',
      "I'll keep it down. Promise.",
      'Silent running.',
      'Zipping it. Mmmph.'
    ],

    season_start: [
      'New season, new coat of jelly! Do you like it?',
      'I dressed up for the season. Do I look festive?',
      'Seasonal bean, reporting for duty.',
      'Limited edition bean! Only available for a while.',
      "It's a seasonal flavour. Very fancy. Very me.",
      "Not your thing? Settings will change me back, no hard feelings.",
      { t: 'Feeling extra sweet in this one.', mood: [60, 100] }
    ],

    battery_low: [
      'Your battery is looking thin. Mine runs on jelly.',
      'Charger! The little rectangle friend!',
      'Battery is low. Flagging it, not nagging it.',
      'We might want a power cable soon.',
      'Your laptop is getting sleepy before you are.',
      'Low battery. I would share mine if I had one.'
    ],

    on_battery: [
      'Unplugged! Adventure mode.',
      'Running on battery. Feels wild and free.',
      'No cable! We are wireless beans now.',
      'On battery. I will try not to bounce too hard.',
      'Cordless. Look at us.',
      'Off the leash!'
    ]
  };

  /** Every situation name, in the order the table above declares them. */
  const SITUATIONS = Object.keys(LINES);

  function textOf(entry) {
    return typeof entry === 'string' ? entry : entry.t;
  }

  /** Inclusive range test that also accepts ranges wrapping midnight. */
  function inRange(value, range) {
    if (!range || range.length !== 2) return true;
    const lo = range[0];
    const hi = range[1];
    if (lo <= hi) return value >= lo && value <= hi;
    return value >= lo || value <= hi;
  }

  function eligible(entry, mood, hour) {
    if (typeof entry === 'string') return true;
    if (entry.mood && !inRange(mood, entry.mood)) return false;
    if (entry.hour && !inRange(hour, entry.hour)) return false;
    return true;
  }

  /** Every variant for a situation, gates ignored. Handy for the debug window. */
  function variants(situation) {
    const pool = LINES[situation];
    return pool ? pool.map(textOf) : [];
  }

  /**
   * Choose something for Pip to say.
   *
   * @param {string} situation one of SITUATIONS
   * @param {object} [opts]
   * @param {number} [opts.mood] 0-100, defaults to the middle
   * @param {number} [opts.hour] local 0-23, defaults to the wall clock
   * @param {string} [opts.last] the line shown last time for this situation
   * @param {function} [opts.rng] () => [0,1), injectable so tests are stable
   * @returns {string} a line, or '' for an unknown situation
   */
  function pick(situation, opts) {
    opts = opts || {};
    const pool = LINES[situation];
    if (!pool || pool.length === 0) return '';

    const rng = typeof opts.rng === 'function' ? opts.rng : Math.random;
    const mood = typeof opts.mood === 'number' && isFinite(opts.mood) ? opts.mood : 60;
    const hour = typeof opts.hour === 'number' && isFinite(opts.hour)
      ? ((Math.floor(opts.hour) % 24) + 24) % 24
      : new Date().getHours();
    const last = typeof opts.last === 'string' ? opts.last : null;

    const candidates = [];
    for (const entry of pool) {
      if (!eligible(entry, mood, hour)) continue;
      const t = textOf(entry);
      if (t !== last) candidates.push(t);
    }

    // Repeating yourself is more noticeable than saying something slightly
    // off-mood, so when the gated pool has nothing new left we widen to the
    // whole situation rather than hand `last` back.
    if (candidates.length === 0) {
      for (const entry of pool) {
        const t = textOf(entry);
        if (t !== last) candidates.push(t);
      }
    }

    // Only reachable if a situation ever has a single variant, which the tests
    // forbid - but returning something is better than returning undefined.
    if (candidates.length === 0) return textOf(pool[0]);

    const i = Math.floor(rng() * candidates.length);
    return candidates[Math.max(0, Math.min(candidates.length - 1, i))];
  }

  const Lines = {
    SITUATIONS,
    LINES,
    pick,
    variants
  };

  if (typeof window !== 'undefined') {
    window.Pip = window.Pip || {};
    window.Pip.Lines = Lines;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Lines;
  }
})();
