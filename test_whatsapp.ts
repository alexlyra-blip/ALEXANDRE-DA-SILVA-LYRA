import { processWhatsAppMessage } from "./lib/whatsapp-agent";
async function run() {
  const result = await processWhatsAppMessage("oi");
  console.log("Result:", result);
}
run();
