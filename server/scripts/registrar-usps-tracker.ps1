# Registra la tarea "EST-USPS-Tracker": corre el robot USPS a las 9:00 y 16:00
# todos los días (StartWhenAvailable = si el PC estaba apagado, corre al encender).
$action = New-ScheduledTaskAction -Execute 'C:\Program Files\nodejs\node.exe' `
  -Argument '"C:\Users\josma\Desktop\Schedule-System-EST\server\scripts\usps-scraper.cjs"' `
  -WorkingDirectory 'C:\Users\josma\Desktop\Schedule-System-EST'
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
$t1 = New-ScheduledTaskTrigger -Daily -At 9:00
$t2 = New-ScheduledTaskTrigger -Daily -At 16:00
Register-ScheduledTask -TaskName 'EST-USPS-Tracker' -Action $action -Trigger @($t1, $t2) -Settings $settings -Description 'Robot local: actualiza rastreos USPS de ElectronicST 2 veces al dia (9:00 y 16:00)' -Force
Get-ScheduledTask -TaskName 'EST-USPS-Tracker' | Select-Object TaskName, State
