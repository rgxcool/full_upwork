#!/bin/bash

echo "Analyzing Git commit history with weighted commit time..."

# Create a temp file
tempfile=$(mktemp)
git log --pretty=format:'%ad' --date=short | sort | uniq -c > "$tempfile"

echo ""
echo "Date       | Commits | Est. Hours (0.5h/commit)"
echo "-----------------------------------------------"

total_hours=0
total_commits=0

while read -r count date; do
    hours=$(echo "$count" | bc)
    total_hours=$(echo "$total_hours + $hours" | bc)
    total_commits=$((total_commits + count))
    printf "%s | %7s | %5s hrs\n" "$date" "$count" "$hours"
done < "$tempfile"

echo "-----------------------------------------------"
printf "Estimated total dev time: %.1f hours\n" "$total_hours"
echo "Total commits: $total_commits"

# Clean up
rm "$tempfile"
