<div align="center">
  
  # 🚀 FinançasPro
  
  **O seu controle financeiro pessoal elevado ao próximo nível.**
  
  [![React](https://img.shields.io/badge/React-18-blue?style=for-the-badge&logo=react)](https://reactjs.org/)
  [![Node.js](https://img.shields.io/badge/Node.js-Backend-green?style=for-the-badge&logo=node.js)](https://nodejs.org/)
  [![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Database-blue?style=for-the-badge&logo=postgresql)](https://www.postgresql.org/)
  [![Docker](https://img.shields.io/badge/Docker-Container-blue?style=for-the-badge&logo=docker)](https://www.docker.com/)
  
</div>

<br/>

## 📖 Sobre o Projeto

O **FinançasPro** é uma aplicação Full-Stack desenvolvida para simplificar e automatizar a sua gestão financeira. Com uma interface intuitiva, dashboards responsivos e processos automatizados, o sistema permite que você acompanhe receitas, despesas e a saúde do seu bolso em tempo real.

O projeto já conta com uma infraestrutura em contêineres e um banco de dados robusto. Tudo configurado para uma rápida inicialização e fácil manutenção! 💸

---

## ✨ Principais Funcionalidades

- 🔒 **Autenticação Segura**: Login e cadastro com senhas criptografadas (Bcrypt) e tokens de acesso (JWT).
- 📊 **Dashboard Interativo**: Gráficos visuais modernos (utilizando Recharts) com os saldos atualizados dinamicamente.
- 💰 **Gestão de Transações**: Adicione, edite e remova despesas ou receitas facilmente.
- 📆 **Contas Fixas**: Controle eficiente das suas despesas recorrentes.
- 📄 **Relatórios em PDF**: Gere e exporte extratos da sua conta financeira com apenas um clique (gerados via PDFKit).
- 📧 **Notificações por E-mail**: Alertas e avisos enviados diretamente para sua caixa de entrada usando o Nodemailer.
- 📁 **Importação de Dados**: Suporte para carregar planilhas de transações em massa utilizando arquivos CSV.

---

## 🛠️ Ferramentas e Tecnologias

O **FinançasPro** foi construído utilizando as ferramentas mais populares e potentes do mercado atual:

### 🎨 Frontend
- **[React 18](https://reactjs.org/)**: Biblioteca para criação de interfaces de usuário dinâmicas.
- **[Vite](https://vitejs.dev/)**: Ferramenta de *build* extremamente leve e rápida.
- **[React Router DOM](https://reactrouter.com/)**: Navegação fluida para aplicações *Single Page* (SPA).
- **[Recharts](https://recharts.org/)**: Criação de gráficos interativos e responsivos.
- **[Axios](https://axios-http.com/)**: Cliente HTTP para o consumo inteligente da nossa API REST.

### ⚙️ Backend
- **[Node.js](https://nodejs.org/) & [Express](https://expressjs.com/)**: Construção da API RESTful de forma rápida e escalável.
- **[Prisma ORM](https://www.prisma.io/)**: Mapeamento objeto-relacional tipado, facilitando e assegurando queries com o banco.
- **[PostgreSQL](https://www.postgresql.org/)**: Banco de dados relacional robusto e maduro.
- **[JWT](https://jwt.io/) & [Bcryptjs](https://www.npmjs.com/package/bcryptjs)**: Fundamentais para a camada de autenticação e segurança.
- **[Multer](https://www.npmjs.com/package/multer) & [CSV-Parse](https://csv.js.org/parse/)**: Manipulação e leitura de arquivos para envio de planilhas.
- **[PDFKit](https://pdfkit.org/)**: Renderização de relatórios robustos em formato PDF, processados direto pelo servidor.

### 🐳 Infraestrutura (DevOps)
- **[Docker](https://www.docker.com/)**: Empacotamento das aplicações em contêineres isolados e padronizados.
- **[Docker Compose](https://docs.docker.com/compose/)**: Orquestração simplificada do Banco de Dados, API e Frontend com um simples comando.

---

## 🚀 Como Executar o Projeto Localmente

O projeto está totalmente "dockerizado", ou seja, você não precisa instalar bibliotecas e dependências complicadas diretamente no seu computador!

### 📌 Pré-requisitos
Apenas certifique-se de ter o [Docker](https://www.docker.com/products/docker-desktop/) e o [Docker Compose](https://docs.docker.com/compose/install/) instalados na sua máquina.

### ⚙️ Passo a Passo

1. **Clone o Repositório:**
   ```bash
   git clone https://github.com/rafaelyrds/Propotipo-Career-Boost.git
   cd finance-app
   ```

2. **Inicie a Infraestrutura (Banco, API e Interface):**
   ```bash
   docker compose up --build
   ```

3. **Acesse a Aplicação:**
   - 🌐 **Frontend (Interface):** Acesse [http://localhost:5173](http://localhost:5173) no seu navegador
   - 🔌 **Backend (API):** Rodando na porta [http://localhost:3001](http://localhost:3001)
   - 🗄️ **Banco de Dados:** Acessível localmente na porta `5432`

> **Dica:** Para interromper a execução, pressione `Ctrl + C` no terminal onde os logs estão rodando. Se rodou em "detached mode" (`-d`), use o comando `docker compose down`.

---

## 📂 Arquitetura e Estrutura de Diretórios

```text
📦 finance-app
 ┣ 📂 backend           # Todo o código da API (Rotas, Controladores, Prisma, Serviços)
 ┣ 📂 frontend          # Interface visual do usuário, componentes React e assets
 ┣ 📜 docker-compose.yml # Arquivo mestre de orquestração dos serviços
 ┣ 📜 Dockerfile        # Scripts de automação do Docker para Frontend e Backend
 ┣ 📜 .env              # Variáveis de ambiente secretas
 ┗ 📜 README.md         # Documentação e guia do projeto
```

---

<div align="center">
  Desenvolvido com dedicação 🚀<br/>
  Se gostou do projeto, não se esqueça de deixar uma ⭐!
</div>
