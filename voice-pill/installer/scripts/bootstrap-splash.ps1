# Borderless static white ring - no console, no taskbar, no animation.
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

$ellipse = New-Object System.Windows.Shapes.Ellipse
$ellipse.Width = 24
$ellipse.Height = 24
$ellipse.Stroke = [System.Windows.Media.Brushes]::White
$ellipse.StrokeThickness = 2.5
$ellipse.Fill = [System.Windows.Media.Brushes]::Transparent

$grid = New-Object System.Windows.Controls.Grid
[void]$grid.Children.Add($ellipse)
$window.Content = $grid

$window.Add_Closed({
    Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
})

[void]$window.Show()
[System.Windows.Threading.Dispatcher]::Run()
