import { processWhatsAppMessage } from "../lib/whatsapp-agent";

async function test() {
  console.log("--- TESTE GUTTO REGRAS ---");
  
  // Test case 1: General greeting
  const resGreeting = await processWhatsAppMessage("oi");
  console.log("\n[oi]:", resGreeting);

  // Test case 2: Rules match for a bank (using various keyword matches)
  const resRules1 = await processWhatsAppMessage("Qual o roteiro do Bradesco?");
  console.log("\n[roteiro do Bradesco]:\n", resRules1);

  const resRules2 = await processWhatsAppMessage("me passa o resumo do itau");
  console.log("\n[resumo do itau]:\n", resRules2);

  const resRules3 = await processWhatsAppMessage("Quais são as regras de portabilidade do Banco Pan?");
  console.log("\n[regras de portabilidade do Banco Pan]:\n", resRules3);

  const resRules4 = await processWhatsAppMessage("roteiro do banco inexistente");
  console.log("\n[banco inexistente]:\n", resRules4);
}

test().catch(console.error);
