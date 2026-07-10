; Inno Setup — Actuarius Enterprise tek tıklık installer (offline)
; Derle:  iscc actuarius.iss   (PyInstaller çıktısı hazır olmalı)
; Girdi:  ../desktop/dist/Actuarius   →   Çıktı: Output/Actuarius-Setup.exe

#define AppName "Actuarius Enterprise"
#define AppVersion "2.0.0"
#define AppPublisher "Actuarius"
#define AppExe "Actuarius.exe"

[Setup]
AppId={{7B2E9A10-4C3D-4F9E-9B1A-ACTUARIUSENT}}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={autopf}\Actuarius
DefaultGroupName=Actuarius
DisableProgramGroupPage=yes
OutputDir=Output
OutputBaseFilename=Actuarius-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
; Kullanıcı başına kurulum — yönetici gerekmez
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "turkish"; MessagesFile: "compiler:Languages\Turkish.isl"

[Tasks]
Name: "desktopicon"; Description: "Masaüstü kısayolu oluştur"; GroupDescription: "Kısayollar:"

[Files]
Source: "..\desktop\dist\Actuarius\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExe}"
Name: "{userdesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExe}"; Description: "Uygulamayı başlat"; Flags: nowait postinstall skipifsilent
