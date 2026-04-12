# 🔐 Criar Usuário Admin - Guia Rápido

Criei 3 formas para você criar um usuário admin. Escolha a mais fácil para você:

## ⚡ Opção 1: Usando a API (RECOMENDADO)

### Passo 1: Configure o secret
Edite `.env.local` e mude a linha:
```
ADMIN_CREATION_SECRET=seu-secret-seguro-aqui
```

Para algo seguro como:
```
ADMIN_CREATION_SECRET=MeuSecretSuperSeguro2024!@#
```

### Passo 2: Inicie o servidor
```bash
npm run dev
```

### Passo 3: Execute o script
Em outro terminal:
```bash
npx tsx create-admin-via-api.ts
```

Siga as instruções:
- Email: seu@email.com
- Senha: umaSenha123!
- Nome: Seu Nome
- Admin Creation Secret: (a chave que você configurou no passo 1)
- URL da API: http://localhost:3000 (padrão)

✅ Pronto! Você pode fazer login imediatamente.

---

## 🔓 Opção 2: Usando Firebase Admin SDK

### Pré-requisitos
Você precisa das credenciais do Firebase Admin.

### Passo 1: Obtenha as credenciais
1. Acesse: https://console.firebase.google.com
2. Projeto: `deft-apparatus-477017-c5`
3. ⚙️ Configurações → **Contas de serviço**
4. Clique: **Gerar nova chave privada**
5. Salve o JSON em local seguro

### Passo 2: Configure a variável de ambiente
**No Windows (PowerShell):**
```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\caminho\para\seu-credentials.json"
```

**No Windows (CMD):**
```cmd
set GOOGLE_APPLICATION_CREDENTIALS=C:\caminho\para\seu-credentials.json
```

**No Linux/Mac:**
```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/seu-credentials.json"
```

### Passo 3: Execute o script
```bash
npx ts-node create-admin.ts
```

Ou compile e rode:
```bash
npx tsc create-admin.ts
node create-admin.js
```

---

## 🌐 Opção 3: Criar via cURL (para avançados)

```bash
curl -X POST http://localhost:3000/api/admin/create \
  -H "Content-Type: application/json" \
  -d '{
    "email": "seu@email.com",
    "password": "senhaSegura123",
    "name": "Seu Nome",
    "secret": "MeuSecretSuperSeguro2024!@#"
  }'
```

---

## ✅ Próximos Passos

1. Após criar o admin, acesse: http://localhost:3000
2. Faça login com o email e senha que você criou
3. Pronto! Você tem acesso à area de admin

## 🆘 Dúvidas?

### Erro: "Secret inválido"
- Você esqueceu de configurar o `ADMIN_CREATION_SECRET` no `.env.local`
- Ou está usando o secret errado
- Verifique exatamente o valor que você configurou

### Erro: "Email já existe"
- Este email já foi cadastrado
- Use outro email ou delete o usuário no Firebase Console

### A API não responde
- O servidor está rodando? Execute `npm run dev`
- A URL está correta?
- Verifique se há erros no console

---

## ⚠️ Segurança

- **Mude o secret** antes de colocar em produção
- **Nunca compartilhe** suas credenciais do Firebase
- **Guarde os secrets** em um local seguro
- Considere usar um `.env.local` (já ignorado no .gitignore)
