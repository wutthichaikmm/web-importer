; Built by packaging/build.mjs, which passes AppVersion and SourceDir.
#define AppName "Web Importer"

[Setup]
AppId={{6F3C8A52-9B1E-4D7A-8E40-2C5D1B7A93E6}
AppName={#AppName}
AppVersion={#AppVersion}
DefaultDirName={autopf}\{#AppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
Compression=lzma2/max
SolidCompression=yes
OutputDir=..\dist\installer
OutputBaseFilename=WebImporter-Setup
UninstallDisplayIcon={app}\WebImporter.exe
WizardStyle=modern

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Shortcuts:"

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\WebImporter.exe"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\WebImporter.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\WebImporter.exe"; Description: "Launch {#AppName}"; Flags: nowait postinstall skipifsilent
