const styles = `
<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #f5f7fa;
  line-height: 1.6;
  color: #333;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 2rem 0;
  margin-bottom: 2rem;
  border-radius: 10px;
  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
}

.header h1 {
  font-size: 2.5rem;
  font-weight: 300;
  text-align: center;
  margin-bottom: 0.5rem;
}

.nav-buttons {
  display: flex;
  gap: 10px;
  margin: 20px 0;
  flex-wrap: wrap;
  justify-content: center;
}

.btn {
  padding: 12px 24px;
  border: none;
  border-radius: 6px;
  text-decoration: none;
  color: white;
  font-weight: 500;
  transition: all 0.3s ease;
  cursor: pointer;
  font-size: 14px;
}

.btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

.btn-primary { background: #3498db; }
.btn-success { background: #2ecc71; }
.btn-warning { background: #f39c12; }
.btn-secondary { background: #95a5a6; }
.btn-danger { background: #e74c3c; }

.card {
  background: white;
  border-radius: 10px;
  padding: 20px;
  margin: 20px 0;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
  border: 1px solid #e1e8ed;
}

.card h2 {
  color: #2c3e50;
  margin-bottom: 15px;
  font-size: 1.5rem;
  font-weight: 600;
}

.alert {
  padding: 15px;
  border-radius: 6px;
  margin: 15px 0;
  border-left: 4px solid;
}

.alert-warning {
  background: #fff3cd;
  border-color: #ffc107;
  color: #856404;
}

.alert-success {
  background: #d4edda;
  border-color: #28a745;
  color: #155724;
}

.search-container {
  margin: 20px 0;
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.search-input {
  flex: 1;
  min-width: 200px;
  padding: 12px 16px;
  border: 2px solid #e1e8ed;
  border-radius: 6px;
  font-size: 16px;
  transition: border-color 0.3s ease;
}

.search-input:focus {
  outline: none;
  border-color: #3498db;
}

.filter-select {
  padding: 12px 16px;
  border: 2px solid #e1e8ed;
  border-radius: 6px;
  background: white;
  font-size: 14px;
}

table {
  width: 100%;
  border-collapse: collapse;
  background: white;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

th {
  background: #34495e;
  color: white;
  padding: 15px 12px;
  text-align: left;
  font-weight: 600;
  text-transform: uppercase;
  font-size: 12px;
  letter-spacing: 0.5px;
}

td {
  padding: 12px;
  border-bottom: 1px solid #e1e8ed;
}

tr:hover {
  background: #f8f9fa;
}

.status-ok {
  background: #d4edda;
  color: #155724;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
}

.status-warning {
  background: #fff3cd;
  color: #856404;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
}

.form-group {
  margin: 15px 0;
}

.form-group label {
  display: block;
  margin-bottom: 5px;
  font-weight: 600;
  color: #2c3e50;
}

.form-control {
  width: 100%;
  padding: 12px 16px;
  border: 2px solid #e1e8ed;
  border-radius: 6px;
  font-size: 16px;
  transition: border-color 0.3s ease;
}

.form-control:focus {
  outline: none;
  border-color: #3498db;
}

.form-row {
  display: flex;
  gap: 15px;
  flex-wrap: wrap;
}

.form-row .form-group {
  flex: 1;
  min-width: 200px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  margin: 20px 0;
}

.stat-card {
  background: white;
  padding: 20px;
  border-radius: 10px;
  text-align: center;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
  border-left: 4px solid #3498db;
}

.stat-number {
  font-size: 2rem;
  font-weight: bold;
  color: #2c3e50;
}

.stat-label {
  color: #7f8c8d;
  font-size: 0.9rem;
  margin-top: 5px;
}

@media (max-width: 768px) {
  .container {
    padding: 10px;
  }
  
  .nav-buttons {
    justify-content: center;
  }
  
  .search-container {
    flex-direction: column;
    align-items: stretch;
  }
  
  .form-row {
    flex-direction: column;
  }
  
  table {
    font-size: 14px;
  }
  
  th, td {
    padding: 8px;
  }
}

.loading {
  text-align: center;
  padding: 20px;
  color: #7f8c8d;
}

.no-results {
  text-align: center;
  padding: 40px;
  color: #7f8c8d;
}
</style>

<script>
// Busca em tempo real
function searchTable() {
  const input = document.getElementById('searchInput');
  const filter = input.value.toLowerCase();
  const table = document.getElementById('dataTable');
  const rows = table.getElementsByTagName('tr');
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const cells = row.getElementsByTagName('td');
    let found = false;
    
    for (let j = 0; j < cells.length; j++) {
      if (cells[j].textContent.toLowerCase().indexOf(filter) > -1) {
        found = true;
        break;
      }
    }
    
    row.style.display = found ? '' : 'none';
  }
}

// Filtro por categoria
function filterByCategory() {
  const filter = document.getElementById('categoryFilter').value.toLowerCase();
  const table = document.getElementById('dataTable');
  const rows = table.getElementsByTagName('tr');
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const categoryCell = row.cells[3]; // Assumindo que categoria é a 4ª coluna
    
    if (filter === '' || categoryCell.textContent.toLowerCase().indexOf(filter) > -1) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  }
}

// Atalhos de teclado
document.addEventListener('keydown', function(e) {
  if (e.ctrlKey || e.metaKey) {
    switch(e.key) {
      case 'k':
        e.preventDefault();
        document.getElementById('searchInput')?.focus();
        break;
      case 'n':
        e.preventDefault();
        window.location.href = '/novo-produto';
        break;
      case 'm':
        e.preventDefault();
        window.location.href = '/movimentacoes';
        break;
    }
  }
});
</script>
`;

module.exports = styles;