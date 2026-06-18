# Borderless centered spinner — no window chrome, no taskbar entry.
# Run: powershell -STA -File bootstrap-splash.ps1
Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase

$window = New-Object System.Windows.Window
$window.Width = 36
$window.Height = 36
$window.WindowStyle = [System.Windows.WindowStyle]::None
$window.AllowsTransparency = $true
$window.Background = [System.Windows.Media.Brushes]::Transparent
$window.Topmost = $true
$window.ShowInTaskbar = $false
$window.WindowStartupLocation = [System.Windows.WindowStartupLocation]::CenterScreen
$window.ResizeMode = [System.Windows.ResizeMode]::NoResize
$window.IsHitTestVisible = $false

$ellipse = New-Object System.Windows.Shapes.Ellipse
$ellipse.Width = 28
$ellipse.Height = 28
$ellipse.Stroke = [System.Windows.Media.Brushes]::White
$ellipse.StrokeThickness = 2.5
$ellipse.StrokeDashArray = [System.Windows.Media.DoubleCollection]@(3.4, 2.0)
$ellipse.RenderTransformOrigin = New-Object System.Windows.Point(0.5, 0.5)

$rotate = New-Object System.Windows.Media.RotateTransform
$ellipse.RenderTransform = $rotate

$animation = New-Object System.Windows.Media.Animation.DoubleAnimation
$animation.From = 0
$animation.To = 360
$animation.Duration = [TimeSpan]::FromSeconds(0.95)
$animation.RepeatBehavior = [System.Windows.Media.Animation.RepeatBehavior]::Forever
$timeline = New-Object System.Windows.Media.Animation.Storyboard
[void][System.Windows.Media.Animation.Storyboard]::SetTarget($animation, $rotate)
[void][System.Windows.Media.Animation.Storyboard]::SetTargetProperty($animation, [System.Windows.PropertyPath]::new("(UIElement.RenderTransform).(RotateTransform.Angle)"))
$timeline.Children.Add($animation) | Out-Null

$grid = New-Object System.Windows.Controls.Grid
[void]$grid.Children.Add($ellipse)
$window.Content = $grid

$window.Add_Loaded({
    $timeline.Begin($ellipse, $true)
})

[void]$window.Show()
[System.Windows.Threading.Dispatcher]::Run()
