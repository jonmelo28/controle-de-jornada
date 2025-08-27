const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { requireAuth, requirePermission } = require('../middleware/auth');

// LISTAR
router.get('/', requireAuth, requirePermission('usuarios:gerir'), async (req, res, next) => {
  try {
    const [permissoes] = await db.query(`
      SELECT p.*,
        (SELECT COUNT(*) FROM role_permissoes rp WHERE rp.permissao_id = p.id) AS qt_funcoes
      FROM permissoes p
      ORDER BY p.chave
    `);
    res.render('permissoes/lista', { title: 'Permissões', permissoes, ok: req.query.ok, erro: req.query.erro });
  } catch (e) { next(e); }
});

// FORM NOVO
router.get('/novo', requireAuth, requirePermission('usuarios:gerir'), (req, res) => {
  res.render('permissoes/form', { title: 'Nova Permissão', perm: null, erro: null });
});

// CRIAR
router.post('/novo', requireAuth, requirePermission('usuarios:gerir'), async (req, res) => {
  const { chave, descricao } = req.body;
  try {
    await db.query('INSERT INTO permissoes (chave, descricao) VALUES (?, ?)', [chave, descricao || null]);
    return res.redirect('/permissoes?ok=created');
  } catch (e) {
    if (e && e.code === 'ER_DUP_ENTRY') {
      return res.render('permissoes/form', { title: 'Nova Permissão', perm: null, erro: 'Chave já existe.' });
    }
    console.error(e);
    return res.render('permissoes/form', { title: 'Nova Permissão', perm: null, erro: 'Erro ao criar permissão.' });
  }
});

// FORM EDITAR
router.get('/:id/editar', requireAuth, requirePermission('usuarios:gerir'), async (req, res, next) => {
  const { id } = req.params;
  try {
    const [rows] = await db.query('SELECT * FROM permissoes WHERE id=?', [id]);
    if (!rows.length) return res.redirect('/permissoes?erro=notfound');
    res.render('permissoes/form', { title: 'Editar Permissão', perm: rows[0], erro: null });
  } catch (e) { next(e); }
});

// SALVAR EDIÇÃO
router.post('/:id/editar', requireAuth, requirePermission('usuarios:gerir'), async (req, res) => {
  const { id } = req.params;
  const { chave, descricao } = req.body;
  try {
    await db.query('UPDATE permissoes SET chave=?, descricao=? WHERE id=?', [chave, descricao || null, id]);
    return res.redirect('/permissoes?ok=updated');
  } catch (e) {
    if (e && e.code === 'ER_DUP_ENTRY') {
      // recarrega com erro
      const [rows] = await db.query('SELECT * FROM permissoes WHERE id=?', [id]);
      return res.render('permissoes/form', { title: 'Editar Permissão', perm: rows[0], erro: 'Chave já existe.' });
    }
    console.error(e);
    const [rows] = await db.query('SELECT * FROM permissoes WHERE id=?', [id]);
    return res.render('permissoes/form', { title: 'Editar Permissão', perm: rows[0], erro: 'Erro ao salvar.' });
  }
});

// EXCLUIR (bloqueia se estiver associada a alguma função)
router.post('/:id/excluir', requireAuth, requirePermission('usuarios:gerir'), async (req, res) => {
  const { id } = req.params;
  try {
    const [[uso]] = await db.query('SELECT COUNT(*) AS c FROM role_permissoes WHERE permissao_id=?', [id]);
    if (uso.c > 0) {
      return res.redirect('/permissoes?erro=perm_em_uso');
    }
    await db.query('DELETE FROM permissoes WHERE id=?', [id]);
    return res.redirect('/permissoes?ok=deleted');
  } catch (e) {
    console.error(e);
    return res.redirect('/permissoes?erro=delete_fail');
  }
});

module.exports = router;
