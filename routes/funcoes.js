const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { requireAuth, requirePermission } = require('../middleware/auth');

// LISTAR FUNÇÕES
router.get('/', requireAuth, requirePermission('usuarios:gerir'), async (req, res, next) => {
  try {
    const [roles] = await db.query(`
      SELECT r.*,
        (SELECT COUNT(*) FROM usuario_roles ur WHERE ur.role_id = r.id) AS qt_usuarios,
        (SELECT COUNT(*) FROM role_permissoes rp WHERE rp.role_id = r.id) AS qt_permissoes
      FROM roles r
      ORDER BY r.nome
    `);
    res.render('funcoes/lista', { title: 'Funções', roles, ok: req.query.ok, erro: req.query.erro });
  } catch (e) { next(e); }
});

// FORM NOVO
router.get('/novo', requireAuth, requirePermission('usuarios:gerir'), (req, res) => {
  res.render('funcoes/form', { title: 'Nova Função', role: null, permissoes: [], selecionadas: [], erro: null });
});

// CRIAR
router.post('/novo', requireAuth, requirePermission('usuarios:gerir'), async (req, res) => {
  const { nome, descricao } = req.body;
  try {
    await db.query('INSERT INTO roles (nome, descricao) VALUES (?, ?)', [nome, descricao || null]);
    return res.redirect('/funcoes?ok=created');
  } catch (e) {
    if (e && e.code === 'ER_DUP_ENTRY') {
      return res.render('funcoes/form', { title: 'Nova Função', role: null, permissoes: [], selecionadas: [], erro: 'Nome de função já existe.' });
    }
    console.error(e);
    return res.render('funcoes/form', { title: 'Nova Função', role: null, permissoes: [], selecionadas: [], erro: 'Erro ao criar função.' });
  }
});

// FORM EDITAR + CHECKBOXES DE PERMISSÕES
router.get('/:id/editar', requireAuth, requirePermission('usuarios:gerir'), async (req, res, next) => {
  const { id } = req.params;
  try {
    const [rows] = await db.query('SELECT * FROM roles WHERE id=?', [id]);
    if (!rows.length) return res.redirect('/funcoes?erro=notfound');
    const role = rows[0];

    const [permissoes] = await db.query('SELECT * FROM permissoes ORDER BY chave');
    const [atribuídas] = await db.query('SELECT permissao_id FROM role_permissoes WHERE role_id=?', [id]);
    const selecionadas = new Set(atribuídas.map(x => x.permissao_id));

    res.render('funcoes/form', { title: `Editar Função`, role, permissoes, selecionadas, erro: null });
  } catch (e) { next(e); }
});

// SALVAR EDIÇÃO (inclui atualizar as permissões marcadas)
router.post('/:id/editar', requireAuth, requirePermission('usuarios:gerir'), async (req, res) => {
  const { id } = req.params;
  const { nome, descricao } = req.body;
  // `permissoes[]` vem do form (checkboxes)
  let perms = req.body['permissoes'] || [];
  if (!Array.isArray(perms)) perms = [perms];

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Atualiza dados da função
    await conn.query('UPDATE roles SET nome=?, descricao=? WHERE id=?', [nome, descricao || null, id]);

    // Atualiza relação role_permissoes
    await conn.query('DELETE FROM role_permissoes WHERE role_id=?', [id]);
    if (perms.length > 0) {
      const values = perms.map(pid => [id, Number(pid)]);
      await conn.query('INSERT INTO role_permissoes (role_id, permissao_id) VALUES ?', [values]);
    }

    await conn.commit();
    conn.release();
    return res.redirect('/funcoes?ok=updated');
  } catch (e) {
    await conn.rollback();
    conn.release();
    console.error(e);
    // Recarrega tela com erro
    const [roleRows] = await db.query('SELECT * FROM roles WHERE id=?', [id]);
    const role = roleRows[0] || null;
    const [permissoes] = await db.query('SELECT * FROM permissoes ORDER BY chave');
    const [atribuídas] = await db.query('SELECT permissao_id FROM role_permissoes WHERE role_id=?', [id]);
    const selecionadas = new Set(atribuídas.map(x => x.permissao_id));
    return res.render('funcoes/form', { title: `Editar Função`, role, permissoes, selecionadas, erro: 'Erro ao salvar.' });
  }
});

// EXCLUIR (bloqueia se houver usuários associados)
router.post('/:id/excluir', requireAuth, requirePermission('usuarios:gerir'), async (req, res) => {
  const { id } = req.params;
  try {
    const [[uso]] = await db.query('SELECT COUNT(*) AS c FROM usuario_roles WHERE role_id=?', [id]);
    if (uso.c > 0) {
      return res.redirect('/funcoes?erro=role_em_uso');
    }
    await db.query('DELETE FROM roles WHERE id=?', [id]);
    return res.redirect('/funcoes?ok=deleted');
  } catch (e) {
    console.error(e);
    return res.redirect('/funcoes?erro=delete_fail');
  }
});

module.exports = router;
