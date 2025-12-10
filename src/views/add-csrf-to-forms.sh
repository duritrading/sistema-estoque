#!/bin/bash
# ============================================
# SCRIPT: Adicionar input CSRF em todos os forms
# ============================================
# Uso: bash add-csrf-to-forms.sh
# Executar na raiz do projeto (pasta src/views)
# ============================================

VIEWS_DIR="src/views"
CSRF_INPUT='<input type="hidden" name="_csrf" value="<%= csrfToken %>">'

echo "🔒 Adicionando proteção CSRF aos formulários..."
echo ""

# Função para adicionar CSRF após <form
add_csrf_to_file() {
    local file=$1
    local count=$(grep -c "<form" "$file" 2>/dev/null || echo 0)
    
    if [ "$count" -gt 0 ]; then
        # Verificar se já tem CSRF
        if grep -q "_csrf" "$file"; then
            echo "  ⏭️  $file (já tem CSRF)"
        else
            # Backup
            cp "$file" "$file.bak"
            
            # Adicionar input após cada <form...>
            # Usando sed para inserir linha após <form.*>
            sed -i 's/<form\([^>]*\)>/<form\1>\n        <input type="hidden" name="_csrf" value="<%= csrfToken %>">/g' "$file"
            
            echo "  ✅ $file ($count forms atualizados)"
        fi
    fi
}

# Processar todos os arquivos .ejs
for file in $VIEWS_DIR/*.ejs; do
    if [ -f "$file" ]; then
        add_csrf_to_file "$file"
    fi
done

echo ""
echo "✅ Concluído! Backups salvos como *.bak"
echo ""
echo "⚠️  IMPORTANTE: Revise os arquivos manualmente para garantir"
echo "   que o input CSRF ficou na posição correta dentro de cada form."