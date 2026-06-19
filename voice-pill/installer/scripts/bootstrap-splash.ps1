# Borderless transparent spinner — no frame, double-buffered.
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

$size = 44
$center = $size / 2.0
$arcRect = New-Object System.Drawing.RectangleF 8.0, 8.0, 28.0, 28.0
$chroma = [System.Drawing.Color]::FromArgb(255, 0, 1, 0)
$trackPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(48, 255, 255, 255)), 3.0
$trackPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$trackPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$arcPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White, 3.0)
$arcPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$arcPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

$script:spinAngle = 0.0

$form = New-Object System.Windows.Forms.Form
$form.Text = "Spotti Voice"
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
$form.Size = New-Object System.Drawing.Size($size, $size)
$form.BackColor = $chroma
$form.TransparencyKey = $chroma
$form.ShowInTaskbar = $false
$form.TopMost = $true
$form.KeyPreview = $true
$form.Add_KeyDown({ param($s, $e) $e.Handled = $true })

$setStyle = [System.Windows.Forms.Form].GetMethod(
    "SetStyle",
    [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Instance
)
$setStyle.Invoke(
    $form,
    @(
        [System.Windows.Forms.ControlStyles]::UserPaint -bor
        [System.Windows.Forms.ControlStyles]::OptimizedDoubleBuffer -bor
        [System.Windows.Forms.ControlStyles]::AllPaintingInWmPaint,
        $true
    )
) | Out-Null

$form.Add_Paint({
    param($sender, $e)
    $g = $e.Graphics
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQuality
    $g.DrawArc($trackPen, $arcRect, 0.0, 360.0)
    $state = $g.Save()
    $g.TranslateTransform($center, $center)
    $g.RotateTransform($script:spinAngle)
    $g.TranslateTransform(-$center, -$center)
    $g.DrawArc($arcPen, $arcRect, 0.0, 270.0)
    $g.Restore($state)
})

$form.Add_FormClosed({
    if ($script:spinTimer) { $script:spinTimer.Stop(); $script:spinTimer.Dispose() }
    if ($script:stopTimer) { $script:stopTimer.Stop(); $script:stopTimer.Dispose() }
    $trackPen.Dispose()
    $arcPen.Dispose()
    Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $stopPath -Force -ErrorAction SilentlyContinue
})

$script:spinTimer = New-Object System.Windows.Forms.Timer
$script:spinTimer.Interval = 16
$script:spinTimer.Add_Tick({
    $script:spinAngle += 4.0
    if ($script:spinAngle -ge 360.0) { $script:spinAngle -= 360.0 }
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
