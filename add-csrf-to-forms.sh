#!/bin/bash
VIEWS_DIR="src/views"

echo "🔒 Adicionando CSRF aos forms..."

for file in $VIEWS_DIR/*.ejs; do
    if [ -f "$file" ]; then
        if grep -q "_csrf" "$file"; then
            echo "  ⏭️  $file (já tem)"
        else
            sed -i 's/<form\([^>]*\)>/<form\1>\n        <input type="hidden" name="_csrf" value="<%= csrfToken %>">/g' "$file"
            echo "  ✅ $file"
        fi
    fi
done

echo "✅ Concluído!"
