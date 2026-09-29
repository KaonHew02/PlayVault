# Exports the proposal's .docx to PDF through whatever answers for
# Word.Application: Microsoft Word, or (on the machine this was written on)
# WPS Office, which registers itself under that name. The file is opened
# read-only, so the .docx is never re-saved, and no field is updated: page
# numbers are laid out at export time, and the contents field arrives filled
# in (WPS can show a filled-in contents field but cannot build one).
param([Parameter(Mandatory)][string]$Docx, [Parameter(Mandatory)][string]$Pdf)
$ErrorActionPreference = 'Stop'
if (Test-Path $Pdf) { Remove-Item $Pdf -Force }
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
    $doc = $word.Documents.Open($Docx, $false, $true, $false)
    # 17 = PDF; bookmarks from headings (outline.py reads them); document properties kept
    $doc.ExportAsFixedFormat($Pdf, 17, $false, 0, 0, 1, 1, 0, $true, $true, 1)
    $doc.Close($false)
} finally {
    try { $word.Quit() } catch { }   # WPS drops the connection as it exits
    try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) } catch { }
}
if (-not (Test-Path $Pdf)) { throw "No PDF was written to $Pdf" }
"exported $Pdf (" + (Get-Item $Pdf).Length + " bytes)"
