const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { db } = require('../config/database');


// GET /usuarios - Mostra a página com a lista e o formulário
router.get('/', (req, res) => {
  db.all(`
    SELECT id, username, email, nome_completo, ativo, ultimo_login, created_at 
    FROM usuarios 
    ORDER BY created_at DESC
  `, [], (err, usuarios) => {
    if (err) {
      console.error('Erro buscar usuários:', err);
      return res.status(500).send('Erro interno do servidor');
    }
    res.render('usuarios', {
      user: res.locals.user,
      usuarios: Array.isArray(usuarios) ? usuarios : []
    });
  });
});

// POST /usuarios - Processa o cadastro de um novo usuário
router.post('/', async (req, res) => {
    const { username, email, nome_completo, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        db.run(`
            INSERT INTO usuarios (username, email, password_hash, nome_completo)
            VALUES ($1, $2, $3, $4)
        `, [username, email, hashedPassword, nome_completo], function(err) {
            if (err) {
                console.error('Erro ao criar usuário:', err);
                return res.status(500).send('Erro ao criar usuário. Verifique se o username ou e-mail já existem.');
            }
            res.redirect('/usuarios');
        });
    } catch (error) {
        console.error('Erro ao gerar hash da senha:', error);
        res.status(500).send('Erro interno do servidor.');
    }
});

module.exports = router;