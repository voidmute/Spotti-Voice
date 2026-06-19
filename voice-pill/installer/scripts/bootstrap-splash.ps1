# Borderless spinning white ring - no console, no taskbar.
$pidPath = Join-Path $env:TEMP "SpottiVoice-splash.pid"
Set-Content -LiteralPath $pidPath -Value $PID -Encoding ASCII

Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase

$window = New-Object System.Windows.Window
$window.Width = 32
$window.Height = 32
$window.WindowStyle = [System.Windows.WindowStyle]::None
$window.AllowsTransparency = $true
$window.Background = [System.Windows.Media.Brushes]::Transparent
$window.Topmost = $true
$window.ShowInTaskbar = $false
$window.WindowStartupLocation = [System.Windows.WindowStartupLocation]::CenterScreen
$window.ResizeMode = [System.Windows.ResizeMode]::NoResize
$window.IsHitTestVisible = $false

$size = 24.0
$thickness = 2.5
$trackColor = [System.Windows.Media.Color]::FromArgb(36, 255, 255, 255)

$track = New-Object System.Windows.Shapes.Ellipse
$track.Width = $size
$track.Height = $size
$track.Stroke = New-Object System.Windows.Media.SolidColorBrush $trackColor
$track.StrokeThickness = $thickness
$track.Fill = [System.Windows.Media.Brushes]::Transparent

$arc = New-Object System.Windows.Shapes.Ellipse
$arc.Width = $size
$arc.Height = $size
$arc.Stroke = [System.Windows.Media.Brushes]::White
$arc.StrokeThickness = $thickness
$arc.Fill = [System.Windows.Media.Brushes]::Transparent
$arc.StrokeStartLineCap = [System.Windows.Media.PenLineCap]::Round
$arc.StrokeEndLineCap = [System.Windows.Media.PenLineCap]::Round
# ~25% visible arc on circumference (pi * 24 ~= 75)
$dash = New-Object System.Windows.Media.DoubleCollection
[void]$dash.Add(18.5)
[void]$dash.Add(57.0)
$arc.StrokeDashArray = $dash

$rotate = New-Object System.Windows.Media.RotateTransform
$rotate.Angle = 0
$rotate.CenterX = $size / 2
$rotate.CenterY = $size / 2
$arc.RenderTransform = $rotate
$arc.RenderTransformOrigin = New-Object System.Windows.Point(0.5, 0.5)

$grid = New-Object System.Windows.Controls.Grid
[void]$grid.Children.Add($track)
[void]$grid.Children.Add($arc)
$window.Content = $grid

$stopPath = Join-Path $env:TEMP "SpottiVoice-splash.stop"

$window.Add_Closed({
    Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $stopPath -Force -ErrorAction SilentlyContinue
})

$stopTimer = New-Object System.Windows.Threading.DispatcherTimer
$stopTimer.Interval = [TimeSpan]::FromMilliseconds(120)
$stopTimer.Add_Tick({
    if (Test-Path -LiteralPath $stopPath) {
        $stopTimer.Stop()
        $window.Close()
    }
})
$stopTimer.Start()

$window.Add_Loaded({
    $anim = New-Object System.Windows.Media.Animation.DoubleAnimation
    $anim.From = 0
    $anim.To = 360
    $anim.Duration = [System.Windows.Duration]::new([TimeSpan]::FromSeconds(0.85))
    $anim.RepeatBehavior = [System.Windows.Media.Animation.RepeatBehavior]::Forever

    $storyboard = New-Object System.Windows.Media.Animation.Storyboard
    [void]$storyboard.Children.Add($anim)
    [System.Windows.Media.Animation.Storyboard]::SetTarget($anim, $rotate)
    [System.Windows.Media.Animation.Storyboard]::SetTargetProperty(
        $anim,
        (New-Object System.Windows.PropertyPath([System.Windows.Media.RotateTransform]::AngleProperty))
    )
    [void]$storyboard.Begin()
})

[void]$window.Show()
[System.Windows.Threading.Dispatcher]::Run()
