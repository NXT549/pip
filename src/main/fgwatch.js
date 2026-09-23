/*
 * fgwatch.js - which window is in front?
 *
 * Electron has no API for another app's window, and Pip has no native
 * modules, so this keeps ONE hidden, long-lived PowerShell process running
 * a tiny loop over three Win32 calls (GetForegroundWindow, the owning
 * process, and whether the window fills its monitor). It prints a line of
 * JSON only when something changes, so it costs nothing while you sit in
 * one app.
 *
 * Window titles are only read at all when the caller asks for them, and
 * even then only to be matched against a keyword list in apps.js.
 *
 * Windows only. Anywhere else, or if PowerShell will not start, start()
 * reports that it is unavailable and Pip simply does without.
 */

'use strict';

const { spawn } = require('child_process');

const POLL_MS = 1500;
const MAX_RESTARTS = 3;

/** The PowerShell loop. `__TITLES__` is replaced with $true or $false. */
const SCRIPT = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class PipFg {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO { public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags; }
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr h, uint flags);
  [DllImport("user32.dll")] public static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFO mi);
  public static bool Fullscreen(IntPtr h) {
    StringBuilder cls = new StringBuilder(64);
    GetClassName(h, cls, 64);
    string c = cls.ToString();
    if (c == "Progman" || c == "WorkerW" || c == "Shell_TrayWnd") return false;
    RECT r;
    if (!GetWindowRect(h, out r)) return false;
    MONITORINFO mi = new MONITORINFO();
    mi.cbSize = Marshal.SizeOf(typeof(MONITORINFO));
    if (!GetMonitorInfo(MonitorFromWindow(h, 2), ref mi)) return false;
    return r.L <= mi.rcMonitor.L && r.T <= mi.rcMonitor.T && r.R >= mi.rcMonitor.R && r.B >= mi.rcMonitor.B;
  }
}
"@
$titles = __TITLES__
$last = ''
while ($true) {
  $h = [PipFg]::GetForegroundWindow()
  $procId = [uint32]0
  [void][PipFg]::GetWindowThreadProcessId($h, [ref]$procId)
  $name = ''
  $p = Get-Process -Id $procId -ErrorAction SilentlyContinue
  if ($p) { $name = $p.ProcessName }
  $title = ''
  if ($titles) {
    $sb = New-Object System.Text.StringBuilder 256
    [void][PipFg]::GetWindowText($h, $sb, 256)
    $title = $sb.ToString()
  }
  $fs = [PipFg]::Fullscreen($h)
  $line = (@{ p = $name; t = $title; fs = $fs } | ConvertTo-Json -Compress)
  if ($line -ne $last) {
    [Console]::Out.WriteLine($line)
    [Console]::Out.Flush()
    $last = $line
  }
  Start-Sleep -Milliseconds __POLL__
}
`;

function encode(script) {
  return Buffer.from(script, 'utf16le').toString('base64');
}

/**
 * Start watching.
 *
 * @param {object} opts
 * @param {boolean} opts.titles        read window titles for keyword matching
 * @param {function} opts.onLine       (rawLine) => void, one per change
 * @param {function} [opts.onStatus]   ('running'|'unavailable'|'stopped', detail)
 * @param {object} [opts.logger]
 * @returns {{stop: function}}
 */
function start(opts) {
  const log = opts.logger || { info() {}, warn() {} };
  let child = null;
  let stopped = false;
  let restarts = 0;
  let buffer = '';

  if (process.platform !== 'win32') {
    if (opts.onStatus) opts.onStatus('unavailable', 'not Windows');
    return { stop() {} };
  }

  const script = SCRIPT.replace('__TITLES__', opts.titles ? '$true' : '$false').replace('__POLL__', String(POLL_MS));

  function launch() {
    try {
      child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encode(script)], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore']
      });
    } catch (err) {
      log.warn('app awareness: could not start the watcher', err);
      if (opts.onStatus) opts.onStatus('unavailable', err.message);
      return;
    }
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      let i;
      while ((i = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, i).trim();
        buffer = buffer.slice(i + 1);
        if (line) opts.onLine(line);
      }
      // a runaway line without a newline must not grow forever
      if (buffer.length > 8192) buffer = '';
    });
    child.on('error', (err) => {
      log.warn('app awareness: watcher error', err && err.message);
    });
    child.on('exit', (code) => {
      child = null;
      if (stopped) return;
      if (restarts >= MAX_RESTARTS) {
        log.warn('app awareness: watcher keeps exiting (' + code + '), giving up');
        if (opts.onStatus) opts.onStatus('unavailable', 'exited ' + code);
        return;
      }
      restarts++;
      setTimeout(() => { if (!stopped) launch(); }, 2000 * restarts);
    });
    if (opts.onStatus) opts.onStatus('running');
  }

  launch();

  return {
    stop() {
      stopped = true;
      if (child) {
        try { child.kill(); } catch (err) { /* already gone */ }
        child = null;
      }
      if (opts.onStatus) opts.onStatus('stopped');
    }
  };
}

module.exports = { start, SCRIPT, POLL_MS };
