$json = Get-Content .\payload_utf8.json | ConvertFrom-Json
foreach ($emp in $json.Emprestimos) {
    if ($emp.IdBanco -eq 0 -or $emp.IdBanco -eq 335) {
        $rubrica = $emp.Rubrica
        $nomeBanco = $emp.NomeBanco
        $bancoNome = $emp.bancoNome
        
        # Simulating JavaScript logic
        Write-Host "---"
        Write-Host "Contrato:" $emp.Contrato
        Write-Host "Rubrica:" "$rubrica"
        Write-Host "IdBanco:" $emp.IdBanco
    }
}
