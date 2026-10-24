# Inicialização local do Apache na porta 8080. Primeiro consulta a API para evitar iniciar outra instância.
# Se estiver parado, inicia a configuração específica da loja em janela oculta; não configura nem inicia o MySQL.
$ErrorActionPreference = 'Stop'
$camiUrl = 'http://localhost:8080/Projetos/loja%20camile/'
try {
    $response = Invoke-WebRequest -Uri ($camiUrl + 'api/index.php?action=session') -UseBasicParsing -TimeoutSec 3
    if ($response.StatusCode -eq 200) { Write-Host "Loja em funcionamento: $camiUrl"; exit 0 }
} catch { }
Start-Process -FilePath 'D:\Apache24\bin\httpd.exe' -ArgumentList '-f','D:/Apache24/conf/httpd-cami-local.conf' -WindowStyle Hidden
Write-Host "Apache local iniciado. Acesse: $camiUrl"
