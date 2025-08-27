const db = require('../models/db');

async function carregarPermissoesDoUsuario(userId) {
  // via roles
  const [viaRoles] = await db.query(`
    SELECT DISTINCT p.chave
    FROM usuario_roles ur
    JOIN role_permissoes rp ON rp.role_id = ur.role_id
    JOIN permissoes p ON p.id = rp.permissao_id
    WHERE ur.usuario_id = ?
  `, [userId]);

  // diretas
  const [diretas] = await db.query(`
    SELECT DISTINCT p.chave
    FROM usuario_permissoes up
    JOIN permissoes p ON p.id = up.permissao_id
    WHERE up.usuario_id = ?
  `, [userId]);

  const set = new Set([
    ...viaRoles.map(r => r.chave),
    ...diretas.map(d => d.chave)
  ]);
  return Array.from(set);
}

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.redirect('/auth/login');
  }
  next();
}

async function attachUserAndPerms(req, res, next) {
  try {
    if (req.session && req.session.userId) {
      if (!req.session.user) {
        const [rows] = await db.query(
          'SELECT id, nome, email, status FROM usuarios WHERE id=? AND status=1',
          [req.session.userId]
        );
        if (!rows.length) {
          req.session.destroy(() => {});
          return res.redirect('/auth/login');
        }
        req.session.user = rows[0];
        req.session.permissoes = await carregarPermissoesDoUsuario(req.session.user.id);
      }
      res.locals.user = req.session.user;
      res.locals.permissoes = req.session.permissoes || [];
    } else {
      res.locals.user = null;
      res.locals.permissoes = [];
    }
    next();
  } catch (e) { next(e); }
}

function requirePermission(...perms) {
  return (req, res, next) => {
    const userPerms = (req.session && req.session.permissoes) ? req.session.permissoes : [];
    const ok = perms.some(p => userPerms.includes(p)); // OU lógico
    if (!ok) {
      return res.status(403).render('errors/403', { requiredPerms: perms });
    }
    next();
  };
}

module.exports = {
  requireAuth,
  attachUserAndPerms,
  requirePermission
};
