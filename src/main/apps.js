/*
 * apps.js - what kind of thing is in front of you?
 *
 * Pure: turns the foreground window's process name (and, if you allow it,
 * its title) into one coarse category Pip can react to. fgwatch.js does the
 * watching; this file only decides.
 *
 * Privacy: the category is all that leaves this function. Titles are
 * matched against the keyword list below and then thrown away - they are
 * never stored, logged, or sent anywhere.
 */

'use strict';

const CATEGORIES = [
  'code', 'terminal', 'browser', 'video', 'music', 'meeting', 'chat',
  'writing', 'design', 'email', 'game', 'other'
];

/** Lower-case process name (no .exe) -> category. */
const PROCESSES = {
  // code
  code: 'code', 'code - insiders': 'code', cursor: 'code', windsurf: 'code', devenv: 'code',
  idea64: 'code', idea: 'code', pycharm64: 'code', webstorm64: 'code', rider64: 'code',
  clion64: 'code', goland64: 'code', phpstorm64: 'code', rubymine64: 'code', studio64: 'code',
  sublime_text: 'code', 'notepad++': 'code', atom: 'code', zed: 'code', eclipse: 'code',
  godot: 'code', unity: 'code', unrealeditor: 'code', fleet: 'code', claude: 'code',
  // terminal
  windowsterminal: 'terminal', wt: 'terminal', cmd: 'terminal', powershell: 'terminal',
  pwsh: 'terminal', conhost: 'terminal', alacritty: 'terminal', 'wezterm-gui': 'terminal',
  mintty: 'terminal', hyper: 'terminal', tabby: 'terminal', warp: 'terminal',
  // browsers - refined by title, if titles are allowed
  chrome: 'browser', msedge: 'browser', firefox: 'browser', brave: 'browser', opera: 'browser',
  vivaldi: 'browser', arc: 'browser', librewolf: 'browser', waterfox: 'browser', floorp: 'browser',
  // video
  vlc: 'video', 'mpc-hc64': 'video', 'mpc-hc': 'video', 'mpc-be64': 'video', potplayermini64: 'video',
  potplayermini: 'video', wmplayer: 'video', mpv: 'video', netflix: 'video', 'video.ui': 'video',
  plex: 'video', kodi: 'video', stremio: 'video',
  // music
  spotify: 'music', itunes: 'music', applemusic: 'music', tidal: 'music', foobar2000: 'music',
  musicbee: 'music', aimp: 'music', deezer: 'music', 'amazon music': 'music',
  // meetings
  zoom: 'meeting', teams: 'meeting', 'ms-teams': 'meeting', msteams: 'meeting', webex: 'meeting',
  ciscowebexstart: 'meeting', ciscocollabhost: 'meeting', skype: 'meeting', gotomeeting: 'meeting',
  // chat
  slack: 'chat', discord: 'chat', telegram: 'chat', whatsapp: 'chat', signal: 'chat',
  messenger: 'chat', element: 'chat', mattermost: 'chat',
  // writing and documents
  winword: 'writing', excel: 'writing', powerpnt: 'writing', onenote: 'writing', notion: 'writing',
  obsidian: 'writing', notepad: 'writing', wordpad: 'writing', evernote: 'writing', typora: 'writing',
  scrivener: 'writing', libreoffice: 'writing', soffice: 'writing', 'soffice.bin': 'writing', acrord32: 'writing',
  acrobat: 'writing', logseq: 'writing', joplin: 'writing',
  // design
  photoshop: 'design', illustrator: 'design', afterfx: 'design', 'adobe premiere pro': 'design',
  figma: 'design', aseprite: 'design', krita: 'design', 'gimp-2.10': 'design', gimp: 'design',
  blender: 'design', inkscape: 'design', clipstudiopaint: 'design', paintdotnet: 'design',
  mspaint: 'design', affinity: 'design', 'designer': 'design', resolve: 'design', procreate: 'design',
  // email
  outlook: 'email', olk: 'email', thunderbird: 'email', hxoutlook: 'email', mailspring: 'email',
  // games and launchers
  steam: 'game', steamwebhelper: 'game', epicgameslauncher: 'game', 'battle.net': 'game',
  riotclientux: 'game', minecraft: 'game', javaw: 'game', robloxplayerbeta: 'game',
  leagueclient: 'game', 'league of legends': 'game', galaxyclient: 'game'
};

/**
 * Title keywords, checked in order - the first match wins, so "YouTube
 * Music" is music before plain "YouTube" is video.
 */
const TITLE_RULES = [
  [/youtube music|spotify|soundcloud|apple music|bandcamp|deezer|tidal|pandora/i, 'music'],
  [/youtube|netflix|twitch|prime video|disney\+|hulu|vimeo|crunchyroll|max\b|plex|jellyfin/i, 'video'],
  [/google meet|zoom meeting|microsoft teams|whereby|jitsi|webex/i, 'meeting'],
  [/github|gitlab|bitbucket|stack overflow|stackoverflow|localhost|127\.0\.0\.1|codepen|codesandbox|replit|jsfiddle|vercel|devtools/i, 'code'],
  [/gmail|outlook|proton mail|protonmail|fastmail|inbox/i, 'email'],
  [/google docs|google sheets|google slides|notion|confluence|overleaf|dropbox paper|quip/i, 'writing'],
  [/figma|canva|photopea|excalidraw|miro|tldraw|dribbble/i, 'design'],
  [/discord|slack|whatsapp|messenger|telegram/i, 'chat']
];

/**
 * Windows that cover the screen without being a fullscreen app: the
 * desktop itself, the start menu, the lock screen, search, Pip.
 */
const SHELL = {
  explorer: 1, searchhost: 1, searchapp: 1, shellexperiencehost: 1, startmenuexperiencehost: 1,
  lockapp: 1, textinputhost: 1, applicationframehost: 0, pip: 1, electron: 1, idle: 1, '': 1
};

function normalise(name) {
  return String(name || '').toLowerCase().replace(/\.exe$/, '').trim();
}

/**
 * The category for a foreground window.
 * @param {{process:string, title?:string}} info
 * @param {{titles?:boolean}} [opts]  titles:false ignores the title entirely
 * @returns {string} one of CATEGORIES
 */
function categorize(info, opts) {
  opts = opts || {};
  const proc = normalise(info && info.process);
  let cat = PROCESSES[proc] || 'other';
  const title = opts.titles === false ? '' : String((info && info.title) || '');
  // A title only refines what a general-purpose app is showing: a browser
  // tab, or an unknown app. It never overrides a known editor.
  if (title && (cat === 'browser' || cat === 'other')) {
    for (const [re, c] of TITLE_RULES) {
      if (re.test(title)) { cat = c; break; }
    }
  }
  return cat;
}

/** A fullscreen window, as the helper reported it, and not the desktop shell. */
function isFullscreen(info) {
  if (!info || !info.fs) return false;
  return !SHELL[normalise(info.process)];
}

/**
 * Parse one line from the watcher. Returns null for anything that is not a
 * well-formed report, so a garbled line can never crash main.
 */
function parseLine(line) {
  let o;
  try { o = JSON.parse(String(line).trim()); } catch (err) { return null; }
  if (!o || typeof o !== 'object' || typeof o.p !== 'string') return null;
  return { process: o.p, title: typeof o.t === 'string' ? o.t : '', fs: !!o.fs };
}

module.exports = { CATEGORIES, PROCESSES, TITLE_RULES, categorize, isFullscreen, parseLine, normalise };
