!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "WinVer.nsh"
!include "LogicLib.nsh"

Var ContextMenuCheckbox
Var AutoStartCheckbox
Var DoContextMenu
Var DoAutoStart

; ── Custom options page ──────────────────────────────────────────

!macro customPageAfterChangeDir
  Page custom OptionsPageCreate OptionsPageLeave
!macroend

Function OptionsPageCreate
  !insertmacro MUI_HEADER_TEXT "Installation Options" "Choose additional tasks."
  nsDialogs::Create 1018
  Pop $0

  ${NSD_CreateCheckbox} 0 0u 100% 12u "Add $\"Open with Jait$\" to Windows Explorer context menu"
  Pop $ContextMenuCheckbox
  ${NSD_Check} $ContextMenuCheckbox

  ${NSD_CreateCheckbox} 0 20u 100% 12u "Start Jait automatically when you log in"
  Pop $AutoStartCheckbox

  nsDialogs::Show
FunctionEnd

Function OptionsPageLeave
  ${NSD_GetState} $ContextMenuCheckbox $DoContextMenu
  ${NSD_GetState} $AutoStartCheckbox $DoAutoStart
FunctionEnd

; ── Install: context menu + auto-start ───────────────────────────

!macro customInstall
  ${If} $DoContextMenu == ${BST_CHECKED}
    ; Determine if we should use the Win11 modern menu (AppX) or classic registry
    Var /GLOBAL UseModernMenu
    StrCpy $UseModernMenu "0"

    ${If} ${AtLeastBuild} 22000
      ; Check if user forced the classic Win10 context menu
      ; (reg key {86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\InprocServer32 exists)
      ClearErrors
      ReadRegStr $1 HKCU "Software\Classes\CLSID\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\InprocServer32" ""
      ${If} ${Errors}
        ; Classic menu is NOT forced — use modern AppX approach
        StrCpy $UseModernMenu "1"
      ${EndIf}
    ${EndIf}

    ${If} $UseModernMenu == "1"
      ; ── Windows 11 modern context menu via AppX sparse package ──
      ; The DLL + AppxManifest are in resources\appx\ (added by electron-builder).
      ; Register the manifest directly (requires dev mode or signed package).
      ; Falls through silently if registration fails — classic entries are the fallback.
      nsExec::ExecToLog 'powershell.exe -NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -Command "\
        try { \
          $$pkgs = Get-AppxPackage -Name ''Widev.Jait'' 2>$$null; \
          foreach ($$p in $$pkgs) { Remove-AppxPackage -Package $$p.PackageFullName 2>$$null }; \
          Add-AppxPackage -Register ''$INSTDIR\resources\appx\AppxManifest.xml'' -ExternalLocation ''$INSTDIR'' \
        } catch { }"'
      Pop $0 ; ignore exit code

      ; Marker so uninstall knows to remove the AppX
      WriteRegStr HKCU "Software\Jait" "AppxInstalled" "1"

      ; Title for the Win11 verb
      WriteRegStr HKCU "Software\Classes\JaitContextMenu" "Title" "Open with Jait"

    ${EndIf}

    ; Always write classic registry entries as fallback
    ; (shown under "Show more options" on Win11, or directly on Win10)

    ; Right-click on a folder in the tree
    WriteRegStr HKCU "Software\Classes\Directory\shell\Jait" "" "Open with Jait"
    WriteRegStr HKCU "Software\Classes\Directory\shell\Jait" "Icon" "$\"$INSTDIR\${APP_EXECUTABLE_FILENAME}$\""
    WriteRegStr HKCU "Software\Classes\Directory\shell\Jait\command" "" "$\"$INSTDIR\${APP_EXECUTABLE_FILENAME}$\" $\"%V$\""

    ; Right-click on folder background (inside an open folder)
    WriteRegStr HKCU "Software\Classes\Directory\Background\shell\Jait" "" "Open with Jait"
    WriteRegStr HKCU "Software\Classes\Directory\Background\shell\Jait" "Icon" "$\"$INSTDIR\${APP_EXECUTABLE_FILENAME}$\""
    WriteRegStr HKCU "Software\Classes\Directory\Background\shell\Jait\command" "" "$\"$INSTDIR\${APP_EXECUTABLE_FILENAME}$\" $\"%V$\""
  ${EndIf}

  ; Auto-start on login
  ${If} $DoAutoStart == ${BST_CHECKED}
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Jait" "$\"$INSTDIR\${APP_EXECUTABLE_FILENAME}$\" --hidden"
  ${EndIf}
!macroend

; ── Uninstall: clean up everything ───────────────────────────────

!macro customUnInstall
  ; Remove AppX package if it was installed
  ReadRegStr $0 HKCU "Software\Jait" "AppxInstalled"
  ${If} $0 == "1"
    nsExec::ExecToLog 'powershell.exe -NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -Command "\
      $$pkgs = Get-AppxPackage -Name ''Widev.Jait'' 2>$$null; \
      foreach ($$p in $$pkgs) { Remove-AppxPackage -Package $$p.PackageFullName 2>$$null }"'
    DeleteRegValue HKCU "Software\Jait" "AppxInstalled"
    DeleteRegKey HKCU "Software\Classes\JaitContextMenu"
  ${EndIf}

  ; Remove classic registry context menu entries
  DeleteRegKey HKCU "Software\Classes\Directory\shell\Jait"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\Jait"

  ; Remove auto-start
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Jait"
!macroend
