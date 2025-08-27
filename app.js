
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const { attachUserAndPerms } = require('./middleware/auth');
const { can } = require('./middleware/view-helpers');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'segredo_super_secreto',
  resave: false,
  saveUninitialized: false
}));

app.use(attachUserAndPerms);

app.use((req, res, next) => {
  res.locals.can = (perm) => can(req, perm);
  next();
});

const funcoesRouter = require('./routes/funcoes');
app.use('/funcoes', funcoesRouter);

const permissoesRouter = require('./routes/permissoes');
app.use('/permissoes', permissoesRouter);

const authRoutes = require('./routes/auth');
app.use('/auth', authRoutes);

const funcionariosRoutes = require('./routes/funcionarios');
app.use('/funcionarios', funcionariosRoutes);

const usuariosRoutes = require('./routes/usuarios');
app.use('/usuarios', usuariosRoutes);

const horariosRoutes = require('./routes/horarios');
app.use('/horarios', horariosRoutes);

const jornadaRoutes = require('./routes/jornada');
app.use('/jornada', jornadaRoutes);

const diasUteisRouter = require('./routes/dias_uteis');
app.use('/dias-uteis', diasUteisRouter);

const folgasRouter = require('./routes/folgas');
app.use('/folgas', folgasRouter);

const pagamentosRoutes = require('./routes/pagamentos');
app.use('/pagamentos', pagamentosRoutes);

const relatoriosRoutes = require('./routes/relatorios');
app.use('/relatorios', relatoriosRoutes);

const relatorioSaldoRoutes = require('./routes/relatorio_saldo');
app.use('/relatorio_saldo', relatorioSaldoRoutes);

const descontarRoutes = require('./routes/descontar');
app.use('/descontar', descontarRoutes);

app.get('/', (req, res) => {
  res.redirect('/auth/login');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
