# Controle de Jornada (Node.js + EJS + MySQL)

Sistema web para controle de jornadas de trabalho com cadastro de funcionários, registro de ponto, folgas por período, calendário de dias úteis, **relatório avançado** com regras especiais (sábado, feriados, domingo, tolerância) e **exportação em Excel** e **PDF**.

> Projeto em **Node.js + Express + EJS** com **MySQL**. UI com **Bootstrap 5**. Exportações com **ExcelJS** e **Puppeteer**.

---

## ✨ Recursos

- **Funcionários**: cadastro, status ativo/inativo, salário e jornada base (h/dia).
- **Jornadas**: registro e edição (entrada, saída 1º período, retorno, saída 2º período).
- **Folgas por período**: flags independentes para 1º e 2º períodos (S/N).
- **Dias Úteis**: marcação por data (S/N).
- **Relatório Avançado** (`/jornada/relatorio_avancado`):
  - Tabela **diária completa** (lista todos os dias do período, mesmo sem registro).
  - **Resumo lateral**: Horas Trabalhadas, Horas Extras, Horas Restantes, **Saldo (ST)**, Salário Base, Valor da Hora, Valor Hora Extra, Horas Extras em R$, DSR.
  - **Regras**:
    - **Sábado**: jornada base de **4h** (excedente conta como extra).
    - **Feriados**: **todas as horas** entram como **extras**.
    - **Domingo**: dia não útil.
    - **Tolerância**: **5 minutos**.
    - **Folgas parciais**: manhã/tarde (`S`/`N`) respeitadas nos cálculos.
  - **Exportações**:
    - **Excel**: `/jornada/excel?id_funcionario=...&data_inicio=...&data_fim=...` (1 página, paisagem; resumo à direita).
    - **PDF**: `/jornada/pdf?id_funcionario=...&data_inicio=...&data_fim=...` (renderiza a própria EJS em memória; esconde navbar/filtros).

---

## 🧰 Stack

- **Node.js** + **Express**
- **EJS** (views)
- **MySQL** (via `mysql2/promise`)
- **Bootstrap 5**, **Bootstrap Icons**
- **ExcelJS** (XLSX)
- **Puppeteer** (PDF)
- **Day.js**

---

## 📦 Requisitos

- Node.js **18+**
- MySQL **8+**
- (Linux) Dependências de Chromium para o Puppeteer (ex.: `apt-get install -y chromium libnss3 libxss1 fonts-liberation` etc.)

---

## 🚀 Como rodar

```bash
git clone https://github.com/jonmelo28/controle-de-jornada.git
cd controle-de-jornada
npm i
cp .env.example .env   # edite com seus dados
npm run dev            # ou: npm start
# abra http://localhost:3000
```

### Variáveis de ambiente

O projeto usa `dotenv`. Exemplo em **.env.example** (incluído no repositório):

```ini
# App
NODE_ENV=development
PORT=3000
TZ=America/Sao_Paulo
APP_NAME=ControleDeJornada
APP_URL=http://localhost:3000

# Sessão / Auth
SESSION_SECRET=change_this_secret_now

# MySQL
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=changeme
DB_NAME=jornada_db
DB_CONN_LIMIT=10

# Regras
TOLERANCIA_MINUTOS=5
JORNADA_SABADO_HORAS=4

# PDF (Puppeteer)
# Em servers Linux, pode ser preciso apontar o executável do Chromium:
# PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
PUPPETEER_ARGS=--no-sandbox,--disable-setuid-sandbox
PDF_PAGE_SIZE=A4
PDF_LANDSCAPE=true
PDF_MARGIN_TOP=10mm
PDF_MARGIN_RIGHT=10mm
PDF_MARGIN_BOTTOM=10mm
PDF_MARGIN_LEFT=10mm

# Formatação
CURRENCY=BRL
LOCALE=pt-BR
```

---

## 🗄️ Banco de dados (schema mínimo)

> Ajuste conforme seu cenário. Abaixo um esquema **mínimo** para rodar o relatório.

```sql
-- Funcionários
CREATE TABLE funcionarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(120) NOT NULL,
  salario DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  jornada_base DECIMAL(4,2) NOT NULL DEFAULT 8.00, -- horas/dia
  status TINYINT(1) NOT NULL DEFAULT 1
);

-- Jornadas
CREATE TABLE jornadas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_funcionario INT NOT NULL,
  data DATE NOT NULL,
  entrada TIME NULL,
  saida_intervalo TIME NULL,
  retorno_intervalo TIME NULL,
  saida TIME NULL,
  CONSTRAINT fk_j_funcionario
    FOREIGN KEY (id_funcionario) REFERENCES funcionarios(id)
);

-- Dias úteis (S/N)
CREATE TABLE dias_uteis (
  id INT AUTO_INCREMENT PRIMARY KEY,
  data DATE NOT NULL UNIQUE,
  eh_util ENUM('S','N') NOT NULL DEFAULT 'S'
);

-- Folgas por período
CREATE TABLE folgas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_funcionario INT NOT NULL,
  data DATE NOT NULL,
  folga_primeiro_periodo CHAR(1) DEFAULT 'N', -- 'S' ou 'N'
  folga_segundo_periodo CHAR(1) DEFAULT 'N',
  UNIQUE KEY (id_funcionario, data),
  FOREIGN KEY (id_funcionario) REFERENCES funcionarios(id)
);
```

---

## 📁 Estrutura (simplificada)

```
/routes
  jornada.js
/utils
  calculos.js
  relatorio.js
/views
  layout.ejs
  relatorio_estilo_planilha.ejs
  registrar_jornada.ejs
  editar_jornada.ejs
/public
  /images
  /css
```

---

## 🔢 Cálculos & regras

- Implementados em `/utils/calculos.js` (horas trabalhadas, extras, restantes) e `/utils/relatorio.js` (montagem diária + resumo).
- **Sábado**: jornada base **4h**.
- **Feriados**: toda hora registrada é **extra**.
- **Domingo**: considerado **não útil**.
- **Tolerância**: **5 minutos**.
- **Folgas**: `folga_primeiro_periodo` e `folga_segundo_periodo` com `'S'`/`'N'`.
- **DSR**: `(((saldoHoras * valorHoraExtra) / diasUteis) * diasNaoUteis)`  
  (Saldo em horas decimais; `valorHoraExtra = valorHora + 50%`).

---

## 📊 Relatórios & Exportação

- **Relatório Avançado**: `GET /jornada/relatorio_avancado?id_funcionario=1&data_inicio=YYYY-MM-DD&data_fim=YYYY-MM-DD`
- **Exportar Excel**: `GET /jornada/excel?id_funcionario=1&data_inicio=YYYY-MM-DD&data_fim=YYYY-MM-DD`
  - Página **paisagem**, `fitToPage` 1x1, resumo **à direita**.
- **Exportar PDF**: `GET /jornada/pdf?id_funcionario=1&data_inicio=YYYY-MM-DD&data_fim=YYYY-MM-DD`
  - Renderização da **view EJS em memória** (`ejs.renderFile`) e impressão via **Puppeteer**.
  - Usa flag `hideControls` + `.no-print` para ocultar navbar/filtros/botões.
  - CSS `@media print` para caber em **1 página**.

---

## 🧷 Dicas de produção

- Defina `PUPPETEER_EXECUTABLE_PATH` apontando para Chromium/Chrome no servidor.
- Mantenha `--no-sandbox` se o ambiente não permitir sandbox.
- Verifique a **timezone** (`TZ`) para consistência de datas.

---

## 🩹 Troubleshooting

- **Excel vazio**: normalize datas (`YYYY-MM-DD`) antes da query; confira mapeamento dos campos ao escrever as linhas no Excel.
- **PDF “Falha ao carregar”**: a rota pode ter retornado HTML/erro. Aqui usamos `renderFile → setContent → pdf()`, que evita isso.
- **[object Promise]** no PDF: não usar `async: true` no `renderFile` sem `await` nos includes; resolva valores no controller e passe strings prontas.
- **Navbar no PDF**: passe `hideControls: true` e adicione `d-none`/`.no-print` na `<nav>`.

---

## 📜 Licença

MIT — use e adapte livremente.
