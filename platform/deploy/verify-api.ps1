# Codress API 端到端验证(针对运行中的 API + MySQL)
# 用法: powershell -File verify-api.ps1 [-Base http://127.0.0.1:8080]
param([string]$Base = "http://127.0.0.1:8080")

$ErrorActionPreference = 'Stop'
$script:failed = 0

function Check($name, $condition, $detail = "") {
  if ($condition) {
    Write-Host ("PASS  {0}" -f $name)
  } else {
    $script:failed++
    Write-Host ("FAIL  {0}  {1}" -f $name, $detail)
  }
}

# 1. 健康
$h = Invoke-RestMethod "$Base/api/v1/health"
Check "health" ($h.status -eq 'ok')

# 2. 管理端登录(错误密码应被拒)
$badRejected = $false
try { Invoke-RestMethod -Method Post "$Base/api/admin/auth/login" -ContentType 'application/json' -Body '{"username":"admin","password":"wrong"}' | Out-Null } catch { $badRejected = $true }
Check "admin login rejects wrong password" $badRejected
$login = Invoke-RestMethod -Method Post "$Base/api/admin/auth/login" -ContentType 'application/json' -Body '{"username":"admin","password":"codress123"}'
Check "admin login" ([bool]$login.token)
$adminHeaders = @{ Authorization = "Bearer $($login.token)" }

# 3. 公开皮肤列表:平台过滤 + 分类
$skins = Invoke-RestMethod "$Base/api/v1/skins?target=codex"
Check "public skins (codex) has seeded items" ($skins.total -ge 5) "total=$($skins.total)"
$wb = Invoke-RestMethod "$Base/api/v1/skins?target=workbuddy"
Check "public skins (workbuddy) filter works" ($wb.total -ge 5) "total=$($wb.total)"
$categories = Invoke-RestMethod "$Base/api/v1/categories?type=skin"
Check "skin categories exist" ($categories.items.Count -ge 4)

# 4. 详情 + 下载 + 静态文件字节可取
$slug = $skins.items[0].slug
$detail = Invoke-RestMethod "$Base/api/v1/skins/$slug"
Check "skin detail" ($detail.slug -eq $slug)
$download = Invoke-RestMethod -Method Post "$Base/api/v1/skins/$slug/download"
Check "skin download returns url" ([bool]$download.url)
$img = Invoke-WebRequest $download.url -UseBasicParsing
Check "background bytes served" ($img.StatusCode -eq 200 -and $img.RawContentLength -gt 1000) "len=$($img.RawContentLength)"
$after = Invoke-RestMethod "$Base/api/v1/skins/$slug"
Check "download counted" ($after.downloads -ge 1) "downloads=$($after.downloads)"

# 5. 用户体系:providers → dev 登录 → 记录 → 收藏
$providers = Invoke-RestMethod "$Base/api/v1/auth/providers"
Check "auth providers reachable" ($null -ne $providers)
$user = Invoke-RestMethod -Method Post "$Base/api/v1/auth/dev" -ContentType 'application/json' -Body '{"name":"e2e-user","email":"e2e@codress.cc"}'
Check "dev login" ([bool]$user.token)
$userHeaders = @{ Authorization = "Bearer $($user.token)" }
Invoke-RestMethod -Method Post "$Base/api/v1/me/events" -Headers $userHeaders -ContentType 'application/json' -Body ('{"action":"apply","itemType":"skin","itemSlug":"' + $slug + '","target":"codex"}') | Out-Null
$events = Invoke-RestMethod "$Base/api/v1/me/events" -Headers $userHeaders
Check "user events recorded (login+apply)" ($events.total -ge 2) "total=$($events.total)"
$fav = Invoke-RestMethod -Method Post "$Base/api/v1/me/favorites/toggle" -Headers $userHeaders -ContentType 'application/json' -Body ('{"itemType":"skin","itemSlug":"' + $slug + '"}')
Check "favorite toggle on" ($fav.favorited -eq $true)
$favList = Invoke-RestMethod "$Base/api/v1/me/favorites" -Headers $userHeaders
Check "favorites listed" ($favList.items.Count -eq 1)

# 6. 宠物
$pets = Invoke-RestMethod "$Base/api/v1/pets?target=codex"
Check "public pets seeded" ($pets.total -ge 6) "total=$($pets.total)"
$petDownload = Invoke-RestMethod -Method Post "$Base/api/v1/pets/$($pets.items[0].slug)/download"
Check "pet download url" ([bool]$petDownload.url)

# 7. 适配器热下发
$adapterBody = '{"appId":"codex","platform":"all","version":2,"config":{"defaultPort":9341},"css":"/* hotfix e2e */","notes":"e2e"}'
$adapter = Invoke-RestMethod -Method Post "$Base/api/admin/adapters" -Headers $adminHeaders -ContentType 'application/json' -Body $adapterBody
Invoke-RestMethod -Method Post "$Base/api/admin/adapters/$($adapter.id)/status" -Headers $adminHeaders -ContentType 'application/json' -Body '{"status":"active"}' | Out-Null
$publicAdapter = Invoke-RestMethod "$Base/api/v1/adapters/codex?platform=win"
Check "adapter hot config served" ($publicAdapter.version -eq 2 -and $publicAdapter.css -like '*hotfix*')

# 8. 遥测 + 版本 + 看板
Invoke-RestMethod -Method Post "$Base/api/v1/telemetry/verify" -ContentType 'application/json' -Body '{"appId":"codex","appVersion":"1.0.0","skinSlug":"gothic-void-crusade","clientVersion":"1.0.0","os":"win","pass":true}' | Out-Null
$telemetry = Invoke-RestMethod "$Base/api/admin/telemetry" -Headers $adminHeaders
Check "telemetry recorded" ($telemetry.items.Count -ge 1)
Invoke-RestMethod -Method Post "$Base/api/admin/releases" -Headers $adminHeaders -ContentType 'application/json' -Body '{"platform":"win","version":"1.0.0","url":"https://dl.codress.cc/Codress-1.0.0.exe"}' | Out-Null
$latest = Invoke-RestMethod "$Base/api/v1/client/latest?platform=win"
Check "client latest" ($latest.version -eq '1.0.0')
$stats = Invoke-RestMethod "$Base/api/admin/stats/overview" -Headers $adminHeaders
Check "stats overview" ($stats.skins.published -ge 5 -and $stats.users.total -ge 1)
$users = Invoke-RestMethod "$Base/api/admin/users" -Headers $adminHeaders
Check "admin sees users" ($users.total -ge 1)

Write-Host ""
if ($script:failed -eq 0) { Write-Host "ALL CHECKS PASSED" } else { Write-Host "$($script:failed) CHECK(S) FAILED"; exit 1 }
