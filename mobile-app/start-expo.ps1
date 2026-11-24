param(
    [switch]$Tunnel,
    [switch]$Usb
)

$ErrorActionPreference = "Stop"

Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "  Isyarat Kita - Expo Launcher Anti-Putus (Windows)" -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan

# 1. Deteksi IPv4 fisik (Wi-Fi / Ethernet yang memiliki Default Gateway)
#    Filter keluar adapter virtual: WSL, Hyper-V, Docker, CloudflareWARP, OpenVPN, VirtualBox, VMware
$excludedPattern = "vEthernet|WSL|Hyper-V|Docker|Cloudflare|WARP|OpenVPN|TAP|VirtualBox|VMware|Loopback|Bluetooth|Npcap"

$lanIp = $null
try {
    $candidates = Get-NetIPConfiguration | Where-Object {
        $_.IPv4DefaultGateway -ne $null -and
        $_.IPv4Address -ne $null -and
        $_.InterfaceAlias -notmatch $excludedPattern -and
        $_.InterfaceDescription -notmatch $excludedPattern
    } | ForEach-Object {
        $_.IPv4Address | Where-Object {
            $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*"
        }
    }

    if ($candidates) {
        # Prioritaskan 192.168.* atau 10.* terlebih dahulu
        $preferred = $candidates | Where-Object { $_.IPAddress -like "192.168.*" -or $_.IPAddress -like "10.*" } | Select-Object -First 1
        if ($preferred) {
            $lanIp = $preferred.IPAddress
        } else {
            $lanIp = ($candidates | Select-Object -First 1).IPAddress
        }
    }
} catch {
    # Fallback parsing ipconfig jika CIM tidak tersedia
    $ipconfigLines = ipconfig
    $currentAdapter = ""
    foreach ($line in $ipconfigLines) {
        if ($line -match "^(Ethernet|Wireless LAN) adapter (.+):") {
            $currentAdapter = $matches[2]
        } elseif ($line -match "IPv4 Address.*:\s*([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)" -and $currentAdapter -notmatch $excludedPattern) {
            $candidate = $matches[1]
            if ($candidate -notlike "127.*" -and $candidate -notlike "169.254.*") {
                $lanIp = $candidate
                break
            }
        }
    }
}

# Cek peringatan Cloudflare WARP / VPN
$warpActive = (ipconfig) -match "CloudflareWARP"
if ($warpActive) {
    Write-Host "[PERINGATAN] Adapter CloudflareWARP terdeteksi aktif!" -ForegroundColor Yellow
    Write-Host "             Jika HP sering terputus, matikan sementara Cloudflare WARP." -ForegroundColor Yellow
}

if (-not $lanIp) {
    Write-Host "[WARN] Gagal mendeteksi IPv4 LAN otomatis. Expo akan memakai deteksi default." -ForegroundColor Yellow
} else {
    $env:REACT_NATIVE_PACKAGER_HOSTNAME = $lanIp
    Write-Host "[OK] IPv4 LAN Asli   : $lanIp" -ForegroundColor Green
    Write-Host "[OK] Backend API URL : http://${lanIp}:8000" -ForegroundColor Green
    Write-Host "[OK] Metro Bundler   : exp://${lanIp}:8081" -ForegroundColor Green
}

# 2. Mode Kabel USB (adb reverse)
if ($Usb) {
    Write-Host "`n[USB] Menjalankan adb reverse untuk port 8081 (Metro) & 8000 (FastAPI)..." -ForegroundColor Cyan
    try {
        adb reverse tcp:8081 tcp:8081
        adb reverse tcp:8000 tcp:8000
        Write-Host "[USB] Port 8081 & 8000 berhasil di-forward via USB!" -ForegroundColor Green
        Write-Host "[USB] Di menu Settings HP, Anda juga bisa pakai http://127.0.0.1:8000" -ForegroundColor Green
    } catch {
        Write-Host "[USB] Gagal menjalankan adb reverse. Pastikan kabel USB & USB Debugging aktif." -ForegroundColor Red
    }
}

# 3. Jalankan Expo Metro Bundler
Write-Host ""
if ($Tunnel) {
    Write-Host "[START] Menjalankan Expo dengan mode --tunnel (aman untuk Wi-Fi AP Isolation)..." -ForegroundColor Cyan
    npx expo start -c --tunnel
} else {
    Write-Host "[START] Menjalankan Expo (LAN mode, clear cache)..." -ForegroundColor Cyan
    npx expo start -c
}
