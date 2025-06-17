const fs = require('fs');
const path = require('path');

const createBackup = () => {
  const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  const sourceDB = path.join(__dirname, '../data/estoque.db');
  const backupDir = path.join(__dirname, '../backups');
  const backupFile = path.join(backupDir, `backup_${timestamp}.db`);
  
  // Criar pasta backups se não existir
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  
  try {
    fs.copyFileSync(sourceDB, backupFile);
    return {
      success: true,
      file: backupFile,
      filename: `backup_${timestamp}.db`,
      size: fs.statSync(backupFile).size,
      date: new Date().toLocaleString('pt-BR')
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

const listBackups = () => {
  const backupDir = path.join(__dirname, '../backups');
  
  if (!fs.existsSync(backupDir)) {
    return [];
  }
  
  const files = fs.readdirSync(backupDir)
    .filter(file => file.endsWith('.db'))
    .map(file => {
      const filePath = path.join(backupDir, file);
      const stats = fs.statSync(filePath);
      return {
        filename: file,
        path: filePath,
        size: stats.size,
        date: stats.mtime.toLocaleString('pt-BR')
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
    
  return files;
};

const restoreBackup = (backupFilename) => {
  const backupDir = path.join(__dirname, '../backups');
  const backupFile = path.join(backupDir, backupFilename);
  const targetDB = path.join(__dirname, '../data/estoque.db');
  
  try {
    if (!fs.existsSync(backupFile)) {
      return { success: false, error: 'Arquivo de backup não encontrado' };
    }
    
    // Fazer backup do atual antes de restaurar
    const currentBackup = path.join(backupDir, `pre-restore_${Date.now()}.db`);
    if (fs.existsSync(targetDB)) {
      fs.copyFileSync(targetDB, currentBackup);
    }
    
    // Restaurar
    fs.copyFileSync(backupFile, targetDB);
    
    return {
      success: true,
      message: 'Backup restaurado com sucesso',
      previousBackup: currentBackup
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

module.exports = { createBackup, listBackups, restoreBackup };