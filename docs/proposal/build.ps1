# Builds docs/PlayVault-Project-Proposal.docx and .pdf from docs/PROPOSAL.md.
# Keep this file ASCII: Windows PowerShell 5.1 reads a script without a BOM
# in the ANSI code page, and a UTF-8 dash can end a string early.
#   powershell -ExecutionPolicy Bypass -File docs\proposal\build.ps1
#
# Two layout passes, so the contents page carries the page numbers the PDF
# really has: build with placeholder numbers, export, read where each heading
# landed from the PDF's bookmarks (outline.py), build again with those, export
# again, and check that nothing moved. Scratch files go in .build\.
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$docs = Split-Path -Parent $here
$build = Join-Path $here '.build'
$docx = Join-Path $docs 'PlayVault-Project-Proposal.docx'
$pdf = Join-Path $docs 'PlayVault-Project-Proposal.pdf'
$export = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $here 'export-pdf.ps1'))
New-Item -ItemType Directory -Force $build | Out-Null
if (-not (Test-Path (Join-Path $here 'node_modules\docx'))) { throw "Run 'npm install' in $here first." }

$heads = (Select-String -Path (Join-Path $docs 'PROPOSAL.md') -Pattern '^#{2,3} ').Count
"headings in the source: $heads"

"--- pass 1: placeholder page numbers"
node (Join-Path $here 'build-proposal.mjs') "--out=$build\pass1.docx"; if ($LASTEXITCODE) { throw 'build failed' }
& powershell.exe @export -Docx "$build\pass1.docx" -Pdf "$build\pass1.pdf"; if ($LASTEXITCODE) { throw 'export failed' }
python (Join-Path $here 'outline.py') "$build\pass1.pdf" "$build\pages1.json" $heads; if ($LASTEXITCODE) { throw 'outline failed' }

"--- pass 2: the real page numbers"
node (Join-Path $here 'build-proposal.mjs') "--pages=$build\pages1.json"; if ($LASTEXITCODE) { throw 'build failed' }
& powershell.exe @export -Docx $docx -Pdf $pdf; if ($LASTEXITCODE) { throw 'export failed' }
python (Join-Path $here 'outline.py') $pdf "$build\pages2.json" $heads; if ($LASTEXITCODE) { throw 'outline failed' }

$a = Get-Content "$build\pages1.json" -Raw; $b = Get-Content "$build\pages2.json" -Raw
if ($a.Trim() -eq $b.Trim()) { "page numbers held still between passes" } else { throw "page numbers moved between passes; run it again:`n$a`n$b" }
