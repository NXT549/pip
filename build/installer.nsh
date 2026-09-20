; installer.nsh - extra uninstall cleanup for Pip.
;
; Pip registers its own "launch at login" entry at runtime via
; app.setLoginItemSettings, which writes to HKCU\...\CurrentVersion\Run.
; NSIS knows nothing about that entry, so without this the shortcut would
; survive an uninstall and point at an executable that no longer exists.

!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.pip.desktopbuddy"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Pip"
!macroend
