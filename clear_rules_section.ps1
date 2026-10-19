# Remove the house rules section from dashboard.html.
# Matches from the house-rules marker through the rules-grid close </div> + </section>.
$c = Get-Content dashboard.html -Raw
$c = [regex]::Replace($c, '<!-- EDIT_MARKER_X -->[\s\S]*?</div>\s*</section>', '')
Set-Content dashboard.html $c
Write-Host 'House rules section removed.'
