# Zusätzliche Stammzertifikate für den Docker-Build

Nur nötig, wenn ein Virenscanner mit HTTPS-Prüfung (z. B. Norton, Kaspersky, Avast) oder ein
Firmen-Proxy die Verbindungen aufbricht. Der Build scheitert dann mit `CERTIFICATE_VERIFY_FAILED`
bzw. `SELF_SIGNED_CERT_IN_CHAIN`.

Das Stammzertifikat des Scanners bzw. Proxys als **PEM-Datei mit Endung `.crt`** hier ablegen.
Beide Images vertrauen ihm dann beim Bauen, das Backend auch beim Datenabruf zur Laufzeit.

Unter Windows exportieren (PowerShell, Name anpassen):

```powershell
$c = Get-ChildItem Cert:\LocalMachine\Root, Cert:\CurrentUser\Root |
     Where-Object Subject -like "*Norton*" | Select-Object -First 1
"-----BEGIN CERTIFICATE-----`n$([Convert]::ToBase64String($c.RawData,'InsertLineBreaks'))`n-----END CERTIFICATE-----" |
     Out-File -Encoding ascii certs\scanner.crt
```

`.crt`-Dateien in diesem Ordner sind von Git ausgeschlossen. Auf einem Server ohne solche Prüfung
bleibt der Ordner leer.
