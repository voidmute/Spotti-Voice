# WPF transparent spinner — visible on all GPUs; no WinForms TransparencyKey bugs.
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

Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase

$size = 36.0
$thickness = 3.0
$trackColor = [System.Windows.Media.Color]::FromArgb(64, 255, 255, 255)

$window = New-Object System.Windows.Window
$window.Width = 48
$window.Height = 48
$window.WindowStyle = [System.Windows.WindowStyle]::None
$window.AllowsTransparency = $true
$window.Background = [System.Windows.Media.Brushes]::Transparent
$window.Topmost = $true
$window.ShowInTaskbar = $false
$window.WindowStartupLocation = [System.Windows.WindowStartupLocation]::CenterScreen
$window.ResizeMode = [System.Windows.ResizeMode]::NoResize
$window.IsHitTestVisible = $false
$window.Focusable = $false
$window.UseLayoutRounding = $true
$window.SnapsToDevicePixels = $true

$track = New-Object System.Windows.Shapes.Ellipse
$track.Width = $size
$track.Height = $size
$track.Stroke = New-Object System.Windows.Media.SolidColorBrush $trackColor
$track.StrokeThickness = $thickness
$track.Fill = [System.Windows.Media.Brushes]::Transparent
$track.HorizontalAlignment = [System.Windows.HorizontalAlignment]::Center
$track.VerticalAlignment = [System.Windows.VerticalAlignment]::Center

$arc = New-Object System.Windows.Shapes.Ellipse
$arc.Width = $size
$arc.Height = $size
$arc.Stroke = [System.Windows.Media.Brushes]::White
$arc.StrokeThickness = $thickness
$arc.Fill = [System.Windows.Media.Brushes]::Transparent
$arc.StrokeStartLineCap = [System.Windows.Media.PenLineCap]::Round
$arc.StrokeEndLineCap = [System.Windows.Media.PenLineCap]::Round
$dash = New-Object System.Windows.Media.DoubleCollection
[void]$dash.Add(18.0)
[void]$dash.Add(58.0)
$arc.StrokeDashArray = $dash
$arc.HorizontalAlignment = [System.Windows.HorizontalAlignment]::Center
$arc.VerticalAlignment = [System.Windows.VerticalAlignment]::Center

$rotate = New-Object System.Windows.Media.RotateTransform
$rotate.Angle = 0
$rotate.CenterX = $size / 2
$rotate.CenterY = $size / 2
$arc.RenderTransform = $rotate
$arc.RenderTransformOrigin = New-Object System.Windows.Point(0.5, 0.5)

$grid = New-Object System.Windows.Controls.Grid
$grid.Background = [System.Windows.Media.Brushes]::Transparent
[void]$grid.Children.Add($track)
[void]$grid.Children.Add($arc)
$window.Content = $grid

$spinMs = 16.0
$degPerMs = 360.0 / 850.0

$window.Add_Closed({
    if ($script:spinTimer) { $script:spinTimer.Stop() }
    if ($script:stopTimer) { $script:stopTimer.Stop() }
    Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $stopPath -Force -ErrorAction SilentlyContinue
})

$script:spinTimer = New-Object System.Windows.Threading.DispatcherTimer
$script:spinTimer.Interval = [TimeSpan]::FromMilliseconds($spinMs)
$script:spinTimer.Add_Tick({
    $rotate.Angle = ($rotate.Angle + ($degPerMs * $spinMs)) % 360.0
})
$script:spinTimer.Start()

$script:stopTimer = New-Object System.Windows.Threading.DispatcherTimer
$script:stopTimer.Interval = [TimeSpan]::FromMilliseconds(100)
$script:stopTimer.Add_Tick({
    if (Test-Path -LiteralPath $stopPath) {
        $window.Close()
        return
    }
    if ($ownerPid -gt 0) {
        $alive = $false
        try { $alive = $null -ne (Get-Process -Id $ownerPid -ErrorAction Stop) } catch { $alive = $false }
        if (-not $alive) { $window.Close() }
    }
})
$script:stopTimer.Start()

[void]$window.Show()
[System.Windows.Threading.Dispatcher]::Run()
