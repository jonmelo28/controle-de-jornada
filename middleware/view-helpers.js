function can(req, perm) {
  const list = (req.session && req.session.permissoes) ? req.session.permissoes : [];
  return list.includes(perm);
}
module.exports = { can };
