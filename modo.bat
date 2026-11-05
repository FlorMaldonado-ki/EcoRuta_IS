@echo off
REM Cambia las URLs de los .env entre el emulador de Android y el navegador de la laptop.
REM   modo.bat web        -> app en http://localhost:3000; enlaces de correo con la IP de la laptop
REM                          en la red (para abrirlos desde el celular en la misma Wi-Fi)
REM   modo.bat celular    -> todo con la IP de la laptop en la red (Expo Go en el celular, misma Wi-Fi;
REM                          tambien sirve para el navegador de la laptop)
REM   modo.bat emulador   -> todo en http://10.0.2.2:3000
REM Despues de cambiar: reinicia el backend y Expo con  npx expo start -c

setlocal
set "MODO=%~1"
if "%MODO%"=="" set /p "MODO=Modo (web / celular / emulador): "
if /i not "%MODO%"=="web" if /i not "%MODO%"=="celular" if /i not "%MODO%"=="emulador" (
  echo Modo no valido: "%MODO%". Usa: web, celular o emulador
  exit /b 1
)

set "RAIZ=%~dp0"
powershell -NoProfile -Command ^
  "$modo='%MODO%'.ToLower();" ^
  "if ($modo -ne 'emulador') {" ^
  "  $ruta = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Sort-Object RouteMetric | Select-Object -First 1;" ^
  "  $ip = if ($ruta) { (Get-NetIPAddress -AddressFamily IPv4 -InterfaceIndex $ruta.InterfaceIndex | Select-Object -First 1).IPAddress };" ^
  "  if (-not $ip) { $ip = 'localhost'; Write-Host 'No se detecto la IP de la red; los correos usaran localhost' };" ^
  "  $back='http://'+$ip+':3000'; $front= if ($modo -eq 'web') { 'http://localhost:3000' } else { $back }" ^
  "} else { $front='http://10.0.2.2:3000'; $back=$front };" ^
  "function Fijar($f,$k,$u){ $t=[IO.File]::ReadAllText($f); $t=[regex]::Replace($t,'(?m)^'+$k+'=.*$',$k+'='+$u); [IO.File]::WriteAllText($f,$t,(New-Object Text.UTF8Encoding $false)) };" ^
  "Fijar '%RAIZ%frontend\.env' 'EXPO_PUBLIC_API_URL' $front;" ^
  "Fijar '%RAIZ%backend\.env' 'PUBLIC_API_URL' $back"
if errorlevel 1 exit /b 1

echo Listo: modo %MODO%
findstr /b "EXPO_PUBLIC_API_URL=" "%RAIZ%frontend\.env"
findstr /b "PUBLIC_API_URL=" "%RAIZ%backend\.env"
echo Reinicia el backend y Expo:  npx expo start -c
endlocal
