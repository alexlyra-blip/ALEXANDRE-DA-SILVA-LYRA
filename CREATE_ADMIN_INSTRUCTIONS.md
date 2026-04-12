# 🔐 Como Criar um Usuário Admin

## Pré-requisitos

1. **Firebase Admin SDK configurado**: O script usa o Firebase Admin SDK, que precisa de credenciais do Firebase.

2. **Credenciais do Firebase**: Você tem 2 opções:

### Opção 1: Usando Variável de Ambiente (Recomendado)
```bash
# 1. Acesse o Firebase Console
# https://console.firebase.google.com/project/deft-apparatus-477017-c5/settings/serviceaccounts/adminsdk

# 2. Clique em "Gerar nova chave privada" e baixe o JSON

# 3. Salve o arquivo em um local seguro, ex: ~/.firebase-credentials.json

# 4. No Windows, configure a variável de ambiente:
set GOOGLE_APPLICATION_CREDENTIALS=path/to/your-credentials.json

# 5. Ou no PowerShell:
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\Users\alexa\your-credentials.json"
```

### Opção 2: Usar Firebase CLI (Direto no projeto)
Se você já fez `firebase login` e tem o projeto conectado:
```bash
firebase auth:import
```

## Como Usar

### 1. Instale as dependências
```bash
npm install
```

### 2. Execute o script
```bash
# Com ts-node (se instalado)
npx ts-node create-admin.ts

# Ou compilação TypeScript + Node
npx tsc create-admin.ts --lib es2020
node create-admin.js
```

### 3. Preencha os dados solicitados
```
Email do admin: seu@email.com
Senha do admin: senhaSegura123!
Nome completo: Seu Nome
```

## ✅ Resultado
O script criará:
- ✓ Usuário no Firebase Authentication
- ✓ Perfil no Firestore com role "admin"
- ✓ Status "active"

Após isso, você pode fazer login na aplicação com as credenciais fornecidas.

## Alternativa Rápida: Usar Firebase Console

Se preferir uma abordagem manual:
1. Acesse: https://console.firebase.google.com
2. Vá para **Authentication** → **Users**
3. Clique em **Add User**
4. Preencha email e senha
5. Depois vá para **Firestore** → **Collection users** → **Add Document**
6. Crie um documento com ID = UID do usuário e os campos:
   ```json
   {
     "uid": "uid_do_usuario",
     "email": "seu@email.com",
     "name": "Seu Nome",
     "role": "admin",
     "status": "active",
     "createdAt": timestamp
   }
   ```

## Solução de Problemas

### ❌ "Failed to initialize Firebase Admin SDK"
- Verifique se você configurou a variável `GOOGLE_APPLICATION_CREDENTIALS`
- Ou execute `firebase login` e tente novamente

### ❌ "Email already exists"
- O email já foi cadastrado
- Use outro email ou reset a senha no Firebase Console

### ❌ "Permission denied"
- Você não tem permissão para acessar o Firebase
- Faça login com `firebase login` novamente
