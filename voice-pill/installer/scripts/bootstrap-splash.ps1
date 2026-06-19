# WinForms spinner — visible on all desktops; no console caret.
$ErrorActionPreference = "Stop"

$pidPath = Join-Path $env:TEMP "SpottiVoice-splash.pid"
$stopPath = Join-Path $env:TEMP "SpottiVoice-splash.stop"
Remove-Item -LiteralPath $stopPath -Force -ErrorAction SilentlyContinue
Set-Content -LiteralPath $pidPath -Value $PID -Encoding ASCII

$ownerPid = 0
if ($env:SPOTTI_SPLASH_OWNER) {
    [void][int]::TryParse($env:SPOTTI_SPLASH_OWNER, [ref]$ownerPid)
}

try {
    $consoleSig = @'
[DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
'@
    Add-Type -MemberDefinition $consoleSig -Name ConsoleWin -Namespace SpottiSplash -ErrorAction SilentlyContinue
    $hwnd = [SpottiSplash.ConsoleWin]::GetConsoleWindow()
    if ($hwnd -ne [IntPtr]::Zero) {
        [void][SpottiSplash.ConsoleWin]::ShowWindow($hwnd, 0)
    }
} catch {
    # ignore
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$script:spinAngle = 0.0

$form = New-Object System.Windows.Forms.Form
$form.Text = "Spotti Voice"
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
$form.Size = New-Object System.Drawing.Size(72, 72)
$form.BackColor = [System.Drawing.Color]::FromArgb(36, 36, 40)
$form.ForeColor = [System.Drawing.Color]::White
$form.ShowInTaskbar = $false
$form.TopMost = $true
$form.Opacity = 0.96
$form.KeyPreview = $true
$form.Add_KeyDown({ param($s, $e) $e.Handled = $true })

$form.Add_Paint({
    param($sender, $e)
    $g = $e.Graphics
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $rect = New-Object System.Drawing.RectangleF 16.0, 16.0, 40.0, 40.0
    $trackPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(70, 255, 255, 255)), 4.0
    $trackPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $trackPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $arcPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White, 4.0)
    $arcPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $arcPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $g.DrawArc($trackPen, $rect, 0.0, 360.0)
    $state = $g.Save()
    $g.TranslateTransform(36.0, 36.0)
    $g.RotateTransform($script:spinAngle)
    $g.TranslateTransform(-36.0, -36.0)
    $g.DrawArc($arcPen, $rect, 0.0, 280.0)
    $g.Restore($state)
    $trackPen.Dispose()
    $arcPen.Dispose()
})

$form.Add_FormClosed({
    if ($script:spinTimer) { $script:spinTimer.Stop(); $script:spinTimer.Dispose() }
    if ($script:stopTimer) { $script:stopTimer.Stop(); $script:stopTimer.Dispose() }
    Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $stopPath -Force -ErrorAction SilentlyContinue
})

$script:spinTimer = New-Object System.Windows.Forms.Timer
$script:spinTimer.Interval = 16
$script:spinTimer.Add_Tick({
    $script:spinAngle = ($script:spinAngle + 6.0) % 360.0
    $form.Invalidate()
})
$script:spinTimer.Start()

$script:stopTimer = New-Object System.Windows.Forms.Timer
$script:stopTimer.Interval = 100
$script:stopTimer.Add_Tick({
    if (Test-Path -LiteralPath $stopPath) {
        $form.Close()
        return
    }
    if ($ownerPid -gt 0) {
        $alive = $false
        try { $alive = $null -ne (Get-Process -Id $ownerPid -ErrorAction Stop) } catch { $alive = $false }
        if (-not $alive) { $form.Close() }
    }
})
$script:stopTimer.Start()

[void]$form.Show()
[System.Windows.Forms.Application]::Run($form)
