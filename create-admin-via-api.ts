#!/usr/bin/env node

/**
 * Script para criar um usuário admin via API
 * Use este script para criar o primeiro admin do sistema
 * 
 * Uso: npx tsx create-admin-via-api.ts
 */

import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
  });
}

async function createAdmin() {
  console.log('\n🔐 Criador de Usuário Admin (via API)\n');
  
  const email = await question('📧 Email do admin: ');
  const password = await question('🔑 Senha do admin: ');
  const name = await question('👤 Nome completo: ');
  const secret = await question('🔐 Admin Creation Secret (do .env.local): ');
  const apiUrl = await question('🌐 URL da API (padrão: http://localhost:3000): ') || 'http://localhost:3000';
  
  if (!email || !password || !name || !secret) {
    console.error('\n❌ Todos os campos são obrigatórios');
    rl.close();
    return;
  }
  
  if (password.length < 6) {
    console.error('\n❌ A senha deve ter pelo menos 6 caracteres');
    rl.close();
    return;
  }
  
  try {
    console.log('\n📝 Criando usuário admin...\n');
    
    const response = await fetch(`${apiUrl}/api/admin/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        name,
        secret,
      }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      console.error('\n❌ Erro ao criar admin:');
      console.error(`   ${data.error || 'Erro desconhecido'}\n`);
      rl.close();
      return;
    }
    
    console.log('\n✅ Admin criado com sucesso!\n');
    console.log(`   📧 Email: ${data.user.email}`);
    console.log(`   👤 Nome: ${data.user.name}`);
    console.log(`   🎯 Role: ${data.user.role}`);
    console.log(`   🆔 UID: ${data.user.uid}`);
    console.log('\n📧 Você pode agora fazer login com este usuário.\n');
    
  } catch (error: any) {
    console.error('\n❌ Erro ao conectar à API:');
    console.error(`   ${error.message || error}`);
    console.error('\n💡 Dicas:');
    console.error('   - Certifique-se de que o servidor está rodando (npm run dev)');
    console.error('   - Verifique se a URL está correta');
    console.error('   - Verifique se o secret está correto no .env.local\n');
  }
  
  rl.close();
}

createAdmin();
